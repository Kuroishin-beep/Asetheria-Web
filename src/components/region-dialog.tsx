"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { ViewLayer } from "@/components/map-layers-panel";
import { REGION_TONES, type Point } from "@/lib/map-geometry";

type Found = { id: string; slug: string; name: string; kind: string };

/** The colours a region can take, by name (they are tones 1 to 5 of the design tokens). */
export const TONE_NAMES: Record<string, string> = { "1": "Gold", "2": "Teal", "3": "Violet", "4": "Crimson", "5": "Umber" };

/** How a region is filled and outlined, by tone. Spelled out so the styles are found at build time. */
export const TONE_CLASS: Record<string, string> = {
  "1": "fill-chart-1/25 stroke-chart-1",
  "2": "fill-chart-2/25 stroke-chart-2",
  "3": "fill-chart-3/25 stroke-chart-3",
  "4": "fill-chart-4/25 stroke-chart-4",
  "5": "fill-chart-5/25 stroke-chart-5",
};

/** What the DM fills in after drawing an outline: a name, the page it belongs to, a layer and a colour. */
export function RegionDialog({ slug, points, layers, onClose, onSaved }: { slug: string; points: Point[] | null; layers: ViewLayer[]; onClose: () => void; onSaved: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [chosen, setChosen] = useState<Found | null>(null);
  const [layerId, setLayerId] = useState("");
  const [tone, setTone] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const searchId = useRef(0);

  useEffect(() => {
    if (!points || chosen || query.trim().length < 2) {
      setFound([]);
      return;
    }
    const id = ++searchId.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/find?q=${encodeURIComponent(query.trim())}`);
        const data = (await res.json()) as { results?: Found[] };
        if (id === searchId.current) setFound((data.results ?? []).slice(0, 8));
      } catch {
        if (id === searchId.current) setFound([]);
      }
    }, 160);
    return () => clearTimeout(timer);
  }, [query, points, chosen]);

  function reset() {
    setName("");
    setQuery("");
    setFound([]);
    setChosen(null);
    setLayerId("");
    setTone("1");
    setError(null);
  }

  async function save() {
    if (!points) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/maps/${slug}/regions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, points, entryId: chosen?.id ?? null, layerId: layerId || null, tone }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "The region could not be saved.");
        return;
      }
      toast.success(`Added the region ${name.trim()}`);
      reset();
      onSaved();
      router.refresh();
    } catch {
      setError("The region could not be saved. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={points !== null}
      onOpenChange={(open) => {
        if (!open) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Name this region</DialogTitle>
          <DialogDescription>{points ? `An outline of ${points.length} points.` : ""} Link it to a page so the players who can read that page see the region.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="region-name">Region name</Label>
            <Input id="region-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={140} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="region-page">The page it belongs to (optional)</Label>
            {chosen ? (
              <p className="text-sm" data-testid="region-chosen">
                Linked to <strong>{chosen.name}</strong>{" "}
                <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => setChosen(null)}>
                  change
                </Button>
              </p>
            ) : (
              <>
                <div className="relative">
                  <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="region-page" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find an empire, a wild, a city…" className="pl-9" autoComplete="off" />
                </div>
                {found.length > 0 && (
                  <ul className="grid max-h-40 gap-1 overflow-y-auto" aria-label="Matching pages">
                    {found.map((f) => (
                      <li key={f.id}>
                        <Button type="button" variant="ghost" className="h-auto w-full justify-start gap-2 py-2 text-left font-normal" onClick={() => setChosen(f)} data-testid="region-result">
                          <span className="font-medium">{f.name}</span>
                          <span className="text-[11px] uppercase tracking-[0.06em] text-faint-foreground">{f.kind}</span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[13px] text-muted-foreground">With no page the region is for your eyes only.</p>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="region-layer">Layer</Label>
              <NativeSelect id="region-layer" value={layerId} onChange={(e) => setLayerId(e.target.value)}>
                <NativeSelectOption value="">No layer</NativeSelectOption>
                {layers.map((l) => (
                  <NativeSelectOption key={l.id} value={l.id}>
                    {l.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="region-tone">Colour</Label>
              <NativeSelect id="region-tone" value={tone} onChange={(e) => setTone(e.target.value)}>
                {REGION_TONES.map((t) => (
                  <NativeSelectOption key={t} value={t}>
                    {TONE_NAMES[t]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive" data-testid="region-error">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={saving || !name.trim()} data-testid="region-save">
            {saving ? "Saving…" : "Save region"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
