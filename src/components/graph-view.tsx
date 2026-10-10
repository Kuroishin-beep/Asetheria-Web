"use client";

import { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Network } from "lucide-react";
import { EmptyState } from "@/components/entry-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { graphQuery, isFiltered, type GraphFacets, type GraphFilters } from "@/lib/graph-filter";
import { GRAPH_HEIGHT, GRAPH_WIDTH, PARENT_RELATION, type GraphEdge, type GraphNode, type GraphPoint } from "@/lib/graph-layout";
import { kindLabel } from "@/lib/kinds";
import { cn } from "@/lib/utils";

/**
 * Node colours come from the five chart tokens, grouped by what kind of thing a
 * page is, so the graph follows the theme in light and dark and the legend can
 * name every colour. (Class names are written out in full so Tailwind sees them.)
 */
const GROUPS = [
  {
    id: "places",
    label: "Places and powers",
    fill: "fill-chart-1",
    dot: "bg-chart-1",
    kinds: ["empire", "location", "organization", "faction", "quest", "session"],
  },
  {
    id: "nature",
    label: "Nature and things",
    fill: "fill-chart-2",
    dot: "bg-chart-2",
    kinds: ["flora", "fauna", "ore", "item", "creature"],
  },
  {
    id: "divine",
    label: "Gods and lore",
    fill: "fill-chart-3",
    dot: "bg-chart-3",
    kinds: ["deity", "pantheon", "lore"],
  },
  {
    id: "people",
    label: "People",
    fill: "fill-chart-4",
    dot: "bg-chart-4",
    kinds: ["npc", "family"],
  },
  {
    id: "rules",
    label: "Rules and notes",
    fill: "fill-chart-5",
    dot: "bg-chart-5",
    kinds: ["rule", "system", "table", "note"],
  },
] as const;

const FILL_BY_KIND: Record<string, string> = Object.fromEntries(
  GROUPS.flatMap((g) => g.kinds.map((k) => [k, g.fill])),
);

/** Pages drawn without a label until hovered, above this many shown. */
const LABEL_ALL_BELOW = 60;
const NEIGHBOUR_DIM = 0.55;

type Positions = Record<string, GraphPoint>;

/**
 * Every link in the picture, drawn once and never redrawn while the pointer
 * moves. All ordinary links are one path and all parent links another: a few
 * thousand separate <line> elements cost the browser far more to style, lay
 * out and paint than two paths holding the same segments.
 */
const EdgeLayer = memo(function EdgeLayer({ edges, positions }: { edges: GraphEdge[]; positions: Positions }) {
  const { links, parents } = useMemo(() => {
    const segment = (e: GraphEdge) => {
      const a = positions[e.source];
      const b = positions[e.target];
      return a && b ? `M${a.x} ${a.y}L${b.x} ${b.y}` : "";
    };
    return {
      links: edges.filter((e) => e.relation !== PARENT_RELATION).map(segment).join(""),
      parents: edges.filter((e) => e.relation === PARENT_RELATION).map(segment).join(""),
    };
  }, [edges, positions]);
  return (
    // Never the target of the pointer: skipping the links in hit-testing is a large saving over thousands of them.
    <g opacity={0.35} className="pointer-events-none" fill="none">
      <path d={links} className="stroke-faint-foreground" strokeWidth={1.2} />
      {parents && <path d={parents} className="stroke-primary" strokeWidth={1} strokeDasharray="3 3" />}
    </g>
  );
});

/**
 * Which page the pointer (or focus) is on. Kept outside React state so a hover
 * re-renders only the overlay that draws it, not the graph, its controls and
 * their option lists: on a busy canvas that is the difference between one and
 * three frames per move on a slow CPU.
 */
function createHoverStore() {
  let current: string | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set(id: string | null) {
      if (id === current) return;
      current = id;
      for (const l of listeners) l();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
type HoverStore = ReturnType<typeof createHoverStore>;

/** The hover trace: the hovered page, its links and its name, drawn in its own small svg above the picture. */
const HoverLayer = memo(function HoverLayer({
  store,
  positions,
  neighbors,
  names,
}: {
  store: HoverStore;
  positions: Positions;
  neighbors: Map<string, Set<string>>;
  names: Map<string, GraphNode>;
}) {
  const hovered = useSyncExternalStore(store.subscribe, store.get, () => null);
  const point = hovered ? positions[hovered] : null;
  return (
    <svg viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`} className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
      {hovered && point && (
        <g className="pointer-events-none" data-testid="graph-hover">
          {[...(neighbors.get(hovered) ?? [])].map((id) => {
            const q = positions[id];
            return q ? (
              <g key={id}>
                <line x1={point.x} y1={point.y} x2={q.x} y2={q.y} className="stroke-foreground" strokeWidth={1.6} opacity={0.8} />
                <circle cx={q.x} cy={q.y} r={8} className="fill-none stroke-foreground" strokeWidth={1.5} />
              </g>
            ) : null;
          })}
          <circle cx={point.x} cy={point.y} r={9} className="fill-none stroke-ring" strokeWidth={2.5} />
          <text x={point.x + 12} y={point.y + 4} fontSize={12} className="fill-foreground font-semibold">
            {names.get(hovered)?.name}
          </text>
        </g>
      )}
    </svg>
  );
});

/**
 * Every page, drawn once. Events are handled on the svg (delegation), not per
 * node, and hover is a separate overlay, so moving the pointer over a thousand
 * nodes never re-renders a thousand nodes.
 */
const NodeLayer = memo(function NodeLayer({
  nodes,
  positions,
  connected,
  matchSet,
  filtered,
  tabbableId,
  labelAll,
}: {
  nodes: GraphNode[];
  positions: Positions;
  connected: Set<string>;
  matchSet: Set<string>;
  filtered: boolean;
  tabbableId: string | null;
  labelAll: boolean;
}) {
  return (
    <>
      {nodes.map((node) => {
        const p = positions[node.id];
        if (!p) return null;
        const isConnected = connected.has(node.id);
        const r = isConnected ? 6 : 4;
        const isMatch = !filtered || matchSet.has(node.id);
        return (
          <g
            key={node.id}
            transform={`translate(${p.x}, ${p.y})`}
            data-node-id={node.id}
            className="cursor-pointer outline-none [&:focus-visible>circle]:stroke-ring [&:focus-visible>circle]:stroke-[3]"
            role="button"
            tabIndex={node.id === tabbableId ? 0 : -1}
            aria-label={`${kindLabel(node.kind)}: ${node.name}`}
          >
            <circle r={r} className={cn(FILL_BY_KIND[node.kind] ?? "fill-chart-5")} opacity={isMatch ? 1 : NEIGHBOUR_DIM} />
            {labelAll && isConnected && (
              <text x={r + 4} y={4} fontSize={11} className="pointer-events-none fill-foreground">
                {node.name}
              </text>
            )}
          </g>
        );
      })}
    </>
  );
});

export function GraphView({
  nodes,
  edges,
  positions,
  matches,
  facets,
  filters,
  total,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Pre-computed on the server by `layoutGraph`; the client only draws. */
  positions: Positions;
  /** Ids of the pages that satisfy the filters (all of them when nothing is filtered). */
  matches: string[];
  facets: GraphFacets;
  filters: GraphFilters;
  /** How many pages this viewer can see in all. */
  total: number;
}) {
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);
  const [pending, startTransition] = useTransition();
  const [hoverStore] = useState(createHoverStore);
  const setHovered = hoverStore.set;
  const [activeId, setActiveId] = useState<string | null>(null);
  const filtered = isFiltered(filters);

  // The controls keep their own copy of the choices, so two quick changes both land: each one builds on the
  // last choice made, not on the page props, which only catch up once the server has answered.
  const [draft, setDraft] = useState<GraphFilters>(filters);
  const draftRef = useRef(filters);
  useEffect(() => {
    draftRef.current = filters;
    setDraft(filters);
  }, [filters]);

  const matchSet = useMemo(() => new Set(matches), [matches]);
  const bySlug = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const connected = useMemo(() => {
    const set = new Set<string>();
    for (const e of edges) {
      set.add(e.source);
      set.add(e.target);
    }
    return set;
  }, [edges]);
  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const e of edges) {
      (map.get(e.source) ?? map.set(e.source, new Set()).get(e.source)!).add(e.target);
      (map.get(e.target) ?? map.set(e.target, new Set()).get(e.target)!).add(e.source);
    }
    return map;
  }, [edges]);

  // One tab stop for the whole graph: arrow keys move between pages from there.
  const defaultId = useMemo(() => {
    const firstMatch = nodes.find((n) => matchSet.has(n.id) && connected.has(n.id));
    return (firstMatch ?? nodes.find((n) => connected.has(n.id)) ?? nodes[0])?.id ?? null;
  }, [nodes, matchSet, connected]);
  const tabbableId = activeId && positions[activeId] ? activeId : defaultId;

  function update(next: Partial<GraphFilters>) {
    const merged: GraphFilters = { ...draftRef.current, ...next };
    draftRef.current = merged;
    setDraft(merged);
    const qs = graphQuery(merged);
    startTransition(() => router.replace(qs ? `/graph?${qs}` : "/graph", { scroll: false }));
  }

  function nodeIdOf(target: EventTarget | null): string | null {
    return (target as Element | null)?.closest?.("[data-node-id]")?.getAttribute("data-node-id") ?? null;
  }

  function open(id: string) {
    const node = bySlug.get(id);
    if (node) router.push(`/codex/entry/${node.slug}`);
  }

  /** The nearest page in a direction: ahead of the current one, preferring those lined up with it. */
  function neighbourInDirection(fromId: string, dx: number, dy: number): string | null {
    const from = positions[fromId];
    if (!from) return null;
    let best: { id: string; score: number } | null = null;
    for (const node of nodes) {
      if (node.id === fromId) continue;
      const p = positions[node.id];
      if (!p) continue;
      const vx = p.x - from.x;
      const vy = p.y - from.y;
      const along = vx * dx + vy * dy;
      if (along <= 0) continue;
      const across = Math.abs(vx * dy - vy * dx);
      const score = along + 2 * across;
      if (!best || score < best.score) best = { id: node.id, score };
    }
    return best?.id ?? null;
  }

  function focusNode(id: string) {
    setActiveId(id);
    const el = svgRef.current?.querySelector<SVGGElement>(`[data-node-id="${CSS.escape(id)}"]`);
    el?.focus();
  }

  function onKeyDown(e: KeyboardEvent<SVGSVGElement>) {
    const id = nodeIdOf(e.target);
    if (!id) return;
    const dir: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
    if (e.key in dir) {
      e.preventDefault();
      const next = neighbourInDirection(id, dir[e.key][0], dir[e.key][1]);
      if (next) focusNode(next);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open(id);
    } else if (e.key === "Escape") {
      (e.target as SVGElement).blur?.();
      setHovered(null);
    }
  }

  if (total === 0) {
    return (
      <EmptyState
        Icon={Network}
        title="Nothing to show yet"
        hint="Nothing has been revealed to you, so there is nothing to connect."
      />
    );
  }

  return (
    <Card size="sm" className="overflow-hidden">
      <CardContent className="grid gap-3">
        <div className="no-print flex flex-wrap items-end gap-x-4 gap-y-3" role="group" aria-label="Graph filters">
          <div className="grid gap-1">
            <Label htmlFor="graph-kind">Kind</Label>
            <NativeSelect id="graph-kind" value={draft.kinds[0] ?? ""} onChange={(e) => update({ kinds: e.target.value ? [e.target.value] : [] })}>
              <NativeSelectOption value="">All kinds</NativeSelectOption>
              {facets.kinds.map((f) => (
                <NativeSelectOption key={f.value} value={f.value}>
                  {kindLabel(f.value as GraphNode["kind"])} ({f.count})
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="graph-region">Region</Label>
            <NativeSelect id="graph-region" value={draft.region} onChange={(e) => update({ region: e.target.value })}>
              <NativeSelectOption value="">Any region</NativeSelectOption>
              {facets.regions.map((f) => (
                <NativeSelectOption key={f.value} value={f.value}>
                  {f.value} ({f.count})
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="graph-tag">Tag</Label>
            <NativeSelect id="graph-tag" value={draft.tag} onChange={(e) => update({ tag: e.target.value })}>
              <NativeSelectOption value="">Any tag</NativeSelectOption>
              {facets.tags.map((f) => (
                <NativeSelectOption key={f.value} value={f.value}>
                  {f.value} ({f.count})
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Switch id="graph-cluster" checked={draft.cluster} onCheckedChange={(on) => update({ cluster: on })} />
            <Label htmlFor="graph-cluster">Group by parent</Label>
          </div>
          {(isFiltered(draft) || draft.cluster) && (
            <Button type="button" variant="outline" size="sm" onClick={() => update({ kinds: [], region: "", tag: "", cluster: false })}>
              Clear filters
            </Button>
          )}
        </div>

        {nodes.length === 0 ? (
          <EmptyState
            Icon={Network}
            title="Nothing matches those filters"
            hint="Try another kind, region or tag, or clear the filters."
            action={
              <Button type="button" variant="outline" onClick={() => update({ kinds: [], region: "", tag: "", cluster: false })}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <div className="relative">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
            className={cn("block h-auto w-full", pending && "opacity-70")}
            role="group"
            aria-label={`Backlink graph: ${nodes.length} pages, ${edges.length} connections`}
            aria-busy={pending}
            data-testid="graph-svg"
            data-shown={nodes.length}
            onPointerOver={(e) => {
              const id = nodeIdOf(e.target);
              setHovered(id);
            }}
            onPointerLeave={() => setHovered(null)}
            onFocus={(e) => {
              const id = nodeIdOf(e.target);
              if (id) {
                setHovered(id);
                setActiveId(id);
              }
            }}
            onBlur={() => setHovered(null)}
            onClick={(e) => {
              const id = nodeIdOf(e.target);
              if (id) open(id);
            }}
            onKeyDown={onKeyDown}
          >
            <EdgeLayer edges={edges} positions={positions} />
            <NodeLayer
              nodes={nodes}
              positions={positions}
              connected={connected}
              matchSet={matchSet}
              filtered={filtered}
              tabbableId={tabbableId}
              labelAll={nodes.length < LABEL_ALL_BELOW}
            />
          </svg>
          {/* The hover trace is its own layer above the picture: moving the pointer repaints this small svg,
              not the two thousand nodes underneath it, and re-renders nothing else. */}
          <HoverLayer store={hoverStore} positions={positions} neighbors={neighbors} names={bySlug} />
          </div>
        )}

        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Colour legend">
          {GROUPS.map((g) => (
            <li key={g.id} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={cn("size-2.5 rounded-full", g.dot)} />
              {g.label}
            </li>
          ))}
        </ul>
        <p className="text-xs text-faint-foreground" aria-live="polite" data-testid="graph-summary">
          {filtered
            ? `${matches.length} ${matches.length === 1 ? "page matches" : "pages match"}; showing them and their ${nodes.length - matches.length} direct neighbours (${edges.length} connections).`
            : `${nodes.length} pages, ${edges.length} connections.`}{" "}
          Hover a node to trace its links and click it to open it. From the keyboard, Tab into the graph, move between pages with the arrow keys, and press Enter to open one.
        </p>
      </CardContent>
    </Card>
  );
}
