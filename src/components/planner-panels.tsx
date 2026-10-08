"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarPlus, Copy, Dices, Search, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

type Player = { id: string; username: string; displayName: string | null };
type TableOption = { slug: string; name: string };
type SessionRow = { slug: string; name: string; playDate: string };
type Found = { id: string; slug: string; name: string; kind: string };

type Creature = { id: string; slug: string; name: string; cr: string; type: string; habitat: string; summary: string };
type Encounter = {
  creatures: Creature[];
  pool: number;
  table: { slug: string; name: string; dice: string; roll: number; result: string | null } | null;
};
type Reveal = {
  players: number;
  entries: number;
  granted: number;
  skippedSecret: { id: string; name: string; slug: string }[];
  missingEntries: number;
};

async function post<T>(url: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, data: data as T } : { ok: false, error: (data as { error?: string }).error ?? "Something went wrong." };
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection and try again." };
  }
}

/** The DM's session tools: start a session, build an encounter, reveal what the party learned. */
export function PlannerPanels({ players, tables, sessions }: { players: Player[]; tables: TableOption[]; sessions: SessionRow[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <StartSession sessions={sessions} />
      <EncounterBuilder tables={tables} />
      <div className="lg:col-span-2">
        <RevealAfterSession players={players} />
      </div>
    </div>
  );
}

function StartSession({ sessions }: { sessions: SessionRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const res = await post<{ slug: string; number: number }>("/api/planner/session");
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast.success(`Started session ${res.data.number}`);
    router.push(`/codex/entry/${res.data.slug}`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarPlus aria-hidden="true" className="size-5 text-gold" />
          Start a session
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          Creates the next numbered session page with today&rsquo;s date and a prep checklist. It starts secret, so the party sees nothing until you reveal it.
        </p>
        <div>
          <Button type="button" onClick={start} disabled={busy} data-testid="start-session">
            <CalendarPlus aria-hidden="true" />
            {busy ? "Starting…" : "Start a new session"}
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {sessions.length > 0 && (
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-[0.07em] text-muted-foreground">Latest sessions</h3>
            <ul className="grid gap-1 text-sm">
              {sessions.map((s) => (
                <li key={s.slug}>
                  <Link href={`/codex/entry/${s.slug}`} className="text-link underline-offset-4 hover:underline">
                    {s.name}
                  </Link>{" "}
                  <span className="text-xs text-faint-foreground">{s.playDate}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EncounterBuilder({ tables }: { tables: TableOption[] }) {
  const [count, setCount] = useState("3");
  const [crMax, setCrMax] = useState("");
  const [type, setType] = useState("");
  const [habitat, setHabitat] = useState("");
  const [tableSlug, setTableSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Encounter | null>(null);

  async function roll() {
    setBusy(true);
    setError(null);
    const res = await post<Encounter>("/api/planner/encounter", {
      count: Number(count),
      crMax: crMax || undefined,
      type: type || undefined,
      habitat: habitat || undefined,
      tableSlug: tableSlug || undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setResult(res.data);
  }

  async function copy() {
    if (!result) return;
    const lines = [
      ...result.creatures.map((c) => `- ${c.name}${c.cr ? ` (CR ${c.cr})` : ""}`),
      ...(result.table ? [`- ${result.table.name}: rolled ${result.table.roll}, ${result.table.result ?? "no result"}`] : []),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success("Copied");
    } catch {
      toast.error("Copying is not available here.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Dices aria-hidden="true" className="size-5 text-gold" />
          Encounter builder
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="enc-count">How many creatures</Label>
            <NativeSelect id="enc-count" value={count} onChange={(e) => setCount(e.target.value)}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <NativeSelectOption key={n} value={String(n)}>
                  {n}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="enc-cr">Highest CR</Label>
            <Input id="enc-cr" value={crMax} onChange={(e) => setCrMax(e.target.value)} placeholder="e.g. 2 or 1/2" maxLength={10} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="enc-type">Type contains</Label>
            <Input id="enc-type" value={type} onChange={(e) => setType(e.target.value)} placeholder="beast, undead…" maxLength={40} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="enc-habitat">Habitat contains</Label>
            <Input id="enc-habitat" value={habitat} onChange={(e) => setHabitat(e.target.value)} placeholder="forest, desert…" maxLength={40} />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="enc-table">Also roll a table</Label>
          <NativeSelect id="enc-table" value={tableSlug} onChange={(e) => setTableSlug(e.target.value)}>
            <NativeSelectOption value="">No table</NativeSelectOption>
            {tables.map((t) => (
              <NativeSelectOption key={t.slug} value={t.slug}>
                {t.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={roll} disabled={busy} data-testid="roll-encounter">
            <Dices aria-hidden="true" />
            {busy ? "Rolling…" : "Roll the encounter"}
          </Button>
          {result && (
            <Button type="button" variant="outline" onClick={copy}>
              <Copy aria-hidden="true" />
              Copy as a list
            </Button>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {result && (
          <section aria-label="Encounter result" data-testid="encounter-result" className="grid gap-2 rounded-xl bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">{result.pool} {result.pool === 1 ? "creature fits" : "creatures fit"} these filters.</p>
            {result.creatures.length === 0 ? (
              <p className="text-sm">No creature matches. Loosen a filter.</p>
            ) : (
              <ul className="grid gap-1 text-sm">
                {result.creatures.map((c) => (
                  <li key={c.id}>
                    <Link href={`/codex/entry/${c.slug}`} className="font-medium text-link underline-offset-4 hover:underline">
                      {c.name}
                    </Link>
                    {c.cr && <span className="text-xs text-faint-foreground"> CR {c.cr}</span>}
                    {c.type && <span className="text-xs text-faint-foreground"> {c.type}</span>}
                  </li>
                ))}
              </ul>
            )}
            {result.table && (
              <p className="text-sm" data-testid="table-roll">
                <Link href={`/codex/entry/${result.table.slug}`} className="font-medium text-link underline-offset-4 hover:underline">
                  {result.table.name}
                </Link>{" "}
                ({result.table.dice}): rolled <strong>{result.table.roll}</strong>, {result.table.result ?? "no result"}
              </p>
            )}
          </section>
        )}
      </CardContent>
    </Card>
  );
}

function RevealAfterSession({ players }: { players: Player[] }) {
  const router = useRouter();
  const [chosenPlayers, setChosenPlayers] = useState<Set<string>>(new Set());
  const [chosen, setChosen] = useState<Found[]>([]);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Reveal | null>(null);
  const searchId = useRef(0);

  useEffect(() => {
    if (query.trim().length < 2) {
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
    }, 160);
    return () => clearTimeout(timer);
  }, [query]);

  function togglePlayer(id: string, on: boolean) {
    setChosenPlayers((cur) => {
      const next = new Set(cur);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function reveal() {
    setBusy(true);
    setError(null);
    setResult(null);
    const res = await post<Reveal>("/api/planner/reveal", { playerIds: [...chosenPlayers], entryIds: chosen.map((c) => c.id) });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setResult(res.data);
    toast.success(`Revealed ${res.data.entries} ${res.data.entries === 1 ? "entry" : "entries"} to ${res.data.players} ${res.data.players === 1 ? "player" : "players"}`);
    setChosen([]);
    router.refresh();
  }

  const canReveal = chosenPlayers.size > 0 && chosen.length > 0 && !busy;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles aria-hidden="true" className="size-5 text-gold" />
          Reveal after the session
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-2">
        <fieldset className="grid content-start gap-2">
          <legend className="mb-1 text-sm font-medium">Who learned it</legend>
          {players.length === 0 ? (
            <p className="text-sm text-muted-foreground">No players have joined yet.</p>
          ) : (
            players.map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <Checkbox id={`player-${p.id}`} checked={chosenPlayers.has(p.id)} onCheckedChange={(on) => togglePlayer(p.id, on === true)} />
                <Label htmlFor={`player-${p.id}`} className="font-normal">
                  {p.displayName || p.username}
                </Label>
              </div>
            ))
          )}
        </fieldset>

        <div className="grid content-start gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="reveal-search">What they learned</Label>
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="reveal-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a page to reveal…" className="pl-9" />
            </div>
          </div>
          {found.length > 0 && (
            <ul className="grid max-h-44 gap-1 overflow-y-auto" aria-label="Matching entries">
              {found
                .filter((f) => !chosen.some((c) => c.id === f.id))
                .map((f) => (
                  <li key={f.id}>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto w-full justify-start gap-2 py-1.5 text-left font-normal"
                      onClick={() => {
                        setChosen((cur) => [...cur, f]);
                        setQuery("");
                      }}
                    >
                      <span className="font-medium">{f.name}</span>
                      <span className="text-[11px] uppercase tracking-[0.06em] text-faint-foreground">{f.kind}</span>
                    </Button>
                  </li>
                ))}
            </ul>
          )}
          {chosen.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Entries to reveal">
              {chosen.map((c) => (
                <li key={c.id}>
                  <Button type="button" variant="secondary" size="xs" onClick={() => setChosen((cur) => cur.filter((x) => x.id !== c.id))} aria-label={`Remove ${c.name}`}>
                    {c.name}
                    <X aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid gap-3 lg:col-span-2">
          <div>
            <Button type="button" onClick={reveal} disabled={!canReveal} data-testid="reveal">
              <Sparkles aria-hidden="true" />
              {busy ? "Revealing…" : "Reveal to the chosen players"}
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {result && (
            <div className="grid gap-1 text-sm" data-testid="reveal-result" role="status">
              <p>
                Revealed {result.entries} {result.entries === 1 ? "entry" : "entries"} to {result.players} {result.players === 1 ? "player" : "players"} ({result.granted} {result.granted === 1 ? "grant" : "grants"}).
              </p>
              {result.skippedSecret.length > 0 && (
                <p className="text-destructive">
                  Still secret, so not revealed: {result.skippedSecret.map((s) => s.name).join(", ")}. Set them to &ldquo;revealed&rdquo; in the editor first, then reveal again.
                </p>
              )}
              {result.missingEntries > 0 && <p className="text-muted-foreground">{result.missingEntries} chosen entries no longer exist or are archived.</p>}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
