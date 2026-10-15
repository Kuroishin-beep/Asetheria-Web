"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export type PlayerChoice = { id: string; name: string };

/**
 * The DM's control on a secret block: who it is revealed to, and a way to change that. Revealing is exact
 * (the chosen players and nobody else), takes effect at once, and can be undone by choosing nobody.
 */
export function SecretRevealControl({
  secretId,
  players,
  initial,
}: {
  secretId: string;
  players: PlayerChoice[];
  initial: { id: string; name: string }[];
}) {
  const [revealed, setRevealed] = useState(initial);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set(initial.map((p) => p.id)));
  const [saving, setSaving] = useState(false);
  const panelId = `reveal-${secretId}`;

  function toggle(id: string, on: boolean) {
    setChosen((cur) => {
      const next = new Set(cur);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/secrets/${secretId}/reveal`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerIds: [...chosen] }),
      });
      const data = (await res.json().catch(() => null)) as { revealedTo?: { id: string; name: string }[]; error?: string } | null;
      if (!res.ok || !data?.revealedTo) {
        toast.error(data?.error ?? "Could not change who sees this.");
        return;
      }
      setRevealed(data.revealedTo);
      setChosen(new Set(data.revealedTo.map((p) => p.id)));
      setOpen(false);
      toast.success(data.revealedTo.length === 0 ? "Hidden from every player" : `Revealed to ${data.revealedTo.length} ${data.revealedTo.length === 1 ? "player" : "players"}`);
    } catch {
      toast.error("Could not change who sees this. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground" data-testid="reveal-status">
        {revealed.length === 0 ? "Not revealed to anyone" : `Revealed to ${revealed.map((p) => p.name).join(", ")}`}
      </span>
      <Button type="button" size="sm" variant="outline" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)}>
        <Users aria-hidden="true" />
        {open ? "Close" : "Choose who sees this"}
      </Button>
      {open && (
        <div id={panelId} role="group" aria-label="Choose who this passage is revealed to" className="basis-full rounded-lg border border-border bg-card p-3">
          {players.length === 0 ? (
            <p className="text-muted-foreground">There are no players yet.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {players.map((p) => (
                <li key={p.id} className="flex items-center gap-2">
                  <Checkbox id={`${panelId}-${p.id}`} checked={chosen.has(p.id)} onCheckedChange={(on) => toggle(p.id, on === true)} />
                  <Label htmlFor={`${panelId}-${p.id}`}>{p.name}</Label>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={save} disabled={saving} data-testid="reveal-save">
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setChosen(new Set(players.map((p) => p.id)))}>
              Everyone
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setChosen(new Set())}>
              No one
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
