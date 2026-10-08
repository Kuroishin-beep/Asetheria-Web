import type { EntryKind } from "@/db/schema";

export type GraphNode = {
  id: string;
  slug: string;
  name: string;
  kind: EntryKind;
  tags: string[];
  region: string;
  parentId: string | null;
};
export type GraphEdge = { source: string; target: string; relation: string };
export type GraphPoint = { x: number; y: number };

type Node = GraphNode;
type Edge = GraphEdge;
type Point = GraphPoint & { vx: number; vy: number };

/** The pseudo-relation of a child-to-parent edge added for clustering; never a stored link. */
export const PARENT_RELATION = "parent";
/** Beyond this distance (px) repulsion between two nodes is ignored; at 2200/d^2 it is small (under 0.5 px of push per step). */
const REPULSION_RADIUS = 70;
/** Multiplier that makes a (column, row) grid cell a single numeric key. */
const GRID_STRIDE = 4096;

/** Children gather on a ring around their parent; this is the room each one is given along it. */
const ORBIT_SPACING = 26;
const ORBIT_MIN_RADIUS = 18;

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
  const pointIndex = new Map<Point, number>();
  connectedNodes.forEach((node, i) => pointIndex.set(pos.get(node.id)!, i));
  const repulsion = 2200;
  const springLength = 90;
  const springStrength = 0.02;
  const damping = 0.85;
  const centerPull = 0.01;
  const bound = ringRadius - 30;

  for (let iter = 0; iter < iterations; iter++) {
    // Repulsion between nearby connected nodes. The force falls off as 1/d^2, so beyond REPULSION_RADIUS
    // it is negligible; bucketing nodes into a grid of that cell size means each node only meets the
    // handful in the 3x3 cells around it, which makes this step roughly linear in the node count instead
    // of quadratic. Pairs are visited in a fixed order, so the result is deterministic.
    // Isolated nodes are fixed and excluded from this entirely.
    const grid = new Map<number, Point[]>();
    const cellOf = (p: Point) => Math.floor(p.x / REPULSION_RADIUS) * GRID_STRIDE + Math.floor(p.y / REPULSION_RADIUS);
    const points = connectedNodes.map((n) => pos.get(n.id)!);
    for (const p of points) {
      const key = cellOf(p);
      (grid.get(key) ?? grid.set(key, []).get(key)!).push(p);
    }
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const cx = Math.floor(a.x / REPULSION_RADIUS);
      const cy = Math.floor(a.y / REPULSION_RADIUS);
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          const cell = grid.get(gx * GRID_STRIDE + gy);
          if (!cell) continue;
          for (const b of cell) {
            // Each pair once: only the one whose index is lower does the work.
            if (b === a || pointIndex.get(b)! < i) continue;
            let dx = a.x - b.x;
            let dy = a.y - b.y;
            const distSq = dx * dx + dy * dy || 0.01;
            if (distSq > REPULSION_RADIUS * REPULSION_RADIUS) continue;
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

  // Clustering: when parent edges are present, each parent's children move onto a ring around it.
  // Done after the forces settle (springs alone cannot beat the repulsion between hundreds of nodes), and
  // parents first, so a grandchild orbits a child that is already in place. Deterministic: children are
  // ordered by id, so the server and any rerun draw the same picture.
  placeChildrenAroundParents(pos, edges);

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


function placeChildrenAroundParents(pos: Map<string, Point>, edges: Edge[]) {
  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();
  for (const e of edges) {
    if (e.relation !== PARENT_RELATION) continue;
    if (!pos.has(e.source) || !pos.has(e.target)) continue;
    (children.get(e.source) ?? children.set(e.source, []).get(e.source)!).push(e.target);
    hasParent.add(e.target);
  }
  if (children.size === 0) return;

  // Breadth-first from the pages that are not anyone's child, so every parent is placed before its children.
  const queue = [...children.keys()].filter((id) => !hasParent.has(id)).sort();
  const seen = new Set(queue);
  for (let head = 0; head < queue.length; head++) {
    const parentId = queue[head];
    const parent = pos.get(parentId)!;
    const kids = [...(children.get(parentId) ?? [])].sort();
    const radius = Math.max(ORBIT_MIN_RADIUS, (kids.length * ORBIT_SPACING) / (2 * Math.PI));
    kids.forEach((kidId, i) => {
      const angle = (i / kids.length) * Math.PI * 2;
      const kid = pos.get(kidId)!;
      kid.x = Math.min(WIDTH - 8, Math.max(8, parent.x + Math.cos(angle) * radius));
      kid.y = Math.min(HEIGHT - 8, Math.max(8, parent.y + Math.sin(angle) * radius));
      if (children.has(kidId) && !seen.has(kidId)) {
        seen.add(kidId);
        queue.push(kidId);
      }
    });
  }
}
