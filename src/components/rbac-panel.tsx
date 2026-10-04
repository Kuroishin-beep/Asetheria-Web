"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, ChevronDown, ChevronUp, Eye, EyeOff, UserPlus } from "lucide-react";
import { EmptyState } from "@/components/entry-card";
import { FormMessage } from "@/components/shared/form-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { EntryKind } from "@/db/schema";
import { KIND_ICONS } from "@/lib/section-icons";
import { cn } from "@/lib/utils";

type Player = { id: string; username: string; displayName: string | null };
type Grant = { kind: EntryKind | null; entryId: string | null; granted: boolean };
type EntryRow = { id: string; name: string; kind: EntryKind; slug: string };
type KindRow = { kind: EntryKind; label: string };

async function postRbac(body: Record<string, unknown>) {
  const res = await fetch("/api/rbac", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Request failed.");
  }
}

export function RbacPanel({
  players,
  activePlayerId,
  grants,
  entries,
  kinds,
}: {
  players: Player[];
  activePlayerId: string | null;
  grants: Grant[];
  entries: EntryRow[];
  kinds: KindRow[];
}) {
  const router = useRouter();
  const [expandedKind, setExpandedKind] = useState<EntryKind | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kindGrant = useMemo(() => {
    const map = new Map<EntryKind, boolean>();
    for (const g of grants) if (g.kind) map.set(g.kind, g.granted);
    return map;
  }, [grants]);

  const entryGrant = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const g of grants) if (g.entryId) map.set(g.entryId, g.granted);
    return map;
  }, [grants]);

  const entriesByKind = useMemo(() => {
    const map = new Map<EntryKind, EntryRow[]>();
    for (const e of entries) {
      const list = map.get(e.kind) ?? [];
      list.push(e);
      map.set(e.kind, list);
    }
    return map;
  }, [entries]);

  if (!activePlayerId) {
    return (
      <EmptyState
        Icon={UserPlus}
        title="No player accounts yet"
        hint="Players register with the invite code, or you can create one from the command line:"
        action={<code className="rounded bg-muted px-2 py-1 text-xs">npm run user:add -- --username NAME --password &quot;PASS&quot;</code>}
      />
    );
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function bulk(action: "approve" | "reject" | "clear", entryIds: string[]) {
    if (action === "clear") {
      return run(() => postRbac({ action: "clearEntries", playerId: activePlayerId, entryIds }));
    }
    return run(() =>
      postRbac({ action: "bulkEntries", playerId: activePlayerId, entryIds, granted: action === "approve" }),
    );
  }

  return (
    <div className="grid gap-6">
      <div className="grid max-w-xs gap-2">
        <Label htmlFor="player-select">Player</Label>
        <NativeSelect
          id="player-select"
          className="w-full"
          value={activePlayerId}
          onChange={(e) => router.push(`/admin/rbac?player=${e.target.value}`)}
        >
          {players.map((p) => (
            <NativeSelectOption key={p.id} value={p.id}>
              {p.displayName || p.username} ({p.username})
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      {error && <FormMessage>{error}</FormMessage>}

      <ul className="grid gap-2">
        {kinds.map((k) => {
          const kindEntries = entriesByKind.get(k.kind) ?? [];
          const granted = kindGrant.get(k.kind);
          const overrideCount = kindEntries.filter((e) => entryGrant.has(e.id)).length;
          const isExpanded = expandedKind === k.kind;
          const Icon = KIND_ICONS[k.kind];
          const allSelected = selected.size === kindEntries.length && kindEntries.length > 0;

          return (
            <li key={k.kind}>
              <Card size="sm">
                <CardContent>
                  <div className="flex flex-wrap items-center gap-3">
                    <Icon aria-hidden="true" className="size-4 text-gold" />
                    <span className="flex-1 font-semibold">{k.label}</span>
                    {overrideCount > 0 && <Badge variant="secondary">{overrideCount} individually set</Badge>}
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      aria-pressed={granted === true}
                      className={cn(granted === true && "border-success text-success")}
                      onClick={() =>
                        run(() =>
                          postRbac({
                            action: "toggleKind",
                            playerId: activePlayerId,
                            kind: k.kind,
                            granted: !(granted === true),
                          }),
                        )
                      }
                    >
                      {granted === true ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
                      {granted === true ? "Visible to player" : "Hidden from player"}
                    </Button>
                    {kindEntries.length > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        aria-expanded={isExpanded}
                        onClick={() => {
                          setExpandedKind(isExpanded ? null : k.kind);
                          setSelected(new Set());
                        }}
                      >
                        {isExpanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
                        {isExpanded ? "Close" : `${kindEntries.length} entries…`}
                      </Button>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="mt-4 border-t border-border pt-4">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`select-all-${k.kind}`}
                            checked={allSelected}
                            onCheckedChange={(checked) =>
                              setSelected(checked === true ? new Set(kindEntries.map((x) => x.id)) : new Set())
                            }
                          />
                          <Label htmlFor={`select-all-${k.kind}`} className="text-[13px]">
                            Select all
                          </Label>
                        </div>
                        <div className="flex-1" />
                        <Button
                          type="button"
                          disabled={busy || selected.size === 0}
                          onClick={() => bulk("approve", [...selected])}
                        >
                          <Check aria-hidden="true" />
                          Approve selected
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy || selected.size === 0}
                          onClick={() => bulk("reject", [...selected])}
                        >
                          <Ban aria-hidden="true" />
                          Reject selected
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy || selected.size === 0}
                          onClick={() => bulk("clear", [...selected])}
                        >
                          Clear override
                        </Button>
                      </div>

                      <ul className="grid max-h-72 gap-1 overflow-y-auto">
                        {kindEntries.map((e) => {
                          const override = entryGrant.get(e.id);
                          return (
                            <li key={e.id} className="flex items-center gap-2">
                              <Checkbox
                                checked={selected.has(e.id)}
                                onCheckedChange={() => toggleSelected(e.id)}
                                aria-label={`Select ${e.name}`}
                              />
                              <span className="flex-1 text-sm">{e.name}</span>
                              {override === true && <Badge variant="secondary">granted</Badge>}
                              {override === false && (
                                <Badge variant="outline" className="border-destructive/50 text-destructive">
                                  denied
                                </Badge>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
