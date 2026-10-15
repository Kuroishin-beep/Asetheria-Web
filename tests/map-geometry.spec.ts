import { expect, test } from "@playwright/test";
import { POLYGON, centroid, pointInPolygon, polygonArea, segmentsIntersect, selfIntersects, validatePolygon, wouldLoopMaps, type Point } from "../src/lib/map-geometry";

/**
 * Phase 18 (pure part): is a drawn outline a real region, which side of it a point is on, and keeping city
 * maps from looping. No database and no browser.
 */

const SQUARE: Point[] = [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]];
const L_SHAPE: Point[] = [[0.1, 0.1], [0.5, 0.1], [0.5, 0.5], [0.9, 0.5], [0.9, 0.9], [0.1, 0.9]];
const BOWTIE: Point[] = [[0.1, 0.1], [0.9, 0.9], [0.9, 0.1], [0.1, 0.9]];

/** A regular polygon with n corners round the middle of the map. */
function regular(n: number, r = 0.4): Point[] {
  return Array.from({ length: n }, (_, i) => [0.5 + r * Math.cos((2 * Math.PI * i) / n), 0.5 + r * Math.sin((2 * Math.PI * i) / n)] as Point);
}

test.describe("a good outline", () => {
  test("[TC-MGEO-001] a triangle, a square, a concave L and a many-sided shape are all accepted", () => {
    expect(validatePolygon([[0.1, 0.1], [0.9, 0.1], [0.5, 0.9]])).toEqual([]);
    expect(validatePolygon(SQUARE)).toEqual([]);
    expect(validatePolygon(L_SHAPE)).toEqual([]);
    expect(validatePolygon(regular(37))).toEqual([]);
  });

  test("[TC-MGEO-002] the outline may run the other way round (clockwise or anticlockwise) and start at any corner", () => {
    expect(validatePolygon([...SQUARE].reverse())).toEqual([]);
    expect(validatePolygon([...SQUARE.slice(2), ...SQUARE.slice(0, 2)])).toEqual([]);
  });

  test("[TC-MGEO-003] the corners of the map itself are allowed: the whole map can be a region", () => {
    expect(validatePolygon([[0, 0], [1, 0], [1, 1], [0, 1]])).toEqual([]);
  });
});

test.describe("what is refused, in plain words", () => {
  test("[TC-MGEO-004] not a list, or the wrong number of points: 2 is too few, 3 and 200 are fine, 201 is too many", () => {
    for (const bad of [null, undefined, "x", 5, {}, [[0, 0]]]) expect(validatePolygon(bad), JSON.stringify(bad)).toHaveLength(1);
    expect(validatePolygon([[0.1, 0.1], [0.9, 0.9]])).toEqual(["A region needs at least 3 points."]);
    expect(validatePolygon(regular(POLYGON.maxPoints))).toEqual([]);
    expect(validatePolygon(regular(POLYGON.maxPoints + 1))).toEqual(["A region can have at most 200 points."]);
  });

  test("[TC-MGEO-005] a point that is not a pair of numbers, is NaN, is infinite, or is outside the map, each naming the point", () => {
    expect(validatePolygon([[0.1, 0.1], "x", [0.5, 0.9]])).toEqual(["Point 2 is not a pair of numbers."]);
    expect(validatePolygon([[0.1, 0.1], [0.9, 0.1, 0.5], [0.5, 0.9]])).toEqual(["Point 2 is not a pair of numbers."]);
    expect(validatePolygon([[0.1, 0.1], [Number.NaN, 0.1], [0.5, 0.9]])).toEqual(["Point 2 is not a pair of numbers."]);
    expect(validatePolygon([[0.1, 0.1], [Number.POSITIVE_INFINITY, 0.1], [0.5, 0.9]])).toEqual(["Point 2 is not a pair of numbers."]);
    expect(validatePolygon([[0.1, 0.1], ["0.5", 0.1], [0.5, 0.9]])).toEqual(["Point 2 is not a pair of numbers."]);
    expect(validatePolygon([[0.1, 0.1], [1.0000001, 0.1], [0.5, 0.9]])).toEqual(["Point 2 is outside the map."]);
    expect(validatePolygon([[0.1, 0.1], [0.9, -0.0000001], [0.5, 0.9]])).toEqual(["Point 2 is outside the map."]);
  });

  test("[TC-MGEO-006] every bad point is reported together", () => {
    expect(validatePolygon([[2, 2], [-1, 0.1], [0.5, 5], "x"]).length).toBe(4);
  });

  test("[TC-MGEO-007] two neighbouring points on the same spot, including the last and the first", () => {
    expect(validatePolygon([[0.1, 0.1], [0.1, 0.1], [0.9, 0.5], [0.5, 0.9]])).toEqual(["Points 1 and 2 are the same spot."]);
    expect(validatePolygon([[0.1, 0.1], [0.9, 0.5], [0.5, 0.9], [0.1, 0.1]])).toEqual(["Points 4 and 1 are the same spot."]);
  });

  test("[TC-MGEO-008] points in a line have no area", () => {
    expect(validatePolygon([[0.1, 0.1], [0.5, 0.5], [0.9, 0.9]])).toEqual(["The region has no area: its points lie in a line."]);
    expect(validatePolygon([[0.1, 0.5], [0.4, 0.5], [0.9, 0.5]])).toHaveLength(1);
  });

  test("[TC-MGEO-009] an outline that crosses itself (a bow tie, a figure of eight, a spike through the body) is refused", () => {
    const message = "The outline crosses itself. Draw it round the place without the edges crossing.";
    expect(validatePolygon(BOWTIE)).toEqual([message]);
    expect(validatePolygon([[0.1, 0.1], [0.9, 0.1], [0.9, 0.5], [0.1, 0.5], [0.1, 0.9], [0.9, 0.9], [0.5, 0.0]])).toEqual([message]);
    expect(validatePolygon([[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9], [0.5, 0.0], [0.5, 1.0]])).toEqual([message]);
  });

  test("[TC-MGEO-010] an outline whose corner touches another edge is refused too (a shared edge point counts as touching)", () => {
    expect(validatePolygon([[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.5, 0.1], [0.1, 0.9]])).toHaveLength(1);
  });
});

test.describe("segments and area", () => {
  test("[TC-MGEO-011] segments that cross, touch at an end, overlap, are parallel or apart", () => {
    const p = (x: number, y: number): Point => [x, y];
    expect(segmentsIntersect(p(0, 0), p(1, 1), p(0, 1), p(1, 0))).toBe(true);
    expect(segmentsIntersect(p(0, 0), p(1, 0), p(1, 0), p(1, 1))).toBe(true);
    expect(segmentsIntersect(p(0, 0), p(2, 0), p(1, 0), p(3, 0))).toBe(true);
    expect(segmentsIntersect(p(0, 0), p(1, 0), p(0, 1), p(1, 1))).toBe(false);
    expect(segmentsIntersect(p(0, 0), p(1, 0), p(2, 0), p(3, 0))).toBe(false);
    expect(segmentsIntersect(p(0, 0), p(1, 1), p(2, 2), p(3, 3))).toBe(false);
    expect(segmentsIntersect(p(0, 0), p(0.5, 0.5), p(0.5, 0.5), p(1, 0))).toBe(true);
  });

  test("[TC-MGEO-012] the area of a square, a triangle and an L, in either direction", () => {
    expect(polygonArea(SQUARE)).toBeCloseTo(0.36, 10);
    expect(polygonArea([...SQUARE].reverse())).toBeCloseTo(0.36, 10);
    expect(polygonArea([[0, 0], [1, 0], [0, 1]])).toBeCloseTo(0.5, 10);
    expect(polygonArea(L_SHAPE)).toBeCloseTo(0.4 * 0.4 + 0.8 * 0.4, 10);
  });

  test("[TC-MGEO-013] a regular outline never crosses itself, whatever the number of corners", () => {
    for (const n of [3, 4, 5, 8, 13, 50, 123, 200]) expect(selfIntersects(regular(n)), `n=${n}`).toBe(false);
    expect(selfIntersects(BOWTIE)).toBe(true);
  });
});

test.describe("which side of the outline", () => {
  test("[TC-MGEO-014] a point inside, outside, on an edge and on a corner of a square", () => {
    expect(pointInPolygon([0.5, 0.5], SQUARE)).toBe(true);
    expect(pointInPolygon([0.1, 0.5], SQUARE)).toBe(false);
    expect(pointInPolygon([0.9, 0.9], SQUARE)).toBe(false);
    expect(pointInPolygon([0.5, 0.2], SQUARE)).toBe(true);
    expect(pointInPolygon([0.2, 0.2], SQUARE)).toBe(true);
    expect(pointInPolygon([0.8, 0.8], SQUARE)).toBe(true);
  });

  test("[TC-MGEO-015] a concave shape: the notch is outside, the arms are inside", () => {
    expect(pointInPolygon([0.3, 0.3], L_SHAPE)).toBe(true);
    expect(pointInPolygon([0.7, 0.7], L_SHAPE)).toBe(true);
    expect(pointInPolygon([0.7, 0.3], L_SHAPE)).toBe(false); // the notch
    expect(pointInPolygon([0.5, 0.3], L_SHAPE)).toBe(true); // on the inner edge
  });

  test("[TC-MGEO-016] every point in a grid agrees with the area: the share inside matches the polygon's area to within a grid step", () => {
    for (const poly of [SQUARE, L_SHAPE, regular(7), regular(19, 0.3)]) {
      let inside = 0;
      const n = 200;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (pointInPolygon([(i + 0.5) / n, (j + 0.5) / n], poly)) inside++;
      expect(Math.abs(inside / (n * n) - polygonArea(poly))).toBeLessThan(0.01);
    }
  });

  test("[TC-MGEO-017] the middle of a square, and of an L, lies inside the square and on the L's body", () => {
    const c = centroid(SQUARE);
    expect(c[0]).toBeCloseTo(0.5, 10);
    expect(c[1]).toBeCloseTo(0.5, 10);
    expect(pointInPolygon(centroid(L_SHAPE), L_SHAPE)).toBe(true);
  });
});

test.describe("city maps that open other maps", () => {
  test("[TC-MGEO-018] a map cannot open itself, a map it was opened from, or any map further back along the chain", () => {
    const chain = [{ from: "world", to: "region" }, { from: "region", to: "city" }];
    expect(wouldLoopMaps(chain, "city", "city")).toBe(true);
    expect(wouldLoopMaps(chain, "city", "region")).toBe(true);
    expect(wouldLoopMaps(chain, "city", "world")).toBe(true);
    expect(wouldLoopMaps(chain, "region", "world")).toBe(true);
  });

  test("[TC-MGEO-019] a new map further down, a second map from the same one, and an unrelated map are all fine", () => {
    const chain = [{ from: "world", to: "region" }, { from: "region", to: "city" }];
    expect(wouldLoopMaps(chain, "city", "district")).toBe(false);
    expect(wouldLoopMaps(chain, "world", "other")).toBe(false);
    expect(wouldLoopMaps(chain, "world", "city")).toBe(false); // a shortcut down is not a loop
    expect(wouldLoopMaps([], "a", "b")).toBe(false);
  });

  test("[TC-MGEO-020] a long chain is walked all the way, and a diamond (two roads to one map) is allowed", () => {
    const long = Array.from({ length: 200 }, (_, i) => ({ from: `m${i}`, to: `m${i + 1}` }));
    expect(wouldLoopMaps(long, "m200", "m0")).toBe(true);
    expect(wouldLoopMaps(long, "m200", "elsewhere")).toBe(false);
    expect(wouldLoopMaps([{ from: "a", to: "b" }, { from: "a", to: "c" }, { from: "b", to: "d" }], "c", "d")).toBe(false);
  });
});
