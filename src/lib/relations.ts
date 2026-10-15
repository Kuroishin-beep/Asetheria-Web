import "server-only";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { entries, pageRelations, type EntryKind } from "@/db/schema";
import { liveOnly, readable } from "@/lib/entries";
import { RELATION_TYPES, RELATION_TYPE_KEYS, canonical, checkRelation, describeFrom, type Edge, type RelationGroup, type RelationType } from "@/lib/relations-core";
import type { SessionUser } from "@/lib/session";

/**
 * Relations: the database side. A relation is shown to a viewer only when BOTH of its ends are pages that
 * viewer may read, so a hidden person never appears as a name, a count, a line or a gap with a label.
 */

export type PageRef = { id: string; slug: string; name: string; kind: EntryKind };
export type ShownRelation = { id: string; type: RelationType; note: string; from: string; to: string; text: string; other: PageRef };

const isType = (t: string): t is RelationType => (RELATION_TYPE_KEYS as string[]).includes(t);

/** The pages among `ids` that this viewer may read (live and permitted). */
async function readablePages(user: SessionUser, ids: string[]): Promise<Map<string, PageRef>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: entries.id, slug: entries.slug, name: entries.name, kind: entries.kind })
    .from(entries)
    .where(and(inArray(entries.id, [...new Set(ids)]), liveOnly(), readable(user)));
  return new Map(rows.map((r) => [r.id, r]));
}

type Row = { id: string; fromId: string; toId: string; type: string; note: string };
const edgeOf = (r: Row): Edge => ({ id: r.id, from: r.fromId, to: r.toId, type: r.type as RelationType, note: r.note });

/** The relations of one page that this viewer may see, each read from this page's end. */
export async function relationsOf(user: SessionUser, entryId: string): Promise<ShownRelation[]> {
  const rows = await db.select().from(pageRelations).where(or(eq(pageRelations.fromId, entryId), eq(pageRelations.toId, entryId)));
  const others = rows.map((r) => (r.fromId === entryId ? r.toId : r.fromId));
  const pages = await readablePages(user, others);
  const shown: ShownRelation[] = [];
  for (const r of rows) {
    const other = pages.get(r.fromId === entryId ? r.toId : r.fromId);
    if (!other || !isType(r.type)) continue;
    shown.push({ id: r.id, type: r.type, note: r.note, from: r.fromId, to: r.toId, other, text: describeFrom(edgeOf(r), entryId, other.name) });
  }
  return shown.sort((a, b) => RELATION_TYPE_KEYS.indexOf(a.type) - RELATION_TYPE_KEYS.indexOf(b.type) || a.other.name.localeCompare(b.other.name, "en"));
}

export const FAMILY_NODE_CAP = 300;

export type FamilyGraph = { nodes: PageRef[]; edges: (Edge & { id: string })[]; truncated: boolean };

/**
 * The family of a page: everyone joined to it by family ties, following the ties outwards but never through a
 * page the viewer may not read (so a hidden relative cuts off their own branch and nothing hints at it).
 */
export async function familyGraph(user: SessionUser, rootId: string): Promise<FamilyGraph> {
  const familyTypes = RELATION_TYPE_KEYS.filter((t) => RELATION_TYPES[t].group === "family");
  const root = (await readablePages(user, [rootId])).get(rootId);
  if (!root) return { nodes: [], edges: [], truncated: false };
  const nodes = new Map<string, PageRef>([[rootId, root]]);
  const edges = new Map<string, Edge & { id: string }>();
  let frontier = [rootId];
  let truncated = false;
  while (frontier.length > 0) {
    const rows = await db
      .select()
      .from(pageRelations)
      .where(and(inArray(pageRelations.type, familyTypes), or(inArray(pageRelations.fromId, frontier), inArray(pageRelations.toId, frontier))));
    const candidates = rows.flatMap((r) => [r.fromId, r.toId]).filter((id) => !nodes.has(id));
    const pages = await readablePages(user, candidates);
    const next: string[] = [];
    for (const r of rows) {
      const a = nodes.get(r.fromId) ?? pages.get(r.fromId);
      const b = nodes.get(r.toId) ?? pages.get(r.toId);
      if (!a || !b) continue;
      for (const p of [a, b]) {
        if (nodes.has(p.id)) continue;
        if (nodes.size >= FAMILY_NODE_CAP) {
          truncated = true;
          continue;
        }
        nodes.set(p.id, p);
        next.push(p.id);
      }
      if (nodes.has(a.id) && nodes.has(b.id)) edges.set(r.id, { ...edgeOf(r), id: r.id });
    }
    frontier = next;
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()], truncated };
}

export type WebFilters = { types: RelationType[]; kinds: string[] };
export type WebGraph = { nodes: PageRef[]; edges: (Edge & { id: string })[]; truncated: boolean };
export const WEB_EDGE_CAP = 500;

/** Every tie in the wider world between two pages the viewer may read, optionally narrowed by type and by kind of page. */
export async function webGraph(user: SessionUser, filters: WebFilters): Promise<WebGraph> {
  const webTypes = RELATION_TYPE_KEYS.filter((t) => RELATION_TYPES[t].group === "web");
  const types = filters.types.length ? filters.types.filter((t) => webTypes.includes(t)) : webTypes;
  if (types.length === 0) return { nodes: [], edges: [], truncated: false };
  const rows = await db.select().from(pageRelations).where(inArray(pageRelations.type, types));
  const pages = await readablePages(user, rows.flatMap((r) => [r.fromId, r.toId]));
  const wantKind = (p: PageRef) => filters.kinds.length === 0 || filters.kinds.includes(p.kind);
  const edges: (Edge & { id: string })[] = [];
  for (const r of rows) {
    const a = pages.get(r.fromId);
    const b = pages.get(r.toId);
    if (a && b && wantKind(a) && wantKind(b)) edges.push({ ...edgeOf(r), id: r.id });
  }
  const truncated = edges.length > WEB_EDGE_CAP;
  const kept = edges.slice(0, WEB_EDGE_CAP);
  const used = new Set(kept.flatMap((e) => [e.from, e.to]));
  return { nodes: [...used].map((id) => pages.get(id) as PageRef), edges: kept, truncated };
}

export type AddInput = { fromId: string; toId: string; type: RelationType; note: string };
export type AddResult = { ok: true; id: string } | { ok: false; errors: string[] };

/** Adds a relation after every rule has been checked against the pages and the relations already there. DM only. */
export async function addRelation(dm: { id: string }, input: AddInput): Promise<AddResult> {
  const pages = await db
    .select({ id: entries.id, name: entries.name, kind: entries.kind })
    .from(entries)
    .where(and(inArray(entries.id, [input.fromId, input.toId]), liveOnly()));
  const info = new Map(pages.map((p) => [p.id, p]));
  const existing = await db.select().from(pageRelations).where(eq(pageRelations.type, input.type));
  const counts = await db.execute<{ id: string; n: number }>(sql`
    SELECT p.id, count(r.id)::int AS n FROM (VALUES (${input.fromId}::uuid), (${input.toId}::uuid)) AS p(id)
    LEFT JOIN relations r ON r.from_id = p.id OR r.to_id = p.id GROUP BY p.id`);
  const countById = new Map(counts.rows.map((r) => [r.id, r.n]));

  const edge: Edge = { from: input.fromId, to: input.toId, type: input.type, note: input.note };
  const errors = checkRelation(edge, {
    kinds: new Map(pages.map((p) => [p.id, p.kind])),
    sameType: existing.map(edgeOf),
    countOnPage: (id) => countById.get(id) ?? 0,
    names: (id) => info.get(id)?.name ?? "That page",
  });
  if (errors.length > 0) return { ok: false, errors };

  const stored = canonical(edge);
  try {
    const [row] = await db
      .insert(pageRelations)
      .values({ fromId: stored.from, toId: stored.to, type: stored.type, note: input.note.trim(), createdBy: dm.id })
      .returning({ id: pageRelations.id });
    return { ok: true, id: row.id };
  } catch (e) {
    // Two requests adding the same relation at once: the unique index lets one in.
    if ((e as { code?: string; cause?: { code?: string } }).code === "23505" || (e as { cause?: { code?: string } }).cause?.code === "23505") return { ok: false, errors: ["That relation already exists."] };
    throw e;
  }
}

export async function removeRelation(id: string): Promise<boolean> {
  const rows = await db.delete(pageRelations).where(eq(pageRelations.id, id)).returning({ id: pageRelations.id });
  return rows.length > 0;
}

export function groupOf(type: RelationType): RelationGroup {
  return RELATION_TYPES[type].group;
}
