"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";
import { Check, Crosshair, MapPin, Minus, Pentagon, Plus, RotateCcw, Search, Trash2, Undo2, X } from "lucide-react";
import { MapLayersPanel, type ViewLayer } from "@/components/map-layers-panel";
import { RegionDialog, TONE_CLASS } from "@/components/region-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { EntryKind } from "@/db/schema";
import { centroid, pointInPolygon, validatePolygon, type Point } from "@/lib/map-geometry";
import { KIND_ICONS } from "@/lib/section-icons";
import { cn } from "@/lib/utils";

export type ViewPin = {
  id: string;
  x: number;
  y: number;
  label: string | null;
  layerId: string | null;
  /** Another map this pin opens (a city's own map). */
  childMap: { slug: string; name: string } | null;
  entry: { id: string; slug: string; name: string; kind: EntryKind; summary: string };
};

export type ViewRegion = {
  id: string;
  name: string;
  points: [number, number][];
  tone: string;
  layerId: string | null;
  /** The page it is linked to; null for a region only the DM can see. */
  entry: { id: string; slug: string; name: string; kind: EntryKind; summary: string } | null;
};

export type MapChoice = { id: string; slug: string; name: string };

type View = { scale: number; tx: number; ty: number };
type Found = { id: string; slug: string; name: string; kind: string; summary: string };

const MIN_SCALE = 1;
const MAX_SCALE = 8;
const BUTTON_ZOOM = 1.4;
const WHEEL_ZOOM = 1.15;
const PAN_FRACTION = 0.12;
const CLICK_SLOP_PX = 6;
const SEARCH_DELAY_MS = 160;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Keeps the picture covering the frame: you can zoom and pan, never drag it off into empty space. */
function constrain(v: View, w: number, h: number): View {
  const scale = clamp(v.scale, MIN_SCALE, MAX_SCALE);
  return { scale, tx: clamp(v.tx, w - w * scale, 0), ty: clamp(v.ty, h - h * scale, 0) };
}

/**
 * A pan-and-zoom map with pins and regions. Pins and regions arrive already filtered for this viewer by
 * the server, so nothing here decides who may see what. Coordinates are fractions of the image, so they
 * hold at any size and zoom. Drag, wheel, pinch and the keyboard (+ - 0 and the arrows) all drive the same
 * view state. Layers only show and hide what the viewer was already sent.
 */
export function MapViewer({
  slug,
  name,
  imagePath,
  width,
  height,
  pins,
  regions,
  layers,
  mapChoices,
  isDM,
}: {
  slug: string;
  name: string;
  imagePath: string;
  width: number;
  height: number;
  pins: ViewPin[];
  regions: ViewRegion[];
  layers: ViewLayer[];
  /** The other registered maps a pin could open (DM only needs them). */
  mapChoices: MapChoice[];
  isDM: boolean;
}) {
  const router = useRouter();
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;

  // Layers a viewer has switched off. What is on them is still in the page: this only hides it.
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(layers.filter((l) => !l.defaultOn).map((l) => l.id)));
  const onLayer = (layerId: string | null) => !layerId || !hidden.has(layerId);
  const visiblePins = pins.filter((p) => onLayer(p.layerId));
  const visibleRegions = regions.filter((r) => onLayer(r.layerId));

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState<Point[]>([]);
  const [drawError, setDrawError] = useState<string | null>(null);
  const [regionPoints, setRegionPoints] = useState<Point[] | null>(null);
  const selected = visiblePins.find((p) => p.id === selectedId) ?? null;
  const selectedRegion = visibleRegions.find((r) => r.id === selectedRegionId) ?? null;

  // ---- Applying the view: DOM writes, not inline style objects. ----
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`;
    // Pins and region names keep a constant size however far you zoom.
    for (const el of stage.querySelectorAll<HTMLElement>("[data-pin-anchor]")) {
      el.style.transform = `translate(-50%, -100%) scale(${1 / view.scale})`;
    }
    for (const el of stage.querySelectorAll<HTMLElement>("[data-label-anchor]")) {
      el.style.transform = `translate(-50%, -50%) scale(${1 / view.scale})`;
    }
  }, [view, visiblePins, visibleRegions, pending, hidden]);

  const frame = useCallback(() => {
    const el = viewportRef.current;
    return el ? { w: el.clientWidth, h: el.clientHeight } : { w: 1, h: 1 };
  }, []);

  const zoomAt = useCallback(
    (factor: number, cx: number, cy: number) => {
      const { w, h } = frame();
      setView((v) => {
        const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
        const ratio = scale / v.scale;
        return constrain({ scale, tx: cx - (cx - v.tx) * ratio, ty: cy - (cy - v.ty) * ratio }, w, h);
      });
    },
    [frame],
  );

  const panBy = useCallback(
    (dx: number, dy: number) => {
      const { w, h } = frame();
      setView((v) => constrain({ ...v, tx: v.tx + dx, ty: v.ty + dy }, w, h));
    },
    [frame],
  );

  const zoomCentre = (factor: number) => {
    const { w, h } = frame();
    zoomAt(factor, w / 2, h / 2);
  };

  // The wheel has to be a non-passive native listener so the page does not scroll as well.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? WHEEL_ZOOM : 1 / WHEEL_ZOOM, e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // ---- Pointer: one pointer pans (or places a pin, or adds a corner), two pointers pinch. ----
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ start: View; startPoint: { x: number; y: number }; moved: boolean; pinch?: { dist: number; mid: { x: number; y: number } } } | null>(null);

  function local(e: { clientX: number; clientY: number }) {
    const rect = viewportRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  /** The spot on the image, as fractions, that a pointer event landed on. */
  function onImage(e: { clientX: number; clientY: number }): Point | null {
    if (!stageRef.current) return null;
    const rect = stageRef.current.getBoundingClientRect();
    return [clamp((e.clientX - rect.left) / rect.width, 0, 1), clamp((e.clientY - rect.top) / rect.height, 0, 1)];
  }

  /** The topmost visible region that contains a spot (the last one drawn is on top). */
  function regionAt(p: Point): ViewRegion | null {
    for (let i = visibleRegions.length - 1; i >= 0; i--) if (pointInPolygon(p, visibleRegions[i].points)) return visibleRegions[i];
    return null;
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("[data-pin], [data-map-control]")) return;
    try {
      viewportRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // Not an active pointer (a synthetic or already-ended one): gestures still work without capture.
    }
    pointers.current.set(e.pointerId, local(e));
    const pts = [...pointers.current.values()];
    if (pts.length === 1) {
      gesture.current = { start: viewRef.current, startPoint: pts[0], moved: false };
    } else if (pts.length === 2 && gesture.current) {
      const [a, b] = pts;
      gesture.current = {
        start: viewRef.current,
        startPoint: gesture.current.startPoint,
        moved: true,
        pinch: { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } },
      };
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, local(e));
    const pts = [...pointers.current.values()];
    const { w, h } = frame();
    const g = gesture.current;
    if (pts.length >= 2 && g.pinch) {
      const [a, b] = pts;
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const scale = clamp(g.start.scale * (dist / g.pinch.dist), MIN_SCALE, MAX_SCALE);
      // The map point that was under the first midpoint stays under the current one.
      const px = (g.pinch.mid.x - g.start.tx) / g.start.scale;
      const py = (g.pinch.mid.y - g.start.ty) / g.start.scale;
      setView(constrain({ scale, tx: mid.x - px * scale, ty: mid.y - py * scale }, w, h));
      return;
    }
    if (pts.length === 1) {
      const dx = pts[0].x - g.startPoint.x;
      const dy = pts[0].y - g.startPoint.y;
      if (!g.moved && Math.hypot(dx, dy) < CLICK_SLOP_PX) return;
      g.moved = true;
      setView(constrain({ ...g.start, tx: g.start.tx + dx, ty: g.start.ty + dy }, w, h));
    }
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    const wasOnly = pointers.current.size === 1;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) gesture.current = null;
    else if (g) g.pinch = undefined;
    if (!g || !wasOnly || g.moved) return;
    const spot = onImage(e);
    // A tap that did not drag: place a pin or add a corner (DM, in that mode), open a region it is inside, or dismiss the preview.
    if (placing && isDM && spot) {
      setPending({ x: spot[0], y: spot[1] });
    } else if (drawing && isDM && spot) {
      setDrawError(null);
      setDraft((d) => [...d, spot]);
    } else {
      const hit = spot ? regionAt(spot) : null;
      setSelectedId(null);
      setSelectedRegionId(hit ? hit.id : null);
    }
  }

  function finishDrawing() {
    const problems = validatePolygon(draft);
    if (problems.length > 0) {
      setDrawError(problems.join(" "));
      return;
    }
    setDrawError(null);
    setRegionPoints(draft);
  }

  function cancelDrawing() {
    setDrawing(false);
    setDraft([]);
    setDrawError(null);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("[data-pin], [data-map-control]")) return;
    const { w, h } = frame();
    switch (e.key) {
      case "+":
      case "=":
        zoomCentre(BUTTON_ZOOM);
        break;
      case "-":
      case "_":
        zoomCentre(1 / BUTTON_ZOOM);
        break;
      case "0":
        setView({ scale: 1, tx: 0, ty: 0 });
        break;
      case "ArrowLeft":
        panBy(w * PAN_FRACTION, 0);
        break;
      case "ArrowRight":
        panBy(-w * PAN_FRACTION, 0);
        break;
      case "ArrowUp":
        panBy(0, h * PAN_FRACTION);
        break;
      case "ArrowDown":
        panBy(0, -h * PAN_FRACTION);
        break;
      case "Enter":
        if (!drawing) return;
        finishDrawing();
        break;
      case "Backspace":
      case "Delete":
        if (!drawing) return;
        setDraft((d) => d.slice(0, -1));
        setDrawError(null);
        break;
      case "Escape":
        setSelectedId(null);
        setSelectedRegionId(null);
        setPlacing(false);
        if (drawing) cancelDrawing();
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  // ---- DM: choosing what the new pin points at. ----
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [chosen, setChosen] = useState<Found | null>(null);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchId = useRef(0);

  useEffect(() => {
    if (!pending || query.trim().length < 2) {
      setFound([]);
      return;
    }
    const id = ++searchId.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/find?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (id === searchId.current) setFound(data.results ?? []);
      } catch {
        if (id === searchId.current) setFound([]);
      }
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query, pending]);

  function closePlacement() {
    setPending(null);
    setQuery("");
    setFound([]);
    setChosen(null);
    setLabel("");
    setError(null);
  }

  async function savePin() {
    if (!pending || !chosen) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/maps/${slug}/pins`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entryId: chosen.id, x: pending.x, y: pending.y, label: label.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "The pin could not be saved.");
        return;
      }
      toast.success(`Pinned ${chosen.name}`);
      closePlacement();
      setPlacing(false);
      router.refresh();
    } catch {
      setError("The pin could not be saved. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function removePin(pin: ViewPin) {
    try {
      const res = await fetch(`/api/maps/${slug}/pins/${pin.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("failed");
      toast.success(`Removed the pin for ${pin.entry.name}`);
      setSelectedId(null);
      router.refresh();
    } catch {
      toast.error("The pin could not be removed. Try again.");
    }
  }

  async function patch(url: string, body: Record<string, unknown>, done: string) {
    try {
      const res = await fetch(url, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast.error(data?.error ?? "That change could not be saved.");
        return;
      }
      toast.success(done);
      router.refresh();
    } catch {
      toast.error("That change could not be saved. Check your connection and try again.");
    }
  }

  async function removeRegion(region: ViewRegion) {
    try {
      const res = await fetch(`/api/maps/${slug}/regions/${region.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("failed");
      toast.success(`Removed the region ${region.name}`);
      setSelectedRegionId(null);
      router.refresh();
    } catch {
      toast.error("The region could not be removed. Try again.");
    }
  }

  const SelectedIcon = selected ? (KIND_ICONS[selected.entry.kind] ?? MapPin) : MapPin;
  const RegionIcon = selectedRegion?.entry ? (KIND_ICONS[selectedRegion.entry.kind] ?? MapPin) : Pentagon;
  const polygonText = (pts: Point[] | [number, number][]) => pts.map((p) => `${p[0]},${p[1]}`).join(" ");
  const showPreview = selected || selectedRegion;

  return (
    <div>
      <div className="no-print mb-3 flex flex-wrap items-center gap-2" role="toolbar" aria-label="Map controls">
        <Button type="button" variant="outline" size="sm" data-map-control onClick={() => zoomCentre(BUTTON_ZOOM)} aria-label="Zoom in">
          <Plus aria-hidden="true" />
        </Button>
        <Button type="button" variant="outline" size="sm" data-map-control onClick={() => zoomCentre(1 / BUTTON_ZOOM)} aria-label="Zoom out">
          <Minus aria-hidden="true" />
        </Button>
        <Button type="button" variant="outline" size="sm" data-map-control onClick={() => setView({ scale: 1, tx: 0, ty: 0 })} aria-label="Reset view">
          <RotateCcw aria-hidden="true" />
        </Button>
        {isDM && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-map-control
            aria-pressed={placing}
            onClick={() => {
              setPlacing((v) => !v);
              setSelectedId(null);
              setSelectedRegionId(null);
              if (drawing) cancelDrawing();
            }}
            className={cn(placing && "border-primary text-gold")}
          >
            <Crosshair aria-hidden="true" />
            {placing ? "Click the map to place" : "Place a pin"}
          </Button>
        )}
        {isDM && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-map-control
            data-testid="draw-region"
            aria-pressed={drawing}
            onClick={() => {
              if (drawing) cancelDrawing();
              else {
                setDrawing(true);
                setPlacing(false);
                setSelectedId(null);
                setSelectedRegionId(null);
              }
            }}
            className={cn(drawing && "border-primary text-gold")}
          >
            <Pentagon aria-hidden="true" />
            {drawing ? "Click the corners" : "Draw a region"}
          </Button>
        )}
        {isDM && drawing && (
          <>
            <Button type="button" size="sm" data-map-control data-testid="finish-region" onClick={finishDrawing} disabled={draft.length < 3}>
              <Check aria-hidden="true" />
              Finish ({draft.length} {draft.length === 1 ? "point" : "points"})
            </Button>
            <Button type="button" variant="outline" size="sm" data-map-control data-testid="undo-point" onClick={() => setDraft((d) => d.slice(0, -1))} disabled={draft.length === 0}>
              <Undo2 aria-hidden="true" />
              Undo point
            </Button>
            <Button type="button" variant="ghost" size="sm" data-map-control data-testid="cancel-region" onClick={cancelDrawing}>
              Cancel
            </Button>
          </>
        )}
        <span className="text-[13px] text-muted-foreground" data-testid="map-zoom">
          {Math.round(view.scale * 100)}%
        </span>
      </div>

      {drawError && (
        <p role="alert" className="mb-2 text-sm text-destructive" data-testid="draw-error">
          {drawError}
        </p>
      )}

      <MapLayersPanel
        slug={slug}
        layers={layers}
        hidden={hidden}
        isDM={isDM}
        onToggle={(id, on) =>
          setHidden((cur) => {
            const next = new Set(cur);
            if (on) next.delete(id);
            else next.add(id);
            return next;
          })
        }
      />

      <div className="relative">
        <div
          ref={viewportRef}
          role="application"
          aria-label={`Map of ${name}. Use plus and minus to zoom and the arrow keys to move.`}
          tabIndex={0}
          data-testid="map-viewport"
          data-scale={view.scale.toFixed(3)}
          data-tx={Math.round(view.tx)}
          data-ty={Math.round(view.ty)}
          data-placing={placing}
          data-drawing={drawing}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          className={cn(
            "relative w-full touch-none select-none overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/10 outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
            placing || drawing ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing",
          )}
        >
          <div ref={stageRef} data-testid="map-stage" className="relative origin-top-left will-change-transform">
            {/* A plain img: the map is a large static asset, not something to resize or optimise per request. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagePath} alt={`Map of ${name}`} width={width} height={height} draggable={false} className="block h-auto w-full" />

            {/* Regions are drawn over the picture; which one a tap is inside is worked out from its corners, not from the pointer's target. */}
            <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full" aria-hidden="true" focusable="false" data-testid="map-regions">
              {visibleRegions.map((r) => (
                <polygon
                  key={r.id}
                  data-region={r.id}
                  points={polygonText(r.points)}
                  vectorEffect="non-scaling-stroke"
                  strokeWidth={r.id === selectedRegionId ? 4 : 2}
                  className={cn(TONE_CLASS[r.tone] ?? TONE_CLASS["1"])}
                />
              ))}
              {draft.length > 0 && (
                <g data-testid="draft">
                  {draft.length >= 3 && <polygon points={polygonText(draft)} vectorEffect="non-scaling-stroke" strokeWidth={2} className="fill-primary/15 stroke-primary" strokeDasharray="6 4" />}
                  {draft.length < 3 && <polyline points={polygonText(draft)} vectorEffect="non-scaling-stroke" strokeWidth={2} className="fill-none stroke-primary" strokeDasharray="6 4" />}
                  {draft.map((p, i) => (
                    <circle key={i} cx={p[0]} cy={p[1]} r={0.004} className="fill-primary" data-draft-point={i} />
                  ))}
                </g>
              )}
            </svg>

            {visibleRegions.map((r) => {
              const [cx, cy] = centroid(r.points as Point[]);
              return (
                <div
                  key={r.id}
                  data-label-anchor
                  aria-hidden="true"
                  className="pointer-events-none absolute max-w-48 origin-center truncate whitespace-nowrap rounded bg-background/75 px-1.5 text-[11px] font-medium text-foreground"
                  ref={(el) => {
                    if (el) {
                      el.style.left = `${cx * 100}%`;
                      el.style.top = `${cy * 100}%`;
                    }
                  }}
                >
                  {r.name}
                </div>
              );
            })}

            {visiblePins.map((pin) => (
              <div
                key={pin.id}
                data-pin-anchor
                className="absolute origin-bottom"
                ref={(el) => {
                  if (el) {
                    el.style.left = `${pin.x * 100}%`;
                    el.style.top = `${pin.y * 100}%`;
                  }
                }}
              >
                <Button
                  type="button"
                  size="icon"
                  data-pin
                  data-pin-entry={pin.entry.slug}
                  aria-label={`${pin.label || pin.entry.name}, ${pin.entry.kind}`}
                  aria-expanded={selectedId === pin.id}
                  onClick={() => {
                    if (placing || drawing) return;
                    setSelectedRegionId(null);
                    setSelectedId((cur) => (cur === pin.id ? null : pin.id));
                  }}
                  className={cn("size-8 rounded-full shadow-md ring-2 ring-background", selectedId === pin.id && "ring-4 ring-ring")}
                >
                  <MapPin aria-hidden="true" className="size-4" />
                </Button>
              </div>
            ))}

            {pending && (
              <div
                data-pin-anchor
                data-testid="pending-pin"
                className="pointer-events-none absolute origin-bottom text-gold"
                ref={(el) => {
                  if (el) {
                    el.style.left = `${pending.x * 100}%`;
                    el.style.top = `${pending.y * 100}%`;
                  }
                }}
              >
                <MapPin aria-hidden="true" className="size-8 fill-current" />
              </div>
            )}
          </div>
        </div>

        {showPreview && (
          <section
            aria-label={selected ? "Pin preview" : "Region preview"}
            data-map-control
            className="z-10 mt-3 rounded-xl bg-card p-4 text-card-foreground shadow-lg ring-1 ring-foreground/15 sm:absolute sm:inset-x-3 sm:bottom-3 sm:max-w-sm"
          >
            {selected && (
              <>
                <div className="flex items-start gap-3">
                  <SelectedIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-gold" />
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-lg font-bold leading-tight">{selected.entry.name}</h2>
                    {selected.label && selected.label !== selected.entry.name && <p className="text-[13px] text-faint-foreground">{selected.label}</p>}
                    {selected.entry.summary && <p className="mt-1 text-sm text-muted-foreground">{selected.entry.summary}</p>}
                  </div>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Close preview" onClick={() => setSelectedId(null)}>
                    <X aria-hidden="true" />
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild size="sm">
                    <Link href={`/codex/entry/${selected.entry.slug}`}>Open page</Link>
                  </Button>
                  {selected.childMap && (
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/map/${selected.childMap.slug}`} data-testid="open-child-map">
                        Open the map of {selected.childMap.name}
                      </Link>
                    </Button>
                  )}
                  {isDM && (
                    <Button type="button" variant="outline" size="sm" onClick={() => removePin(selected)}>
                      <Trash2 aria-hidden="true" />
                      Remove pin
                    </Button>
                  )}
                </div>
                {isDM && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="grid gap-1">
                      <Label htmlFor="pin-layer">Layer</Label>
                      <NativeSelect id="pin-layer" value={selected.layerId ?? ""} onChange={(e) => patch(`/api/maps/${slug}/pins/${selected.id}`, { layerId: e.target.value || null }, "Layer changed")}>
                        <NativeSelectOption value="">No layer</NativeSelectOption>
                        {layers.map((l) => (
                          <NativeSelectOption key={l.id} value={l.id}>
                            {l.name}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor="pin-child">Opens another map</Label>
                      <NativeSelect
                        id="pin-child"
                        value={mapChoices.find((c) => c.slug === selected.childMap?.slug)?.id ?? ""}
                        onChange={(e) => patch(`/api/maps/${slug}/pins/${selected.id}`, { childMapId: e.target.value || null }, e.target.value ? "This pin now opens that map" : "This pin no longer opens a map")}
                      >
                        <NativeSelectOption value="">No other map</NativeSelectOption>
                        {mapChoices.map((c) => (
                          <NativeSelectOption key={c.id} value={c.id}>
                            {c.name}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </div>
                  </div>
                )}
              </>
            )}

            {!selected && selectedRegion && (
              <>
                <div className="flex items-start gap-3">
                  <RegionIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-gold" />
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-lg font-bold leading-tight" data-testid="region-title">
                      {selectedRegion.name}
                    </h2>
                    {selectedRegion.entry && selectedRegion.entry.name !== selectedRegion.name && <p className="text-[13px] text-faint-foreground">{selectedRegion.entry.name}</p>}
                    {selectedRegion.entry?.summary && <p className="mt-1 text-sm text-muted-foreground">{selectedRegion.entry.summary}</p>}
                    {!selectedRegion.entry && <p className="mt-1 text-sm text-muted-foreground">Not linked to a page: only you can see this region.</p>}
                  </div>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Close preview" onClick={() => setSelectedRegionId(null)}>
                    <X aria-hidden="true" />
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedRegion.entry && (
                    <Button asChild size="sm">
                      <Link href={`/codex/entry/${selectedRegion.entry.slug}`} data-testid="open-region-page">
                        Open page
                      </Link>
                    </Button>
                  )}
                  {isDM && (
                    <Button type="button" variant="outline" size="sm" onClick={() => removeRegion(selectedRegion)}>
                      <Trash2 aria-hidden="true" />
                      Remove region
                    </Button>
                  )}
                </div>
                {isDM && (
                  <div className="mt-3 grid gap-1">
                    <Label htmlFor="region-layer-change">Layer</Label>
                    <NativeSelect id="region-layer-change" value={selectedRegion.layerId ?? ""} onChange={(e) => patch(`/api/maps/${slug}/regions/${selectedRegion.id}`, { layerId: e.target.value || null }, "Layer changed")}>
                      <NativeSelectOption value="">No layer</NativeSelectOption>
                      {layers.map((l) => (
                        <NativeSelectOption key={l.id} value={l.id}>
                          {l.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </div>

      <p className="mt-2 text-[13px] text-muted-foreground">
        Drag or use the arrow keys to move, scroll, pinch or press + and − to zoom, 0 to reset. Tap inside a region to open it.
        {isDM ? " Choose Place a pin, then click the map; or Draw a region, click its corners, and press Finish (or Enter)." : ""}
      </p>

      {visiblePins.length > 0 && (
        <section className="mt-6" aria-labelledby="map-places">
          <h2 id="map-places" className="mb-2 text-xs font-semibold uppercase tracking-[0.07em] text-muted-foreground">
            On this map ({visiblePins.length})
          </h2>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {visiblePins.map((pin) => (
              <li key={pin.id}>
                <Link href={`/codex/entry/${pin.entry.slug}`} className="text-link underline-offset-4 hover:underline">
                  {pin.label || pin.entry.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {visibleRegions.length > 0 && (
        <section className="mt-6" aria-labelledby="map-region-list">
          <h2 id="map-region-list" className="mb-2 text-xs font-semibold uppercase tracking-[0.07em] text-muted-foreground">
            Regions ({visibleRegions.length})
          </h2>
          <ul className="grid gap-1 text-sm sm:grid-cols-2" data-testid="map-regions-list">
            {visibleRegions.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto min-w-0 max-w-full shrink whitespace-normal p-0 text-left"
                  aria-pressed={selectedRegionId === r.id}
                  onClick={() => {
                    setSelectedId(null);
                    setSelectedRegionId((cur) => (cur === r.id ? null : r.id));
                  }}
                >
                  {r.name}
                </Button>
                {r.entry ? (
                  <Link href={`/codex/entry/${r.entry.slug}`} className="text-[13px] text-muted-foreground underline-offset-4 hover:underline">
                    {r.entry.name}
                  </Link>
                ) : (
                  <span className="text-[13px] text-muted-foreground">only you can see this</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <RegionDialog
        slug={slug}
        points={regionPoints}
        layers={layers}
        onClose={() => setRegionPoints(null)}
        onSaved={() => {
          setRegionPoints(null);
          setDraft([]);
          setDrawing(false);
        }}
      />

      <Dialog open={pending !== null} onOpenChange={(open) => !open && closePlacement()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pin an entry here</DialogTitle>
            <DialogDescription>
              {pending ? `At ${(pending.x * 100).toFixed(1)}% across and ${(pending.y * 100).toFixed(1)}% down.` : ""} Search for the page this pin should open.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setChosen(null);
                }}
                placeholder="Find a city, site, wild…"
                aria-label="Find the entry to pin"
                className="pl-9"
              />
            </div>
            {chosen ? (
              <p className="text-sm" data-testid="chosen-entry">
                Pinning <strong>{chosen.name}</strong>
              </p>
            ) : (
              <ul className="grid max-h-48 gap-1 overflow-y-auto" aria-label="Matching entries">
                {found.map((f) => (
                  <li key={f.id}>
                    <Button type="button" variant="ghost" className="h-auto w-full justify-start gap-2 py-2 text-left font-normal" onClick={() => setChosen(f)}>
                      <span className="font-medium">{f.name}</span>
                      <span className="text-[11px] uppercase tracking-[0.06em] text-faint-foreground">{f.kind}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="pin-label">Label (optional)</Label>
              <Input id="pin-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} placeholder="Shown instead of the page name" />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closePlacement}>
              Cancel
            </Button>
            <Button type="button" onClick={savePin} disabled={!chosen || saving}>
              {saving ? "Saving…" : "Save pin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
