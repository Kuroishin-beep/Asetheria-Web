import type { GraphEdge, GraphNode } from "@/lib/graph-layout";
import { PARENT_RELATION } from "@/lib/graph-layout";

/**
 * Filtering and clustering for the world graph. Pure and framework-free: the
 * server runs it over the nodes and edges it already filtered for this viewer,
 * so a filter can only narrow what the viewer may see, never widen it.
 */

export type GraphFilters = { kinds: string[]; region: string; tag: string; cluster: boolean };
export const NO_FILTERS: GraphFilters = { kinds: [], region: "", tag: "", cluster: false };

export type Facet = { value: string; count: number };
export type GraphFacets = { kinds: Facet[]; regions: Facet[]; tags: Facet[] };

// A native select handles a few hundred options (and type-to-find) well, so every region and tag the
// viewer can see is offered; these caps only guard against a runaway.
const MAX_REGIONS = 400;
const MAX_TAGS = 800;

const byCountThenName = (a: Facet, b: Facet) => b.count - a.count || a.value.localeCompare(b.value);

/** What can be filtered on, counted over the pages this viewer can see. */
export function buildFacets(nodes: readonly GraphNode[]): GraphFacets {
  const kinds = new Map<string, number>();
  const regions = new Map<string, number>();
  const tags = new Map<string, number>();
  for (const n of nodes) {
    kinds.set(n.kind, (kinds.get(n.kind) ?? 0) + 1);
    if (n.region) regions.set(n.region, (regions.get(n.region) ?? 0) + 1);
    for (const t of n.tags) tags.set(t, (tags.get(t) ?? 0) + 1);
  }
  const list = (m: Map<string, number>) => [...m.entries()].map(([value, count]) => ({ value, count })).sort(byCountThenName);
  return { kinds: list(kinds), regions: list(regions).slice(0, MAX_REGIONS), tags: list(tags).slice(0, MAX_TAGS) };
}

type Raw = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Reads the filters from the URL; a value that is not a real option is ignored, so a bad link just shows everything. */
export function parseGraphFilters(raw: Raw, facets: GraphFacets): GraphFilters {
  const knownKinds = new Set(facets.kinds.map((f) => f.value));
  const kinds = first(raw.kind)
    .split(",")
    .map((s) => s.trim())
    .filter((k) => knownKinds.has(k));
  const region = first(raw.region);
  const tag = first(raw.tag);
  return {
    kinds: [...new Set(kinds)],
    region: facets.regions.some((f) => f.value === region) ? region : "",
    tag: facets.tags.some((f) => f.value === tag) ? tag : "",
    cluster: first(raw.cluster) === "parent",
  };
}

export function isFiltered(f: GraphFilters): boolean {
  return f.kinds.length > 0 || f.region !== "" || f.tag !== "";
}

export type FilteredGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** The pages that satisfy the filters; the rest shown are their direct neighbours. */
  matches: string[];
};

/**
 * With no filter, everything. With one, the pages that match it plus their
 * direct neighbours, and the links that touch a match (a link between two
 * neighbours is left out, so the picture stays about what was asked for).
 * With clustering on, child-to-parent edges are added among the shown pages.
 */
export function filterGraph(nodes: readonly GraphNode[], edges: readonly GraphEdge[], f: GraphFilters): FilteredGraph {
  let shownNodes: GraphNode[];
  let shownEdges: GraphEdge[];
  let matches: string[];

  if (!isFiltered(f)) {
    shownNodes = [...nodes];
    shownEdges = [...edges];
    matches = nodes.map((n) => n.id);
  } else {
    const kinds = new Set(f.kinds);
    const tag = f.tag.toLowerCase();
    const matchSet = new Set<string>();
    for (const n of nodes) {
      if (kinds.size && !kinds.has(n.kind)) continue;
      if (f.region && n.region !== f.region) continue;
      if (tag && !n.tags.some((t) => t.toLowerCase() === tag)) continue;
      matchSet.add(n.id);
    }
    const visible = new Set(matchSet);
    shownEdges = [];
    for (const e of edges) {
      if (!matchSet.has(e.source) && !matchSet.has(e.target)) continue;
      shownEdges.push(e);
      visible.add(e.source);
      visible.add(e.target);
    }
    shownNodes = nodes.filter((n) => visible.has(n.id));
    matches = nodes.filter((n) => matchSet.has(n.id)).map((n) => n.id);
  }

  if (f.cluster) {
    const shown = new Set(shownNodes.map((n) => n.id));
    for (const n of shownNodes) {
      if (n.parentId && shown.has(n.parentId)) shownEdges.push({ source: n.parentId, target: n.id, relation: PARENT_RELATION });
    }
  }
  return { nodes: shownNodes, edges: shownEdges, matches };
}

/** The URL query for a set of filters; defaults are left out. */
export function graphQuery(f: GraphFilters): string {
  const params = new URLSearchParams();
  if (f.kinds.length) params.set("kind", f.kinds.join(","));
  if (f.region) params.set("region", f.region);
  if (f.tag) params.set("tag", f.tag);
  if (f.cluster) params.set("cluster", "parent");
  return params.toString();
}
