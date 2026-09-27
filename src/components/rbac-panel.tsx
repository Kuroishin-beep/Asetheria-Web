"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { EntryKind } from "@/db/schema";

type Player = { id: string; username: string; displayName: string | null };
type Grant = { kind: EntryKind | null; entryId: string | null; granted: boolean };
type EntryRow = { id: string; name: string; kind: EntryKind; slug: string };
type KindRow = { kind: EntryKind; label: string; icon: string };

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
      <p className="card" style={{ padding: "1.25rem", color: "var(--text-muted)" }}>
        No player accounts exist yet. Create one with{" "}
        <code>npm run user:add -- --username NAME --password &quot;PASS&quot;</code>.
      </p>
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

  return (
    <div style={{ display: "grid", gap: "1.25rem" }}>
      <div>
        <label className="label" htmlFor="player-select">
          Player
        </label>
        <select
          id="player-select"
          className="input"
          value={activePlayerId}
          onChange={(e) => router.push(`/admin/rbac?player=${e.target.value}`)}
          style={{ maxWidth: "20rem" }}
        >
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName || p.username} ({p.username})
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p
          role="alert"
          style={{
            fontSize: "0.8125rem",
            color: "var(--color-blood-400)",
            background: "color-mix(in srgb, var(--color-blood-400) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-blood-400) 30%, transparent)",
            borderRadius: 8,
            padding: "0.6rem 0.75rem",
          }}
        >
          {error}
        </p>
      )}

      <ul style={{ display: "grid", gap: "0.5rem", listStyle: "none", padding: 0 }}>
        {kinds.map((k) => {
          const kindEntries = entriesByKind.get(k.kind) ?? [];
          const granted = kindGrant.get(k.kind);
          const overrideCount = kindEntries.filter((e) => entryGrant.has(e.id)).length;
          const isExpanded = expandedKind === k.kind;

          return (
            <li key={k.kind} className="card" style={{ padding: "0.85rem 1rem" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.6rem",
                  flexWrap: "wrap",
                }}
              >
                <span aria-hidden="true">{k.icon}</span>
                <span style={{ fontWeight: 600, flex: 1 }}>{k.label}</span>
                {overrideCount > 0 && (
                  <span className="chip" style={{ fontSize: "0.75rem" }}>
                    {overrideCount} individually set
                  </span>
                )}
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  aria-pressed={granted === true}
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
                  {granted === true ? "Visible to player ✓" : "Hidden from player"}
                </button>
                {kindEntries.length > 0 && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setExpandedKind(isExpanded ? null : k.kind);
                      setSelected(new Set());
                    }}
                  >
                    {isExpanded ? "Close" : `${kindEntries.length} entries…`}
                  </button>
                )}
              </div>

              {isExpanded && (
                <div style={{ marginTop: "0.75rem", borderTop: "1px solid var(--border-soft)", paddingTop: "0.75rem" }}>
                  <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.6rem", flexWrap: "wrap" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8125rem" }}>
                      <input
                        type="checkbox"
                        checked={selected.size === kindEntries.length && kindEntries.length > 0}
                        onChange={(e) =>
                          setSelected(e.target.checked ? new Set(kindEntries.map((x) => x.id)) : new Set())
                        }
                      />
                      Select all
                    </label>
                    <div style={{ flex: 1 }} />
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy || selected.size === 0}
                      onClick={() =>
                        run(() =>
                          postRbac({
                            action: "bulkEntries",
                            playerId: activePlayerId,
                            entryIds: [...selected],
                            granted: true,
                          }),
                        )
                      }
                    >
                      Approve selected
                    </button>
                    <button
                      type="button"
                      className="btn"
                      disabled={busy || selected.size === 0}
                      onClick={() =>
                        run(() =>
                          postRbac({
                            action: "bulkEntries",
                            playerId: activePlayerId,
                            entryIds: [...selected],
                            granted: false,
                          }),
                        )
                      }
                    >
                      Reject selected
                    </button>
                    <button
                      type="button"
                      className="btn"
                      disabled={busy || selected.size === 0}
                      onClick={() =>
                        run(() =>
                          postRbac({
                            action: "clearEntries",
                            playerId: activePlayerId,
                            entryIds: [...selected],
                          }),
                        )
                      }
                    >
                      Clear override
                    </button>
                  </div>

                  <ul
                    style={{
                      display: "grid",
                      gap: "0.25rem",
                      listStyle: "none",
                      padding: 0,
                      maxHeight: "18rem",
                      overflowY: "auto",
                    }}
                  >
                    {kindEntries.map((e) => {
                      const override = entryGrant.get(e.id);
                      return (
                        <li key={e.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <input
                            type="checkbox"
                            checked={selected.has(e.id)}
                            onChange={() => toggleSelected(e.id)}
                            aria-label={`Select ${e.name}`}
                          />
                          <span style={{ flex: 1, fontSize: "0.875rem" }}>{e.name}</span>
                          {override === true && (
                            <span className="chip" style={{ fontSize: "0.7rem" }}>
                              granted
                            </span>
                          )}
                          {override === false && (
                            <span className="chip" style={{ fontSize: "0.7rem" }}>
                              denied
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
