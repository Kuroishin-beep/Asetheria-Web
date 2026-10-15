"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Layers, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ViewLayer = { id: string; name: string; defaultOn: boolean };

/**
 * Switches for the layers of a map, so a viewer can show or hide groups of pins and regions. The DM also adds
 * and removes layers here. Removing a layer never removes what was on it: those pins and regions stay on the map.
 */
export function MapLayersPanel({
  slug,
  layers,
  hidden,
  onToggle,
  isDM,
}: {
  slug: string;
  layers: ViewLayer[];
  hidden: Set<string>;
  onToggle: (id: string, on: boolean) => void;
  isDM: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (layers.length === 0 && !isDM) return null;

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/maps/${slug}/layers`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "Could not add the layer.");
        return;
      }
      toast.success("Layer added");
      setName("");
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(layer: ViewLayer) {
    try {
      const res = await fetch(`/api/maps/${slug}/layers/${layer.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("failed");
      toast.success(`Removed the layer "${layer.name}"; what was on it stays on the map`);
      router.refresh();
    } catch {
      toast.error("The layer could not be removed. Try again.");
    }
  }

  return (
    <fieldset className="no-print mb-3 rounded-lg border border-border p-3" data-testid="map-layers" data-map-control>
      <legend className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-[0.07em] text-muted-foreground">
        <Layers aria-hidden="true" className="size-4" />
        Layers
      </legend>
      {layers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No layers yet. Add one, then move pins and regions onto it.</p>
      ) : (
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {layers.map((l) => (
            <li key={l.id} className="flex items-center gap-2">
              <Checkbox id={`layer-${l.id}`} checked={!hidden.has(l.id)} onCheckedChange={(on) => onToggle(l.id, on === true)} />
              <Label htmlFor={`layer-${l.id}`}>{l.name}</Label>
              {isDM && (
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete the layer ${l.name}`} onClick={() => remove(l)}>
                  <Trash2 aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {isDM && (
        <form onSubmit={add} className="mt-3 flex flex-wrap items-end gap-2" aria-label="Add a layer">
          <div className="grid gap-1">
            <Label htmlFor="new-layer-name">New layer</Label>
            <Input id="new-layer-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="w-52" />
          </div>
          <Button type="submit" size="sm" variant="outline" disabled={busy || !name.trim()} data-testid="add-layer">
            <Plus aria-hidden="true" />
            Add layer
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive" data-testid="layer-error">
          {error}
        </p>
      )}
    </fieldset>
  );
}
