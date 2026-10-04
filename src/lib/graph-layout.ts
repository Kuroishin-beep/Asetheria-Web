import type { EntryKind } from "@/db/schema";

export type GraphNode = { id: string; slug: string; name: string; kind: EntryKind };
export type GraphEdge = { source: string; target: string; relation: string };
export type GraphPoint = { x: number; y: number };

type Node = GraphNode;
type Edge = GraphEdge;
type Point = GraphPoint & { vx: number; vy: number };

export const GRAPH_WIDTH = 900;
export const GRAPH_HEIGHT = 640;
const WIDTH = GRAPH_WIDTH;
const HEIGHT = GRAPH_HEIGHT;

/**
 * The layout runs on the server only (the graph page computes it and passes
 * the positions down). A force simulation is chaotic: Node and the browser use
 * different builds of V8's math functions, and a last-bit difference grows over
 * 90 iterations into a completely different picture. Computing it twice, once
 * per environment, made server and client markup disagree and React reported a
 * hydration mismatch. One computation, shipped as data, cannot disagree with
 * itself.
 */
/**
 * A minimal force-directed layout — no charting library, so this stays a
 * plain dependency-free client component. Runs a fixed number of iterations
 * synchronously on mount (not a live animation loop), which is enough to
 * settle a graph this size into readable clusters without a perceptible
 * layout stall.
 */
export function layoutGraph(nodes: Node[], edges: Edge[]): Record<string, GraphPoint> {
  return Object.fromEntries(
    [...computeLayout(nodes, edges)].map(([id, p]) => [id, { x: p.x, y: p.y }]),
  );
}

function computeLayout(nodes: Node[], edges: Edge[]): Map<string, Point> {
  const pos = new Map<string, Point>();
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;

  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  const connectedNodes = nodes.filter((n) => degree.has(n.id));
  const isolatedNodes = nodes.filter((n) => !degree.has(n.id));

  // Isolated nodes get a fixed, evenly-spaced outer ring rather than
  // participating in the simulation below — with no edge pulling them
  // anywhere, repulsion alone can (and did) push several of them into the
  // same clamped corner, stacking unclickable nodes on top of each other.
  // A ring guarantees distinct positions and mirrors how Obsidian itself
  // renders unconnected notes at the graph's edge.
  const ringRadius = Math.min(WIDTH, HEIGHT) * 0.48;
  isolatedNodes.forEach((node, i) => {
    const angle = (i / Math.max(isolatedNodes.length, 1)) * Math.PI * 2;
    pos.set(node.id, {
      x: cx + Math.cos(angle) * ringRadius,
      y: cy + Math.sin(angle) * ringRadius,
      vx: 0,
      vy: 0,
    });
  });

  const n = connectedNodes.length || 1;
  connectedNodes.forEach((node, i) => {
    const angle = (i / n) * Math.PI * 2;
    const r = Math.min(WIDTH, HEIGHT) * 0.28;
    pos.set(node.id, {
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
      vx: 0,
      vy: 0,
    });
  });

  const iterations = connectedNodes.length > 400 ? 40 : 90;
  const repulsion = 2200;
  const springLength = 90;
  const springStrength = 0.02;
  const damping = 0.85;
  const centerPull = 0.01;
  const bound = ringRadius - 30;

  for (let iter = 0; iter < iterations; iter++) {
    // Repulsion between every connected-node pair — the O(n^2) term, capped
    // by `iterations` scaling down as the node count grows. Isolated nodes
    // are fixed and excluded from this entirely.
    for (let i = 0; i < connectedNodes.length; i++) {
      const a = pos.get(connectedNodes[i].id)!;
      for (let j = i + 1; j < connectedNodes.length; j++) {
        const b = pos.get(connectedNodes[j].id)!;
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

    for (const node of connectedNodes) {
      const p = pos.get(node.id)!;
      p.vx += (cx - p.x) * centerPull;
      p.vy += (cy - p.y) * centerPull;
      p.vx *= damping;
      p.vy *= damping;
      p.x += p.vx;
      p.y += p.vy;
      // Keep the connected cluster inside the isolated-node ring, rather
      // than clamping to the viewport edge — that's what let two nodes
      // land on the exact same coordinate in the first place.
      const dx = p.x - cx;
      const dy = p.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > bound) {
        p.x = cx + (dx / dist) * bound;
        p.y = cy + (dy / dist) * bound;
      }
    }
  }

  // Two nodes with near-identical neighbor sets (e.g. sibling cities in the
  // same empire) can converge to almost the same point — repulsion between
  // just that pair is too weak, at typical simulation distances, to be the
  // thing that separates them. One extra pass nudges any pair still closer
  // than a usable click target apart, so the graph stays fully clickable
  // even in a dense, highly-symmetric cluster.
  const MIN_SEPARATION = 14;
  for (let i = 0; i < connectedNodes.length; i++) {
    const a = pos.get(connectedNodes[i].id)!;
    for (let j = i + 1; j < connectedNodes.length; j++) {
      const b = pos.get(connectedNodes[j].id)!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < MIN_SEPARATION) {
        // Coincident points have no direction to push along — fall back to
        // a deterministic one derived from the pair's index so they don't
        // stay stacked.
        const angle = dist > 0.001 ? Math.atan2(dy, dx) : (i * 2.399963 + j) % (Math.PI * 2);
        const push = (MIN_SEPARATION - dist) / 2 + 0.5;
        a.x -= Math.cos(angle) * push;
        a.y -= Math.sin(angle) * push;
        b.x += Math.cos(angle) * push;
        b.y += Math.sin(angle) * push;
      }
    }
  }

  // Round to a tenth of a pixel. The layout runs on the server and again
  // during hydration; full-precision floats can differ in the last digit
  // between the two, which React reports as a hydration mismatch and which
  // leaves nodes drawn where the server put them but clickable where the
  // client did.
  for (const p of pos.values()) {
    p.x = Math.round(p.x * 10) / 10;
    p.y = Math.round(p.y * 10) / 10;
  }
  return pos;
}
