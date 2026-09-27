"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { EntryKind } from "@/db/schema";
import { kindIcon } from "@/lib/kinds";

type Node = { id: string; slug: string; name: string; kind: EntryKind };
type Edge = { source: string; target: string; relation: string };
type Point = { x: number; y: number; vx: number; vy: number };

const WIDTH = 900;
const HEIGHT = 640;

/** Small, stable hash so each kind always gets the same hue across sessions. */
function kindHue(kind: string): number {
  let h = 0;
  for (let i = 0; i < kind.length; i++) h = (h * 31 + kind.charCodeAt(i)) % 360;
  return h;
}

/**
 * A minimal force-directed layout — no charting library, so this stays a
 * plain dependency-free client component. Runs a fixed number of iterations
 * synchronously on mount (not a live animation loop), which is enough to
 * settle a graph this size into readable clusters without a perceptible
 * layout stall.
 */
function layout(nodes: Node[], edges: Edge[]): Map<string, Point> {
  const pos = new Map<string, Point>();
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;
  const n = nodes.length || 1;
  nodes.forEach((node, i) => {
    const angle = (i / n) * Math.PI * 2;
    const r = Math.min(WIDTH, HEIGHT) * 0.35;
    pos.set(node.id, {
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
      vx: 0,
      vy: 0,
    });
  });

  const iterations = nodes.length > 400 ? 40 : 90;
  const repulsion = 2200;
  const springLength = 90;
  const springStrength = 0.02;
  const damping = 0.85;
  const centerPull = 0.01;

  for (let iter = 0; iter < iterations; iter++) {
    // Repulsion between every pair — the O(n^2) term, capped by `iterations`
    // scaling down as the node count grows.
    for (let i = 0; i < nodes.length; i++) {
      const a = pos.get(nodes[i].id)!;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = pos.get(nodes[j].id)!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let distSq = dx * dx + dy * dy || 0.01;
        const force = repulsion / distSq;
        const dist = Math.sqrt(distSq);
        dx = (dx / dist) * force;
        dy = (dy / dist) * force;
        a.vx += dx;
        a.vy += dy;
        b.vx -= dx;
        b.vy -= dy;
      }
    }

    // Spring attraction along edges.
    for (const e of edges) {
      const a = pos.get(e.source);
      const b = pos.get(e.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const force = (dist - springLength) * springStrength;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    for (const node of nodes) {
      const p = pos.get(node.id)!;
      p.vx += (cx - p.x) * centerPull;
      p.vy += (cy - p.y) * centerPull;
      p.vx *= damping;
      p.vy *= damping;
      p.x += p.vx;
      p.y += p.vy;
      p.x = Math.max(20, Math.min(WIDTH - 20, p.x));
      p.y = Math.max(20, Math.min(HEIGHT - 20, p.y));
    }
  }

  return pos;
}

export function GraphView({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) {
  const router = useRouter();
  const [hovered, setHovered] = useState<string | null>(null);
  const positions = useMemo(() => layout(nodes, edges), [nodes, edges]);
  const connected = useMemo(() => {
    const set = new Set<string>();
    for (const e of edges) {
      set.add(e.source);
      set.add(e.target);
    }
    return set;
  }, [edges]);
  const svgRef = useRef<SVGSVGElement>(null);
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
      <p style={{ color: "var(--text-muted)", padding: "2rem 0" }}>
        Nothing to show yet — nothing has been revealed to you.
      </p>
    );
  }

  return (
    <div className="card" style={{ padding: "0.5rem", overflow: "hidden" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        role="img"
        aria-label={`Backlink graph: ${nodes.length} pages, ${edges.length} connections`}
      >
        <g opacity={0.35}>
          {edges.map((e, i) => {
            const a = positions.get(e.source);
            const b = positions.get(e.target);
            if (!a || !b) return null;
            const dim = hovered && !(hovered === e.source || hovered === e.target);
            return (
              <line
                key={i}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="var(--text-faint)"
                strokeWidth={dim ? 0.5 : 1.2}
                opacity={dim ? 0.15 : 1}
              />
            );
          })}
        </g>
        {nodes.map((node) => {
          const p = positions.get(node.id);
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
              onClick={() => router.push(`/codex/entry/${node.slug}`)}
              style={{ cursor: "pointer" }}
              role="button"
              tabIndex={0}
              aria-label={`${kindIcon(node.kind)} ${node.name}`}
              onKeyDown={(e) => {
                if (e.key === "Enter") router.push(`/codex/entry/${node.slug}`);
              }}
            >
              <circle
                r={r}
                fill={`hsl(${kindHue(node.kind)}, 65%, ${isHovered ? 65 : 55}%)`}
                opacity={dim ? 0.25 : 1}
              />
              {(isHovered || (!hovered && isConnected && nodes.length < 60)) && (
                <text
                  x={r + 4}
                  y={4}
                  fontSize={11}
                  fill="var(--text)"
                  style={{ pointerEvents: "none" }}
                >
                  {node.name}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <p style={{ fontSize: "0.75rem", color: "var(--text-faint)", padding: "0.4rem 0.6rem 0" }}>
        {nodes.length} pages, {edges.length} connections. Hover a node to trace its links, click to open it.
      </p>
    </div>
  );
}
