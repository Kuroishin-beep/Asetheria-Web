import "server-only";
import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { entries, entryGrants, revisions, users, type Entry } from "@/db/schema";
import { rollOnTable } from "@/lib/dice";
import { refreshEmbeddingAfterResponse } from "@/lib/embedding-sync";
import { getEntryBySlug, listEntries, liveOnly, readable } from "@/lib/entries";
import { numericValue } from "@/lib/field-sort";
import { rebuildLinksForEntry } from "@/lib/link-graph";
import { bulkSetGrant } from "@/lib/rbac";
import { parseRollTable, validateTable } from "@/lib/roll-table";
import type { SessionUser } from "@/lib/session";

/**
 * The campaign planner's server side: starting a session, building an
 * encounter, and revealing entries to players after the session. Every read goes
 * through the same access rules as the rest of the app, and nothing here ever
 * widens what a player can see except `revealToPlayers`, which writes exactly
 * the grants it is asked to and reports what it skipped.
 */

// ---------------------------------------------------------------------------
// Start a session
// ---------------------------------------------------------------------------

export const SESSION_BODY = `## Prep checklist

- [ ] Recap the last session
- [ ] Pick the scenes and the likely encounters
- [ ] Read the NPCs and places involved
- [ ] Prepare handouts and maps
- [ ] Decide what to reveal to the players afterwards

## Scenes

## Encounters

## After the session

- [ ] Reveal what the party learned (Planner, then Reveal after the session)
`;

export const SESSION_DM_NOTES = `## Secrets and hooks

## What the players must not miss
`;

/** A day as YYYY-MM-DD in the server's local time. */
export function today(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** One more than the highest session number in the codex, archived sessions included, so a number is never reused. */
export async function nextSessionNumber(): Promise<number> {
  const rows = await db
    .select({ n: sql<string | null>`${entries.fields}->>'sessionNumber'` })
    .from(entries)
    .where(eq(entries.kind, "session"));
  let highest = 0;
  for (const r of rows) {
    const n = Math.trunc(numericValue(r.n) ?? 0);
    if (n > highest) highest = n;
  }
  return highest + 1;
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

const MAX_ATTEMPTS = 30;

/**
 * Creates "Session N". Two DMs (or one double-click) can ask at the same
 * moment and compute the same N; the slug is unique, so the loser's insert is
 * refused and it simply asks for the next number again. No transaction needed,
 * which also keeps it working on drivers that do not offer one.
 *
 * It is created `secret`: it is the DM's prep, not something the party has
 * earned yet.
 */
export async function createSession(user: { id: string; username: string }): Promise<{ slug: string; number: number }> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const number = await nextSessionNumber();
    try {
      const [row] = await db
        .insert(entries)
        .values({
          slug: `session-${number}`,
          kind: "session",
          name: `Session ${number}`,
          summary: `Prep and notes for session ${number}.`,
          body: SESSION_BODY,
          dmNotes: SESSION_DM_NOTES,
          fields: { sessionNumber: String(number), playDate: today() },
          tags: ["session"],
          visibility: "secret",
        })
        .returning();

      const { embedding: _vector, ...content } = row as Entry;
      await db.insert(revisions).values({
        entryId: row.id,
        snapshot: content as unknown as Record<string, unknown>,
        action: "create",
        authorId: user.id,
        authorName: user.username,
      });
      await rebuildLinksForEntry(row.id, row.body, row.fields);
      refreshEmbeddingAfterResponse(row.id);
      revalidatePath("/");
      revalidatePath("/codex/sessions");
      return { slug: row.slug, number };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Someone else took this number a moment ago; look again.
    }
  }
  throw new Error("Could not find a free session number.");
}

// ---------------------------------------------------------------------------
// Encounter builder
// ---------------------------------------------------------------------------

export type EncounterRequest = {
  count: number;
  crMax?: string;
  type?: string;
  habitat?: string;
  tableSlug?: string;
};

export type EncounterCreature = { id: string; slug: string; name: string; cr: string; type: string; habitat: string; summary: string };
export type EncounterResult = {
  creatures: EncounterCreature[];
  /** How many creatures matched the filters before picking (so the DM knows the pool). */
  pool: number;
  table: { slug: string; name: string; dice: string; roll: number; result: string | null } | null;
};

export class PlannerError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Unbiased shuffle with a cryptographic RNG. */
function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const includes = (haystack: string | undefined, needle: string | undefined) =>
  !needle || (haystack ?? "").toLowerCase().includes(needle.trim().toLowerCase());

/**
 * Picks creatures from the bestiary this DM can read (archived ones are never
 * in the pool) and, if asked, rolls one of the codex's random tables.
 */
export async function buildEncounter(user: SessionUser, req: EncounterRequest): Promise<EncounterResult> {
  const all = await listEntries(user, { kind: "creature", limit: 2000 });
  const crCap = req.crMax ? numericValue(req.crMax) : null;
  if (req.crMax && crCap === null) throw new PlannerError(`"${req.crMax}" is not a challenge rating like 2 or 1/2.`, 400);

  const pool = all.filter((c) => {
    if (crCap !== null) {
      const cr = numericValue(c.fields?.cr);
      if (cr === null || cr > crCap) return false;
    }
    return includes(c.fields?.type, req.type) && includes(c.fields?.habitat, req.habitat);
  });
  const picked = shuffled(pool).slice(0, req.count);

  let table: EncounterResult["table"] = null;
  if (req.tableSlug) {
    const entry = await getEntryBySlug(user, req.tableSlug);
    if (!entry) throw new PlannerError("That table does not exist.", 404);
    if (entry.kind !== "table") throw new PlannerError("That page is not a random table.", 400);
    const dice = entry.fields?.dice ?? "";
    const problems = validateTable(dice, entry.body);
    if (problems.length) throw new PlannerError(`That table cannot be rolled yet: ${problems[0]}`, 422);
    const rolled = rollOnTable(dice, parseRollTable(entry.body).rows);
    table = { slug: entry.slug, name: entry.name, dice, roll: rolled.roll, result: rolled.result };
  }

  return {
    creatures: picked.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      cr: c.fields?.cr ?? "",
      type: c.fields?.type ?? "",
      habitat: c.fields?.habitat ?? "",
      summary: c.summary,
    })),
    pool: pool.length,
    table,
  };
}

// ---------------------------------------------------------------------------
// Reveal after the session
// ---------------------------------------------------------------------------

export type RevealResult = {
  players: number;
  entries: number;
  /** Player-entry pairs written: exactly players x entries, nothing else. */
  granted: number;
  /** Chosen entries that are still secret: a grant cannot reveal those, so none was written. */
  skippedSecret: { id: string; name: string; slug: string }[];
  /** Ids that are unknown or archived. */
  missingEntries: number;
  unknownPlayers: number;
};

/**
 * Gives each chosen player access to each chosen entry. It writes entry-level
 * grants and nothing else: it never changes an entry's visibility and never
 * writes a kind-level grant. A secret entry stays hidden even with a grant, so
 * those are skipped and reported rather than quietly pretending to work.
 */
export async function revealToPlayers(dm: { id: string }, playerIds: string[], entryIds: string[]): Promise<RevealResult> {
  const players = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, playerIds), eq(users.role, "player")));
  const found = await db
    .select({ id: entries.id, name: entries.name, slug: entries.slug, visibility: entries.visibility, archivedAt: entries.archivedAt })
    .from(entries)
    .where(inArray(entries.id, entryIds));

  const live = found.filter((e) => !e.archivedAt);
  const eligible = live.filter((e) => e.visibility !== "secret");
  const skippedSecret = live.filter((e) => e.visibility === "secret").map(({ id, name, slug }) => ({ id, name, slug }));

  if (eligible.length > 0) {
    for (const player of players) {
      await bulkSetGrant(dm.id, player.id, eligible.map((e) => ({ entryId: e.id })), true);
    }
  }
  revalidatePath("/");

  return {
    players: players.length,
    entries: eligible.length,
    granted: players.length * eligible.length,
    skippedSecret,
    missingEntries: entryIds.length - live.length,
    unknownPlayers: playerIds.length - players.length,
  };
}

// ---------------------------------------------------------------------------
// What's new for a player
// ---------------------------------------------------------------------------

export type WhatsNewItem = { id: string; slug: string; name: string; kind: Entry["kind"]; summary: string; grantedAt: Date };

/**
 * Pages the DM has explicitly opened up to this person, newest first. Read
 * through the ordinary access rules too, so a page that was later hidden again
 * or archived is not listed.
 */
export async function getWhatsNew(user: SessionUser, limit = 8): Promise<WhatsNewItem[]> {
  if (user.role === "dm") return [];
  const conditions = [
    eq(entryGrants.userId, user.id),
    eq(entryGrants.granted, true),
    isNotNull(entryGrants.entryId),
    liveOnly(),
    readable(user),
  ].filter(Boolean);
  return db
    .select({
      id: entries.id,
      slug: entries.slug,
      name: entries.name,
      kind: entries.kind,
      summary: entries.summary,
      grantedAt: entryGrants.grantedAt,
    })
    .from(entryGrants)
    .innerJoin(entries, eq(entries.id, entryGrants.entryId))
    .where(and(...conditions))
    .orderBy(desc(entryGrants.grantedAt))
    .limit(limit);
}

// Re-exported for the page, which lists the latest sessions.
export async function recentSessions(limit = 5) {
  return db
    .select({ id: entries.id, slug: entries.slug, name: entries.name, fields: entries.fields, visibility: entries.visibility })
    .from(entries)
    .where(and(eq(entries.kind, "session"), isNull(entries.archivedAt)))
    .orderBy(desc(entries.createdAt))
    .limit(limit);
}
