"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Network } from "lucide-react";
import { EmptyState } from "@/components/entry-card";
import { Card, CardContent } from "@/components/ui/card";
import { GRAPH_HEIGHT, GRAPH_WIDTH, type GraphEdge, type GraphNode, type GraphPoint } from "@/lib/graph-layout";
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

export function GraphView({
  nodes,
  edges,
  positions,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Pre-computed on the server by `layoutGraph`; the client only draws. */
  positions: Record<string, GraphPoint>;
}) {
  const router = useRouter();
  const [hovered, setHovered] = useState<string | null>(null);
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

  if (nodes.length === 0) {
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
        <svg
          viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
          className="block h-auto w-full"
          role="group"
          aria-label={`Backlink graph: ${nodes.length} pages, ${edges.length} connections`}
        >
          <g opacity={0.35}>
            {edges.map((e, i) => {
              const a = positions[e.source];
              const b = positions[e.target];
              if (!a || !b) return null;
              const dim = hovered && !(hovered === e.source || hovered === e.target);
              return (
                <line
                  key={i}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  className="stroke-faint-foreground"
                  strokeWidth={dim ? 0.5 : 1.2}
                  opacity={dim ? 0.15 : 1}
                />
              );
            })}
          </g>
          {nodes.map((node) => {
            const p = positions[node.id];
            if (!p) return null;
            const isConnected = connected.has(node.id);
            const isHovered = hovered === node.id;
            const isNeighbor = hovered ? (neighbors.get(hovered)?.has(node.id) ?? false) : false;
            const dim = hovered && !isHovered && !isNeighbor;
            const r = isHovered ? 8 : isConnected ? 6 : 4;
            return (
              <g
                key={node.id}
                transform={`translate(${p.x}, ${p.y})`}
                onMouseEnter={() => setHovered(node.id)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(node.id)}
                onBlur={() => setHovered(null)}
                onClick={() => router.push(`/codex/entry/${node.slug}`)}
                className="cursor-pointer outline-none [&:focus-visible>circle]:stroke-ring [&:focus-visible>circle]:stroke-[3]"
                role="button"
                tabIndex={0}
                aria-label={`${kindLabel(node.kind)}: ${node.name}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter") router.push(`/codex/entry/${node.slug}`);
                }}
              >
                <circle
                  r={r}
                  className={cn(FILL_BY_KIND[node.kind] ?? "fill-chart-5")}
                  opacity={dim ? 0.25 : 1}
                />
                {(isHovered || (!hovered && isConnected && nodes.length < 60)) && (
                  <text x={r + 4} y={4} fontSize={11} className="pointer-events-none fill-foreground">
                    {node.name}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Colour legend">
          {GROUPS.map((g) => (
            <li key={g.id} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={cn("size-2.5 rounded-full", g.dot)} />
              {g.label}
            </li>
          ))}
        </ul>
        <p className="text-xs text-faint-foreground">
          {nodes.length} pages, {edges.length} connections. Hover or focus a node to trace its links, click or press
          Enter to open it.
        </p>
      </CardContent>
    </Card>
  );
}
