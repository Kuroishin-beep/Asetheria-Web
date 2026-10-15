/**
 * Map regions: the geometry (pure, no database).
 *
 * A region is a polygon whose corners are fractions of the map image (0 to 1 across, 0 to 1 down), like pins,
 * so it holds at any size and zoom. This checks a polygon is a real outline the viewer can click inside, and
 * answers "which side of it is this point on". Also the rule that keeps city maps from looping.
 */

export type Point = [number, number];

export const POLYGON = { minPoints: 3, maxPoints: 200, minArea: 1e-6 } as const;

const EPS = 1e-12;

const isPoint = (p: unknown): p is Point => Array.isArray(p) && p.length === 2 && typeof p[0] === "number" && typeof p[1] === "number" && Number.isFinite(p[0]) && Number.isFinite(p[1]);

/** The area of a polygon (shoelace formula), as a positive number. */
export function polygonArea(poly: Point[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

function orientation(a: Point, b: Point, c: Point): number {
  const v = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
  return Math.abs(v) < EPS ? 0 : v > 0 ? 1 : 2;
}

function onSegment(a: Point, p: Point, b: Point): boolean {
  return p[0] <= Math.max(a[0], b[0]) + EPS && p[0] >= Math.min(a[0], b[0]) - EPS && p[1] <= Math.max(a[1], b[1]) + EPS && p[1] >= Math.min(a[1], b[1]) - EPS;
}

/** True when the segments ab and cd cross or touch (a shared end counts as touching). */
export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a, c, b)) return true;
  if (o2 === 0 && onSegment(a, d, b)) return true;
  if (o3 === 0 && onSegment(c, a, d)) return true;
  if (o4 === 0 && onSegment(c, b, d)) return true;
  return false;
}

/** True when any two edges that are not neighbours cross or touch: the outline would cut across itself. */
export function selfIntersects(poly: Point[]): boolean {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      // Neighbouring edges share a corner by design.
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsIntersect(a, b, poly[j], poly[(j + 1) % n])) return true;
    }
  }
  return false;
}

/** Every reason a polygon cannot be a region, in plain words; empty when it is fine. */
export function validatePolygon(points: unknown): string[] {
  if (!Array.isArray(points)) return ["A region needs a list of points."];
  if (points.length < POLYGON.minPoints) return [`A region needs at least ${POLYGON.minPoints} points.`];
  if (points.length > POLYGON.maxPoints) return [`A region can have at most ${POLYGON.maxPoints} points.`];
  const errors: string[] = [];
  const poly: Point[] = [];
  points.forEach((p, i) => {
    if (!isPoint(p)) errors.push(`Point ${i + 1} is not a pair of numbers.`);
    else if (p[0] < 0 || p[0] > 1 || p[1] < 0 || p[1] > 1) errors.push(`Point ${i + 1} is outside the map.`);
    else poly.push(p);
  });
  if (errors.length > 0) return errors;
  for (let i = 0; i < poly.length; i++) {
    const next = poly[(i + 1) % poly.length];
    if (Math.abs(poly[i][0] - next[0]) < EPS && Math.abs(poly[i][1] - next[1]) < EPS) return [`Points ${i + 1} and ${((i + 1) % poly.length) + 1} are the same spot.`];
  }
  // Crossing is checked first: the two halves of a bow tie cancel to zero area, but "it crosses itself" is the useful thing to say.
  if (selfIntersects(poly)) return ["The outline crosses itself. Draw it round the place without the edges crossing."];
  if (polygonArea(poly) < POLYGON.minArea) return ["The region has no area: its points lie in a line."];
  return [];
}

/** True when the point is inside the polygon or on its edge. */
export function pointInPolygon(p: Point, poly: Point[]): boolean {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    if (orientation(a, b, p) === 0 && onSegment(a, p, b)) return true;
  }
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The middle of a polygon's area, for placing a label. */
export function centroid(poly: Point[]): Point {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    const f = x1 * y2 - x2 * y1;
    a += f;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  if (Math.abs(a) < EPS) return poly[0];
  return [cx / (3 * a), cy / (3 * a)];
}

export type MapEdge = { from: string; to: string };

/** A pin that opens a city map must never lead back to where it started: true when this link would make a loop. */
export function wouldLoopMaps(edges: MapEdge[], from: string, to: string): boolean {
  if (from === to) return true;
  const next = new Map<string, string[]>();
  for (const e of edges) next.set(e.from, [...(next.get(e.from) ?? []), e.to]);
  const seen = new Set<string>([to]);
  const stack = [to];
  while (stack.length) {
    const cur = stack.pop() as string;
    if (cur === from) return true;
    for (const n of next.get(cur) ?? []) if (!seen.has(n)) {
      seen.add(n);
      stack.push(n);
    }
  }
  return false;
}

/** The colours a region can take: tones 1 to 5 of the design tokens. */
export const REGION_TONES = ["1", "2", "3", "4", "5"] as const;
export type RegionTone = (typeof REGION_TONES)[number];
