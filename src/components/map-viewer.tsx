"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";
import { Crosshair, MapPin, Minus, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EntryKind } from "@/db/schema";
import { KIND_ICONS } from "@/lib/section-icons";
import { cn } from "@/lib/utils";

export type ViewPin = {
  id: string;
  x: number;
  y: number;
  label: string | null;
  entry: { id: string; slug: string; name: string; kind: EntryKind; summary: string };
};

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
 * A pan-and-zoom map with pins. Pins arrive already filtered for this viewer by
 * the server, so nothing here decides who may see what. Pin coordinates are
 * fractions of the image, so they hold at any size and zoom. Drag, wheel, pinch
 * and the keyboard (+ - 0 and the arrows) all drive the same view state.
 */
export function MapViewer({
  slug,
  name,
  imagePath,
  width,
  height,
  pins,
  isDM,
}: {
  slug: string;
  name: string;
  imagePath: string;
  width: number;
  height: number;
  pins: ViewPin[];
  isDM: boolean;
}) {
  const router = useRouter();
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const selected = pins.find((p) => p.id === selectedId) ?? null;

  // ---- Applying the view: DOM writes, not inline style objects. ----
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`;
    // Pins keep a constant size however far you zoom.
    for (const el of stage.querySelectorAll<HTMLElement>("[data-pin-anchor]")) {
      el.style.transform = `translate(-50%, -100%) scale(${1 / view.scale})`;
    }
  }, [view, pins, pending]);

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

  // ---- Pointer: one pointer pans (or places a pin), two pointers pinch. ----
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ start: View; startPoint: { x: number; y: number }; moved: boolean; pinch?: { dist: number; mid: { x: number; y: number } } } | null>(null);

  function local(e: { clientX: number; clientY: number }) {
    const rect = viewportRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
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
    // A tap that did not drag: place a pin here (DM, in placing mode), or just dismiss the preview.
    if (placing && isDM && stageRef.current) {
      const rect = stageRef.current.getBoundingClientRect();
      setPending({ x: clamp((e.clientX - rect.left) / rect.width, 0, 1), y: clamp((e.clientY - rect.top) / rect.height, 0, 1) });
    } else {
      setSelectedId(null);
    }
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
      case "Escape":
        setSelectedId(null);
        setPlacing(false);
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

  const SelectedIcon = selected ? (KIND_ICONS[selected.entry.kind] ?? MapPin) : MapPin;

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
            }}
            className={cn(placing && "border-primary text-gold")}
          >
            <Crosshair aria-hidden="true" />
            {placing ? "Click the map to place" : "Place a pin"}
          </Button>
        )}
        <span className="text-[13px] text-muted-foreground" data-testid="map-zoom">
          {Math.round(view.scale * 100)}%
        </span>
      </div>

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
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        className={cn(
          "relative w-full touch-none select-none overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/10 outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
          placing ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing",
        )}
      >
        <div ref={stageRef} data-testid="map-stage" className="relative origin-top-left will-change-transform">
          {/* A plain img: the map is a large static asset, not something to resize or optimise per request. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imagePath} alt={`Map of ${name}`} width={width} height={height} draggable={false} className="block h-auto w-full" />

          {pins.map((pin) => (
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
                  if (placing) return;
                  setSelectedId((cur) => (cur === pin.id ? null : pin.id));
                }}
                className={cn(
                  "size-8 rounded-full shadow-md ring-2 ring-background",
                  selectedId === pin.id && "ring-4 ring-ring",
                )}
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

        {selected && (
          <section
            aria-label="Pin preview"
            data-map-control
            className="z-10 mt-3 rounded-xl bg-card p-4 text-card-foreground shadow-lg ring-1 ring-foreground/15 sm:absolute sm:inset-x-3 sm:bottom-3 sm:mt-0 sm:max-w-sm"
          >
            <div className="flex items-start gap-3">
              <SelectedIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-gold" />
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-lg font-bold leading-tight">{selected.entry.name}</h2>
                {selected.label && selected.label !== selected.entry.name && (
                  <p className="text-[13px] text-faint-foreground">{selected.label}</p>
                )}
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
              {isDM && (
                <Button type="button" variant="outline" size="sm" onClick={() => removePin(selected)}>
                  <Trash2 aria-hidden="true" />
                  Remove pin
                </Button>
              )}
            </div>
          </section>
        )}
      </div>

      <p className="mt-2 text-[13px] text-muted-foreground">
        Drag or use the arrow keys to move, scroll, pinch or press + and − to zoom, 0 to reset.
        {isDM ? " Choose Place a pin, then click the map." : ""}
      </p>

      {pins.length > 0 && (
        <section className="mt-6" aria-labelledby="map-places">
          <h2 id="map-places" className="mb-2 text-xs font-semibold uppercase tracking-[0.07em] text-muted-foreground">
            On this map ({pins.length})
          </h2>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {pins.map((pin) => (
              <li key={pin.id}>
                <Link href={`/codex/entry/${pin.entry.slug}`} className="text-link underline-offset-4 hover:underline">
                  {pin.label || pin.entry.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

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
