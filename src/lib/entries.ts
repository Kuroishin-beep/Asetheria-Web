import "server-only";
import { and, asc, desc, eq, inArray, isNull, isNotNull, ne, or, sql, count } from "drizzle-orm";
import { db } from "@/db";
import { entries, links, revisions, type Entry, type EntryKind } from "@/db/schema";
import { redactForPlayer, redactManyForPlayer } from "@/lib/auth";
import { escapeHtml, type WikiLinkResolver } from "@/lib/markdown";
import { buildNameIndex, normalizeName, parseAliases } from "@/lib/links";
import type { SessionUser } from "@/lib/session";
import { grantCondition, grantConditionRaw } from "@/lib/rbac";
import type { LocationTier } from "@/lib/locations";
import { sortRows, type SortSpec } from "@/lib/field-sort";

/**
 * Every read goes through here so that a player can never receive a secret
 * entry or any DM notes, regardless of what a page component asks for.
 */

/** Archived entries are hidden from normal browsing but never deleted. */
export function liveOnly() {
  return isNull(entries.archivedAt);
}

export function readable(user: SessionUser) {
  if (user.role === "dm") return undefined;
  return and(ne(entries.visibility, "secret"), grantCondition(user));
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

function listConditions(user: SessionUser, opts: ListOptions) {
  return [
    opts.includeArchived && user.role === "dm" ? undefined : liveOnly(),
    readable(user),
    opts.kind ? eq(entries.kind, opts.kind) : undefined,
    opts.tag ? sql`${opts.tag} = ANY(${entries.tags})` : undefined,
    opts.tier ? sql`${entries.fields}->>'tier' = ${opts.tier}` : undefined,
  ].filter(Boolean);
}

export async function listEntries(
  user: SessionUser,
  opts: ListOptions = {},
): Promise<EntryListItem[]> {
  const conditions = listConditions(user, opts);

  // No redaction pass is needed on the way out: `readable()` filters secret
  // entries in SQL, and `listColumns` never selects a DM-only column.
  return db
    .select(listColumns)
    .from(entries)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(entries.name))
    .limit(opts.limit ?? PAGE_SIZE)
    .offset(opts.offset ?? 0);
}

/** The most rows a sorted section is ever read in one go; no section approaches this. */
const SORTED_READ_CAP = 5000;

/**
 * One page of a section ordered by name or by a property, across the whole
 * section rather than the loaded page. Access is decided by the same SQL as
 * `listEntries` (secret and ungranted rows never leave Postgres for a player);
 * the ordering is then applied in code with `sortRows`, so the sort key is never
 * part of a query. `spec.key` must already have passed `parseSort`.
 */
export async function listEntriesSorted(
  user: SessionUser,
  opts: ListOptions,
  spec: SortSpec,
): Promise<EntryListItem[]> {
  const conditions = listConditions(user, opts);
  const rows = await db
    .select(listColumns)
    .from(entries)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(entries.name))
    .limit(SORTED_READ_CAP);
  const sorted = sortRows(rows, spec);
  const offset = opts.offset ?? 0;
  return sorted.slice(offset, offset + (opts.limit ?? PAGE_SIZE));
}

/** Locations of one tier, for the front page and the per-tier sections. */
export async function listLocationsByTier(
  user: SessionUser,
  tier: LocationTier,
  limit = PAGE_SIZE,
): Promise<EntryListItem[]> {
  return listEntries(user, { kind: "location", tier, limit });
}

/** Live count per location tier, keyed by tier. */
export async function countLocationsByTier(
  user: SessionUser,
): Promise<Record<string, number>> {
  const conditions = [
    liveOnly(),
    readable(user),
    eq(entries.kind, "location"),
  ].filter(Boolean);

  const rows = await db
    .select({
      tier: sql<string>`coalesce(${entries.fields}->>'tier', '')`,
      total: count(),
    })
    .from(entries)
    .where(and(...conditions))
    .groupBy(sql`coalesce(${entries.fields}->>'tier', '')`);

  const out: Record<string, number> = {};
  for (const r of rows) if (r.tier) out[r.tier] = r.total;
  return out;
}

/** Specific entries by slug, returned in the order the slugs were given. */
export async function listEntriesBySlugs(
  user: SessionUser,
  slugs: readonly string[],
): Promise<EntryListItem[]> {
  if (slugs.length === 0) return [];
  const conditions = [
    liveOnly(),
    readable(user),
    inArray(entries.slug, [...slugs]),
  ].filter(Boolean);

  const rows = await db
    .select(listColumns)
    .from(entries)
    .where(and(...conditions));

  const order = new Map(slugs.map((s, i) => [s, i]));
  return rows.sort(
    (a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0),
  );
}

/** Lore pages that actually carry prose — the empty Notion stubs are noise. */
export async function listLoreWithContent(
  user: SessionUser,
  limit = 8,
): Promise<EntryListItem[]> {
  const conditions = [
    liveOnly(),
    readable(user),
    eq(entries.kind, "lore"),
    sql`length(trim(coalesce(${entries.body}, ''))) > 0`,
  ].filter(Boolean);

  return db
    .select(listColumns)
    .from(entries)
    .where(and(...conditions))
    .orderBy(desc(sql`length(${entries.body})`), asc(entries.name))
    .limit(limit);
}

/** Total matching `opts`, so a listing can page without silently truncating. */
export async function countEntries(
  user: SessionUser,
  opts: ListOptions = {},
): Promise<number> {
  const conditions = listConditions(user, opts);
  const [row] = await db
    .select({ total: count() })
    .from(entries)
    .where(conditions.length ? and(...conditions) : undefined);
  return row?.total ?? 0;
}

export async function countByKind(user: SessionUser) {
  const conditions = [liveOnly(), readable(user)].filter(Boolean);
  const rows = await db
    .select({ kind: entries.kind, total: count() })
    .from(entries)
    .where(and(...conditions))
    .groupBy(entries.kind);

  const out: Partial<Record<EntryKind, number>> = {};
  for (const r of rows) out[r.kind] = r.total;
  return out;
}

/**
 * `includeArchived` defaults to false: an archived entry is meant to be out
 * of the way until restored, so its detail/edit pages must 404 the same way
 * it already disappears from lists and search — for the DM too, not just
 * players. Pass `includeArchived: true` only from a future flow that
 * explicitly needs to preview an archived entry (none does today).
 */
export async function getEntryBySlug(
  user: SessionUser,
  slug: string,
  opts: { includeArchived?: boolean } = {},
) {
  const conditions = [
    eq(entries.slug, slug),
    opts.includeArchived ? undefined : liveOnly(),
    readable(user),
  ].filter(Boolean);
  const [row] = await db
    .select()
    .from(entries)
    .where(and(...conditions))
    .limit(1);

  if (!row) return null;
  return user.role === "dm" ? row : redactForPlayer(row);
}

export async function getEntryById(
  user: SessionUser,
  id: string,
  opts: { includeArchived?: boolean } = {},
) {
  const conditions = [
    eq(entries.id, id),
    opts.includeArchived ? undefined : liveOnly(),
    readable(user),
  ].filter(Boolean);
  const [row] = await db
    .select()
    .from(entries)
    .where(and(...conditions))
    .limit(1);
  if (!row) return null;
  return user.role === "dm" ? row : redactForPlayer(row);
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
  user: SessionUser,
  entryId: string,
): Promise<RelatedEntry[]> {
  const conditions = [
    eq(links.sourceId, entryId),
    isNull(entries.archivedAt),
    readable(user),
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
    .where(and(...conditions))
    .orderBy(asc(entries.name))
    .limit(200);
}

/** Incoming edges: "Linked mentions" — what refers to this entry. */
export async function getBacklinks(
  user: SessionUser,
  entryId: string,
): Promise<RelatedEntry[]> {
  const conditions = [
    eq(links.targetId, entryId),
    isNull(entries.archivedAt),
    readable(user),
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
    .where(and(...conditions))
    .orderBy(asc(entries.name))
    .limit(200);
}

export async function getChildren(user: SessionUser, parentId: string) {
  const conditions = [
    eq(entries.parentId, parentId),
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
    })
    .from(entries)
    .where(and(...conditions))
    .orderBy(asc(entries.name))
    .limit(200);
}

export async function getParent(user: SessionUser, parentId: string | null) {
  if (!parentId) return null;
  const conditions = [eq(entries.id, parentId), readable(user)].filter(Boolean);
  const [row] = await db
    .select({
      id: entries.id,
      slug: entries.slug,
      name: entries.name,
      kind: entries.kind,
    })
    .from(entries)
    .where(and(...conditions))
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
 * ts_headline does NOT HTML-escape the document — it returns the raw text with
 * StartSel/StopSel inserted. So highlight with private-use sentinels, escape
 * the whole snippet, then swap the sentinels for <mark> tags.
 */
const HL_START = "";
const HL_STOP = "";
const HEADLINE_OPTIONS = `MaxWords=28, MinWords=12, ShortWord=3, MaxFragments=1, StartSel=${HL_START}, StopSel=${HL_STOP}`;

function toSafeSnippet(raw: string | null): string {
  if (!raw) return "";
  return escapeHtml(raw)
    .replaceAll(HL_START, "<mark>")
    .replaceAll(HL_STOP, "</mark>");
}

/**
 * Full-text search with a trigram fallback, so a misspelled or partial name
 * ("aeterna cty") still finds the page.
 */
export async function searchEntries(
  user: SessionUser,
  query: string,
  limit = 40,
): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];

  const isDM = user.role === "dm";
  const secretClause = isDM
    ? sql`true`
    : sql`e.visibility <> 'secret' AND ${grantConditionRaw(user, sql`e.id`, sql`e.kind`)}`;
  // Players match against a vector built without DM notes — otherwise a hit
  // on a public entry would reveal what its notes say, even with no snippet.
  const vector = isDM ? sql`e.search_vector` : sql`e.player_search_vector`;
  // Players must not have DM notes surface inside a search snippet either.
  const snippetSource = isDM
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
        ts_rank(${vector}, q.tsq),
        similarity(e.name, ${q}) * 0.6
      )::float AS rank,
      ts_headline('english', ${snippetSource}, q.tsq, ${HEADLINE_OPTIONS}) AS snippet
    FROM entries e, q
    WHERE e.archived_at IS NULL
      AND ${secretClause}
      AND (
        ${vector} @@ q.tsq
        OR e.name % ${q}
        OR e.name ILIKE ${"%" + q + "%"}
      )
    ORDER BY rank DESC, e.name ASC
    LIMIT ${limit}
  `);

  const ftsHits = (rows.rows as SearchHit[]).map((hit) => ({
    ...hit,
    snippet: toSafeSnippet(hit.snippet),
  }));

  if (ftsHits.length >= limit) return ftsHits;

  // Semantic fallback/supplement: only for entries the full-text pass
  // missed, and only if the local embedding model responds within budget —
  // slow or unavailable (e.g. a cold model load) degrades silently to the
  // FTS-only results above rather than blocking the search response.
  const semanticHits = await semanticSearch(user, q, limit - ftsHits.length, isDM).catch(
    () => [],
  );
  const seen = new Set(ftsHits.map((h) => h.id));
  const merged = [...ftsHits];
  for (const hit of semanticHits) {
    if (seen.has(hit.id)) continue;
    seen.add(hit.id);
    merged.push(hit);
  }
  return merged;
}

const SEMANTIC_SEARCH_TIMEOUT_MS = 1200;
/**
 * Minimum cosine similarity for a semantic hit to count at all. Calibrated
 * against this corpus's actual embeddings, including a check this floor
 * hadn't originally covered: this setting's abundant apostrophe'd fantasy
 * names (Zi'rzamin, Qa'zshahr'in, ...) share enough surface/subword pattern
 * with an arbitrary random string that a naive low floor (0.3) let pure
 * gibberish score up to ~0.45 against them by coincidence, not meaning.
 * 0.5 clears that noise band while still keeping genuine topical matches
 * (e.g. "a storm god who rules the sky" scores 0.54-0.59 against this
 * corpus's actual storm deities).
 */
const SEMANTIC_SIMILARITY_FLOOR = 0.5;

/**
 * Finds entries by meaning rather than literal keyword overlap — "storm god"
 * finds Zeus even without that exact word in his page. Bounded by a short
 * timeout: this only ever supplements full-text search, and a slow/cold
 * model must never make the whole search request slow.
 */
async function semanticSearch(
  user: SessionUser,
  query: string,
  limit: number,
  isDM: boolean,
): Promise<SearchHit[]> {
  if (limit <= 0) return [];
  const { embed } = await import("@/lib/embeddings");
  const vector = await Promise.race([
    embed(query),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("semantic search timed out")), SEMANTIC_SEARCH_TIMEOUT_MS),
    ),
  ]);
  const vecLiteral = `[${vector.join(",")}]`;
  const secretClause = isDM
    ? sql`true`
    : sql`e.visibility <> 'secret' AND ${grantConditionRaw(user, sql`e.id`, sql`e.kind`)}`;

  const rows = await db.execute<SearchHit>(sql`
    SELECT e.id, e.slug, e.name, e.kind, e.summary, e.visibility,
      (1 - (e.embedding <=> ${vecLiteral}::vector)) AS rank,
      '' AS snippet
    FROM entries e
    WHERE e.archived_at IS NULL
      AND e.embedding IS NOT NULL
      AND ${secretClause}
      -- A pure nearest-K lookup with no cutoff would always return
      -- something, even for a query unrelated to anything in the codex —
      -- this floor keeps "no real match" honestly empty instead of padding
      -- results with noise.
      AND (1 - (e.embedding <=> ${vecLiteral}::vector)) > ${SEMANTIC_SIMILARITY_FLOOR}
    ORDER BY e.embedding <=> ${vecLiteral}::vector ASC
    LIMIT ${limit}
  `);
  return rows.rows as SearchHit[];
}

/** Lightweight name-only lookup that powers the command palette. */
export async function quickFind(user: SessionUser, query: string, limit = 12) {
  const q = query.trim();
  if (!q) return [];
  const secretClause =
    user.role === "dm"
      ? sql`true`
      : sql`visibility <> 'secret' AND ${grantConditionRaw(user, sql`entries.id`, sql`entries.kind`)}`;
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

export async function listAllTags(user: SessionUser) {
  const secretClause =
    user.role === "dm"
      ? sql`true`
      : sql`visibility <> 'secret' AND ${grantConditionRaw(user, sql`entries.id`, sql`entries.kind`)}`;
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

export async function getRecentlyUpdated(user: SessionUser, limit = 8) {
  const conditions = [liveOnly(), readable(user)].filter(Boolean);
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
    .where(and(...conditions))
    .orderBy(desc(entries.updatedAt))
    .limit(limit);
}

export type GraphNode = { id: string; slug: string; name: string; kind: EntryKind };
export type GraphEdge = { source: string; target: string; relation: string };

/**
 * The continent-wide backlink graph, filtered to exactly what this user may
 * see. An edge is included only when *both* endpoints are visible — an edge
 * to a node the player can't see would otherwise leak that node's existence
 * (and its name, via the edge's own metadata) even with the node itself
 * hidden.
 */
export async function getGraphData(
  user: SessionUser,
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const conditions = [liveOnly(), readable(user)].filter(Boolean);
  const nodes = await db
    .select({ id: entries.id, slug: entries.slug, name: entries.name, kind: entries.kind })
    .from(entries)
    .where(and(...conditions))
    .limit(5000);

  const visible = new Set(nodes.map((n) => n.id));
  const rawEdges = await db
    .select({ source: links.sourceId, target: links.targetId, relation: links.relation })
    .from(links)
    .limit(20000);

  const edges = rawEdges.filter((e) => visible.has(e.source) && visible.has(e.target));
  return { nodes, edges };
}

/**
 * Resolves `[[Wiki Links]]` while rendering a page, scoped to what this user
 * may read: a player never gets a link to a secret, ungranted or archived
 * entry (which would confirm it exists). Short forms ("Bacchus") and explicit
 * `aliases` resolve the same way they do in the link graph.
 */
export async function getWikiLinkResolver(user: SessionUser): Promise<WikiLinkResolver> {
  const conditions = [liveOnly(), readable(user)].filter(Boolean);
  const rows = await db
    .select({
      id: entries.id,
      name: entries.name,
      slug: entries.slug,
      summary: entries.summary,
      kind: entries.kind,
      fields: entries.fields,
    })
    .from(entries)
    .where(and(...conditions));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const index = buildNameIndex(
    rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, aliases: parseAliases(r.fields) })),
  );
  return (name: string) => {
    const id = index.get(normalizeName(name));
    const hit = id ? byId.get(id) : undefined;
    return hit ? { slug: hit.slug, summary: hit.summary || undefined } : null;
  };
}

/**
 * Entries that mention this one by name (or alias) in their text without
 * linking it — Obsidian's "unlinked mentions". A DM tool: each one is a link
 * waiting to be made. Names under four characters are skipped as too noisy.
 */
export async function getUnlinkedMentions(
  user: SessionUser,
  entry: { id: string; name: string; fields: Record<string, string> | null },
  limit = 12,
) {
  const names = [entry.name, ...parseAliases(entry.fields)]
    .map((n) => n.trim())
    .filter((n) => n.length >= 4);
  if (names.length === 0) return [];

  const mentions = or(...names.map((n) => sql`${entries.body} ILIKE ${`%${n}%`}`));
  const conditions = [
    liveOnly(),
    readable(user),
    ne(entries.id, entry.id),
    mentions,
    // Only an explicit link counts; a "named" edge is exactly an unlinked mention.
    sql`NOT EXISTS (SELECT 1 FROM links l WHERE l.source_id = ${entries.id} AND l.target_id = ${entry.id} AND l.relation <> 'named')`,
  ].filter(Boolean);

  return db
    .select({ id: entries.id, slug: entries.slug, name: entries.name, kind: entries.kind, summary: entries.summary })
    .from(entries)
    .where(and(...conditions))
    .orderBy(asc(entries.name))
    .limit(limit);
}
