import "server-only";
import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { characterJournal, characters, entries, type CharacterJournalRow } from "@/db/schema";
import { CharacterError } from "@/lib/characters";
import type { CharacterInput, Sheet } from "@/lib/character/engine";
import { CITIZENSHIPS } from "@/lib/character/house-rules";
import { checkJournalEntry, checkWorldPatch, linkWorship, WORLD_LIMITS, type WorshipPart } from "@/lib/character/world-core";
import { getEntryBySlug, liveOnly, listEntries, listEntriesBySlugs, readable } from "@/lib/entries";
import type { SessionUser } from "@/lib/session";

/**
 * Where a character sits in the world: the party roster, the private journal, and the links from citizenship,
 * worship and home to codex pages. A link is made only when the person looking may read that page, so none of
 * this can show them a page (or even a name) they could not open themselves.
 */

export type WorldLink = { text: string; href: string | null };

export type CharacterWorld = {
  citizenship: WorldLink;
  worship: WorshipPart[];
  /** The home place, only if the viewer may read its page; otherwise nothing at all (not even its name). */
  home: WorldLink | null;
};

type WorldSource = { input: CharacterInput; homeEntryId: string | null };

/** Resolves the links for many characters with a fixed handful of queries, however many there are. */
export async function resolveWorlds(viewer: SessionUser, items: WorldSource[]): Promise<CharacterWorld[]> {
  const needsEmpire = items.some((i) => CITIZENSHIPS.some((c) => c.id === i.input.citizenship));
  const needsGods = items.some((i) => i.input.worship.trim() !== "");
  const homeIds = [...new Set(items.map((i) => i.homeEntryId).filter((x): x is string => !!x))];

  const [empirePages, gods, homes] = await Promise.all([
    needsEmpire ? listEntriesBySlugs(viewer, CITIZENSHIPS.map((c) => c.codexSlug)) : Promise.resolve([]),
    needsGods ? listEntries(viewer, { kind: "deity", limit: 600 }) : Promise.resolve([]),
    homeIds.length > 0
      ? db
          .select({ id: entries.id, slug: entries.slug, name: entries.name })
          .from(entries)
          .where(and(inArray(entries.id, homeIds), liveOnly(), readable(viewer)))
      : Promise.resolve([]),
  ]);

  const godHref = new Map(gods.map((g) => [g.name.toLowerCase(), `/codex/entry/${g.slug}`]));
  const homeById = new Map(homes.map((h) => [h.id, h]));

  return items.map(({ input, homeEntryId }) => {
    const def = CITIZENSHIPS.find((c) => c.id === input.citizenship);
    const page = def ? empirePages.find((p) => p.slug === def.codexSlug) : undefined;
    const worship = input.worship.trim();
    const home = homeEntryId ? homeById.get(homeEntryId) : undefined;
    return {
      citizenship: { text: def?.name ?? "None", href: page ? `/codex/entry/${page.slug}` : null },
      worship: worship ? linkWorship(worship, godHref) : [{ text: "Unaffiliated", href: null }],
      home: home ? { text: home.name, href: `/codex/entry/${home.slug}` } : null,
    };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// The party roster
// ---------------------------------------------------------------------------------------------------------------

export type PartyMember = {
  name: string;
  heritage: string;
  className: string;
  level: number;
  citizenship: WorldLink;
  worship: WorshipPart[];
};

/**
 * The characters their players chose to share, newest change first, and nothing else about them: no id (so no
 * way to open a sheet), no owner, no scores, no backstory, no journal. At most `WORLD_LIMITS.roster` are shown;
 * `total` says how many are shared.
 */
export async function listParty(viewer: SessionUser): Promise<{ members: PartyMember[]; total: number; truncated: boolean }> {
  const live = and(eq(characters.shared, true), isNull(characters.archivedAt));
  const [rows, [{ n }]] = await Promise.all([
    db
      .select({ sheet: characters.sheet, input: characters.input })
      .from(characters)
      .where(live)
      .orderBy(desc(characters.updatedAt), asc(characters.id))
      .limit(WORLD_LIMITS.roster),
    db.select({ n: count() }).from(characters).where(live),
  ]);
  const worlds = await resolveWorlds(viewer, rows.map((r) => ({ input: r.input as CharacterInput, homeEntryId: null })));
  const members = rows.map((r, i) => {
    const sheet = r.sheet as Sheet;
    return { name: sheet.name, heritage: sheet.heritage, className: sheet.className, level: sheet.level, citizenship: worlds[i].citizenship, worship: worlds[i].worship };
  });
  return { members, total: n, truncated: n > members.length };
}

// ---------------------------------------------------------------------------------------------------------------
// Sharing and home (the owner only)
// ---------------------------------------------------------------------------------------------------------------

/**
 * Shares a character with the party or takes it back, and sets or clears its home. Only the owner may; anyone
 * else gets "not found". A home must be a place (a location page) the owner can read right now.
 * Returns false when the character is not the caller's.
 */
export async function updateWorld(user: SessionUser, id: string, raw: unknown): Promise<boolean> {
  if (user.role !== "player") throw new CharacterError("Only the player who made a character can change it.", 403);
  const parsed = checkWorldPatch(raw);
  if (!parsed.ok) throw new CharacterError("That change is not allowed.", 400, parsed.problems);
  const patch = parsed.value;

  const set: Partial<typeof characters.$inferInsert> = {};
  if (patch.shared !== undefined) set.shared = patch.shared;
  if (patch.homeSlug !== undefined) {
    if (patch.homeSlug === null) set.homeEntryId = null;
    else {
      const place = await getEntryBySlug(user, patch.homeSlug);
      if (!place || place.kind !== "location") throw new CharacterError("A home must be a place you can read. Choose a location page.", 400);
      set.homeEntryId = place.id;
    }
  }
  const rows = await db
    .update(characters)
    .set({ ...set, updatedAt: new Date() })
    .where(and(eq(characters.id, id), eq(characters.userId, user.id), isNull(characters.archivedAt)))
    .returning({ id: characters.id });
  return rows.length > 0;
}

// ---------------------------------------------------------------------------------------------------------------
// The journal
// ---------------------------------------------------------------------------------------------------------------

export type JournalEntry = { id: string; title: string; body: string; createdAt: Date; updatedAt: Date };
const shapeEntry = (r: CharacterJournalRow): JournalEntry => ({ id: r.id, title: r.title, body: r.body, createdAt: r.createdAt, updatedAt: r.updatedAt });

/** The character if the user may read its journal (its player, or the DM); null for anyone else. */
async function journalOwner(user: SessionUser, characterId: string): Promise<{ id: string } | null> {
  const where = user.role === "dm" ? eq(characters.id, characterId) : and(eq(characters.id, characterId), eq(characters.userId, user.id));
  const [row] = await db
    .select({ id: characters.id })
    .from(characters)
    .where(and(where, isNull(characters.archivedAt)))
    .limit(1);
  return row ?? null;
}

function mayWrite(user: SessionUser) {
  if (user.role !== "player") throw new CharacterError("Only the player writes in a character's journal; the DM can read it.", 403);
}

/** Newest first. Null when the character is not the caller's (and the caller is not the DM). */
export async function listJournal(user: SessionUser, characterId: string): Promise<JournalEntry[] | null> {
  if (!(await journalOwner(user, characterId))) return null;
  const rows = await db
    .select()
    .from(characterJournal)
    .where(eq(characterJournal.characterId, characterId))
    .orderBy(desc(characterJournal.createdAt), desc(characterJournal.id));
  return rows.map(shapeEntry);
}

export async function addJournalEntry(user: SessionUser, characterId: string, raw: unknown): Promise<JournalEntry | null> {
  if (!(await journalOwner(user, characterId))) return null;
  mayWrite(user);
  const parsed = checkJournalEntry(raw);
  if (!parsed.ok) throw new CharacterError("That journal entry cannot be saved.", 400, parsed.problems);
  const [{ n }] = await db.select({ n: count() }).from(characterJournal).where(eq(characterJournal.characterId, characterId));
  if (n >= WORLD_LIMITS.journalEntries) throw new CharacterError(`A journal holds at most ${WORLD_LIMITS.journalEntries} entries. Delete an old one first.`, 409);
  const [row] = await db.insert(characterJournal).values({ characterId, ...parsed.value }).returning();
  return shapeEntry(row);
}

export async function updateJournalEntry(user: SessionUser, characterId: string, entryId: string, raw: unknown): Promise<JournalEntry | null> {
  if (!(await journalOwner(user, characterId))) return null;
  mayWrite(user);
  const parsed = checkJournalEntry(raw);
  if (!parsed.ok) throw new CharacterError("That journal entry cannot be saved.", 400, parsed.problems);
  const [row] = await db
    .update(characterJournal)
    .set({ ...parsed.value, updatedAt: sql`now()` })
    .where(and(eq(characterJournal.id, entryId), eq(characterJournal.characterId, characterId)))
    .returning();
  return row ? shapeEntry(row) : null;
}

export async function deleteJournalEntry(user: SessionUser, characterId: string, entryId: string): Promise<boolean> {
  if (!(await journalOwner(user, characterId))) return false;
  mayWrite(user);
  const rows = await db
    .delete(characterJournal)
    .where(and(eq(characterJournal.id, entryId), eq(characterJournal.characterId, characterId)))
    .returning({ id: characterJournal.id });
  return rows.length > 0;
}
