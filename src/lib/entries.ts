import "server-only";
import { and, asc, desc, eq, inArray, isNull, isNotNull, ne, or, sql, count } from "drizzle-orm";
import { db } from "@/db";
import { entries, links, revisions, type Entry, type EntryKind, type UserRole } from "@/db/schema";
import { redactForPlayer } from "@/lib/auth";
import type { LocationTier } from "@/lib/locations";

/**
 * Every read goes through here so that a player can never receive a secret
 * entry or any DM notes, regardless of what a page component asks for.
 */

/** Archived entries are hidden from normal browsing but never deleted. */
function liveOnly() {
  return isNull(entries.archivedAt);
}

function readable(role: UserRole) {
  return role === "dm" ? undefined : ne(entries.visibility, "secret");
}

export type ListOptions = {
  kind?: EntryKind;
  tag?: string;
  /** Narrows a location listing to one tier (capital, city, town, …). */
  tier?: LocationTier;
  limit?: number;
  offset?: number;
  includeArchived?: boolean;
};

/** Entries shown on one page of a section listing. */
export const PAGE_SIZE = 200;

/**
 * Columns the card and list views actually render.
 *
 * `body` and `dmNotes` are deliberately absent. Lists never display either, and
 * leaving them out means the DM's private notes are never read out of Postgres
 * at all — a stronger guarantee than fetching and then redacting them, and it
 * keeps a few hundred KB of prose off the wire on every section page.
 */
const listColumns = {
  id: entries.id,
  slug: entries.slug,
  name: entries.name,
  kind: entries.kind,
  summary: entries.summary,
  fields: entries.fields,
  tags: entries.tags,
  visibility: entries.visibility,
} as const;

export type EntryListItem = {
  id: string;
  slug: string;
  name: string;
  kind: EntryKind;
  summary: string;
  fields: Record<string, string>;
  tags: string[];
  visibility: Entry["visibility"];
};

function listConditions(role: UserRole, opts: ListOptions) {
  return [
    opts.includeArchived && role === "dm" ? undefined : liveOnly(),
    readable(role),
    opts.kind ? eq(entries.kind, opts.kind) : undefined,
    opts.tag ? sql`${opts.tag} = ANY(${entries.tags})` : undefined,
    opts.tier ? sql`${entries.fields}->>'tier' = ${opts.tier}` : undefined,
  ].filter(Boolean);
}

export async function listEntries(
  role: UserRole,
  opts: ListOptions = {},
): Promise<EntryListItem[]> {
  const conditions = listConditions(role, opts);

  // No redaction pass is needed on the way out: `readable()` filters secret
  // entries in SQL, and `listColumns` never selects a DM-only column.
  return db
    .select(listColumns)
    .from(entries)
    .where(conditions.length ? and(...(conditions as any[])) : undefined)
    .orderBy(asc(entries.name))
    .limit(opts.limit ?? PAGE_SIZE)
    .offset(opts.offset ?? 0);
}

/** Locations of one tier, for the front page and the per-tier sections. */
export async function listLocationsByTier(
  role: UserRole,
  tier: LocationTier,
  limit = PAGE_SIZE,
): Promise<EntryListItem[]> {
  return listEntries(role, { kind: "location", tier, limit });
}

/** Live count per location tier, keyed by tier. */
export async function countLocationsByTier(
  role: UserRole,
): Promise<Record<string, number>> {
  const conditions = [
    liveOnly(),
    readable(role),
    eq(entries.kind, "location"),
  ].filter(Boolean);

  const rows = await db
    .select({
      tier: sql<string>`coalesce(${entries.fields}->>'tier', '')`,
      total: count(),
    })
    .from(entries)
    .where(and(...(conditions as any[])))
    .groupBy(sql`coalesce(${entries.fields}->>'tier', '')`);

  const out: Record<string, number> = {};
  for (const r of rows) if (r.tier) out[r.tier] = r.total;
  return out;
}

/** Specific entries by slug, returned in the order the slugs were given. */
export async function listEntriesBySlugs(
  role: UserRole,
  slugs: readonly string[],
): Promise<EntryListItem[]> {
  if (slugs.length === 0) return [];
  const conditions = [
    liveOnly(),
    readable(role),
    inArray(entries.slug, [...slugs]),
  ].filter(Boolean);

  const rows = await db
    .select(listColumns)
    .from(entries)
    .where(and(...(conditions as any[])));

  const order = new Map(slugs.map((s, i) => [s, i]));
  return rows.sort(
    (a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0),
  );
}

/** Lore pages that actually carry prose — the empty Notion stubs are noise. */
export async function listLoreWithContent(
  role: UserRole,
  limit = 8,
): Promise<EntryListItem[]> {
  const conditions = [
    liveOnly(),
    readable(role),
    eq(entries.kind, "lore"),
    sql`length(trim(coalesce(${entries.body}, ''))) > 0`,
  ].filter(Boolean);

  return db
    .select(listColumns)
    .from(entries)
    .where(and(...(conditions as any[])))
    .orderBy(desc(sql`length(${entries.body})`), asc(entries.name))
    .limit(limit);
}

/** Total matching `opts`, so a listing can page without silently truncating. */
export async function countEntries(
  role: UserRole,
  opts: ListOptions = {},
): Promise<number> {
  const conditions = listConditions(role, opts);
  const [row] = await db
    .select({ total: count() })
    .from(entries)
    .where(conditions.length ? and(...(conditions as any[])) : undefined);
  return row?.total ?? 0;
}

export async function countByKind(role: UserRole) {
  const conditions = [liveOnly(), readable(role)].filter(Boolean);
  const rows = await db
    .select({ kind: entries.kind, total: count() })
    .from(entries)
    .where(and(...(conditions as any[])))
    .groupBy(entries.kind);

  const out: Partial<Record<EntryKind, number>> = {};
  for (const r of rows) out[r.kind] = r.total;
  return out;
}

export async function getEntryBySlug(role: UserRole, slug: string) {
  const conditions = [eq(entries.slug, slug), readable(role)].filter(Boolean);
  const [row] = await db
    .select()
    .from(entries)
    .where(and(...(conditions as any[])))
    .limit(1);

  if (!row) return null;
  return role === "dm" ? row : redactForPlayer(row);
}

export async function getEntryById(role: UserRole, id: string) {
  const conditions = [eq(entries.id, id), readable(role)].filter(Boolean);
  const [row] = await db
    .select()
    .from(entries)
    .where(and(...(conditions as any[])))
    .limit(1);
  if (!row) return null;
  return role === "dm" ? row : redactForPlayer(row);
}

export type RelatedEntry = {
  id: string;
  slug: string;
  name: string;
  kind: EntryKind;
  summary: string;
  relation: string;
  /** The sentence in the linking entry where this reference appears. */
  context: string | null;
};

/** Outgoing edges: things this entry refers to. */
export async function getOutgoingLinks(
  role: UserRole,
  entryId: string,
): Promise<RelatedEntry[]> {
  const conditions = [
    eq(links.sourceId, entryId),
    isNull(entries.archivedAt),
    readable(role),
  ].filter(Boolean);

  return db
    .select({
      id: entries.id,
      slug: entries.slug,
      name: entries.name,
      kind: entries.kind,
      summary: entries.summary,
      relation: links.relation,
      context: links.context,
    })
    .from(links)
    .innerJoin(entries, eq(entries.id, links.targetId))
    .where(and(...(conditions as any[])))
    .orderBy(asc(entries.name))
    .limit(200);
}

/** Incoming edges: "Linked mentions" — what refers to this entry. */
export async function getBacklinks(
  role: UserRole,
  entryId: string,
): Promise<RelatedEntry[]> {
  const conditions = [
    eq(links.targetId, entryId),
    isNull(entries.archivedAt),
    readable(role),
  ].filter(Boolean);

  return db
    .select({
      id: entries.id,
      slug: entries.slug,
      name: entries.name,
      kind: entries.kind,
      summary: entries.summary,
      relation: links.relation,
      context: links.context,
    })
    .from(links)
    .innerJoin(entries, eq(entries.id, links.sourceId))
    .where(and(...(conditions as any[])))
    .orderBy(asc(entries.name))
    .limit(200);
}

export async function getChildren(role: UserRole, parentId: string) {
  const conditions = [
    eq(entries.parentId, parentId),
    liveOnly(),
    readable(role),
  ].filter(Boolean);

  return db
    .select({
      id: entries.id,
      slug: entries.slug,
      name: entries.name,
      kind: entries.kind,
      summary: entries.summary,
    })
    .from(entries)
    .where(and(...(conditions as any[])))
    .orderBy(asc(entries.name))
    .limit(200);
}

export async function getParent(role: UserRole, parentId: string | null) {
  if (!parentId) return null;
  const conditions = [eq(entries.id, parentId), readable(role)].filter(Boolean);
  const [row] = await db
    .select({
      id: entries.id,
      slug: entries.slug,
      name: entries.name,
      kind: entries.kind,
    })
    .from(entries)
    .where(and(...(conditions as any[])))
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export type SearchHit = {
  id: string;
  slug: string;
  name: string;
  kind: EntryKind;
  summary: string;
  visibility: string;
  rank: number;
  snippet: string;
};

/**
 * Full-text search with a trigram fallback, so a misspelled or partial name
 * ("aeterna cty") still finds the page.
 */
export async function searchEntries(
  role: UserRole,
  query: string,
  limit = 40,
): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];

  const secretClause =
    role === "dm" ? sql`true` : sql`e.visibility <> 'secret'`;
  // Players must not have DM notes surface inside a search snippet either.
  const snippetSource =
    role === "dm"
      ? sql`coalesce(e.body, '') || ' ' || coalesce(e.dm_notes, '')`
      : sql`coalesce(e.body, '')`;

  const rows = await db.execute<SearchHit>(sql`
    WITH q AS (SELECT websearch_to_tsquery('english', ${q}) AS tsq)
    SELECT
      e.id,
      e.slug,
      e.name,
      e.kind,
      e.summary,
      e.visibility,
      GREATEST(
        ts_rank(e.search_vector, q.tsq),
        similarity(e.name, ${q}) * 0.6
      )::float AS rank,
      ts_headline(
        'english',
        ${snippetSource},
        q.tsq,
        'MaxWords=28, MinWords=12, ShortWord=3, MaxFragments=1, StartSel=<mark>, StopSel=</mark>'
      ) AS snippet
    FROM entries e, q
    WHERE e.archived_at IS NULL
      AND ${secretClause}
      AND (
        e.search_vector @@ q.tsq
        OR e.name % ${q}
        OR e.name ILIKE ${"%" + q + "%"}
      )
    ORDER BY rank DESC, e.name ASC
    LIMIT ${limit}
  `);

  return rows.rows as SearchHit[];
}

/** Lightweight name-only lookup that powers the command palette. */
export async function quickFind(role: UserRole, query: string, limit = 12) {
  const q = query.trim();
  if (!q) return [];
  const secretClause = role === "dm" ? sql`true` : sql`visibility <> 'secret'`;
  const rows = await db.execute<{
    id: string;
    slug: string;
    name: string;
    kind: EntryKind;
    summary: string;
  }>(sql`
    SELECT id, slug, name, kind, summary
    FROM entries
    WHERE archived_at IS NULL
      AND ${secretClause}
      AND (name ILIKE ${"%" + q + "%"} OR name % ${q})
    ORDER BY
      CASE WHEN name ILIKE ${q + "%"} THEN 0 ELSE 1 END,
      similarity(name, ${q}) DESC,
      name ASC
    LIMIT ${limit}
  `);
  return rows.rows;
}

export async function listAllTags(role: UserRole) {
  const secretClause = role === "dm" ? sql`true` : sql`visibility <> 'secret'`;
  const rows = await db.execute<{ tag: string; total: number }>(sql`
    SELECT unnest(tags) AS tag, count(*)::int AS total
    FROM entries
    WHERE archived_at IS NULL AND ${secretClause}
    GROUP BY tag
    ORDER BY total DESC, tag ASC
    LIMIT 200
  `);
  return rows.rows;
}

export async function listArchived() {
  return db
    .select()
    .from(entries)
    .where(isNotNull(entries.archivedAt))
    .orderBy(desc(entries.archivedAt))
    .limit(500);
}

export async function getRevisions(entryId: string) {
  return db
    .select()
    .from(revisions)
    .where(eq(revisions.entryId, entryId))
    .orderBy(desc(revisions.createdAt))
    .limit(50);
}

export async function getRecentlyUpdated(role: UserRole, limit = 8) {
  const conditions = [liveOnly(), readable(role)].filter(Boolean);
  return db
    .select({
      id: entries.id,
      slug: entries.slug,
      name: entries.name,
      kind: entries.kind,
      summary: entries.summary,
      updatedAt: entries.updatedAt,
    })
    .from(entries)
    .where(and(...(conditions as any[])))
    .orderBy(desc(entries.updatedAt))
    .limit(limit);
}
