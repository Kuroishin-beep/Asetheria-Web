import { expect, test } from "@playwright/test";
import { RELATION_LIMITS, RELATION_TYPE_KEYS, RELATION_TYPES, SYMMETRIC_TYPES, TREE, WEB, canonical, checkRelation, describeFrom, familyComponent, layoutFamily, layoutWeb, reaches, type Edge, type RelationContext, type RelationType } from "../src/lib/relations-core";

/**
 * Phase 17 (pure part): the kinds of relation, what may be added, loops, and the layout of a family tree and
 * a web. No database and no browser.
 */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A context over an invented set of pages: the id is also the name. */
function ctx(kinds: Record<string, string>, existing: Edge[] = [], type?: RelationType, perPage: Record<string, number> = {}): RelationContext {
  return {
    kinds: new Map(Object.entries(kinds)),
    sameType: type ? existing.filter((e) => e.type === type) : existing,
    countOnPage: (id) => perPage[id] ?? existing.filter((e) => e.from === id || e.to === id).length,
    names: (id) => id,
  };
}
const e = (from: string, to: string, type: RelationType, note = ""): Edge => ({ from, to, type, note });
const refusals = (edge: Edge, kinds: Record<string, string>, existing: Edge[] = [], perPage: Record<string, number> = {}) => checkRelation(edge, ctx(kinds, existing, edge.type, perPage));
const NPCS = { a: "npc", b: "npc", c: "npc", d: "npc", e: "npc", f: "npc" };

test.describe("the kinds of relation", () => {
  test("[TC-RELC-001] there are seven; spouse, sibling, ally and rival are the same from both ends, the rest have a direction and a reverse reading", () => {
    expect(RELATION_TYPE_KEYS.sort()).toEqual(["ally", "member", "parent", "rival", "sibling", "spouse", "vassal"]);
    expect(SYMMETRIC_TYPES.sort()).toEqual(["ally", "rival", "sibling", "spouse"]);
    for (const t of RELATION_TYPE_KEYS) {
      const d = RELATION_TYPES[t];
      expect(d.label.length).toBeGreaterThan(3);
      if (!d.symmetric) expect(d.reverse, t).toBeTruthy();
    }
    expect(RELATION_TYPE_KEYS.filter((t) => RELATION_TYPES[t].group === "family").sort()).toEqual(["parent", "sibling", "spouse"]);
  });

  test("[TC-RELC-002] a symmetric relation is stored with its ends in a fixed order whichever way it was written; a directed one is left alone", () => {
    expect(canonical(e("b", "a", "ally"))).toMatchObject({ from: "a", to: "b" });
    expect(canonical(e("a", "b", "ally"))).toMatchObject({ from: "a", to: "b" });
    expect(canonical(e("z", "a", "spouse"))).toMatchObject({ from: "a", to: "z" });
    expect(canonical(e("b", "a", "parent"))).toMatchObject({ from: "b", to: "a" });
    expect(canonical(e("b", "a", "vassal"))).toMatchObject({ from: "b", to: "a" });
  });

  test("[TC-RELC-003] a relation reads correctly from either end", () => {
    expect(describeFrom(e("p", "c", "parent"), "p", "Cael")).toBe("Parent of Cael");
    expect(describeFrom(e("p", "c", "parent"), "c", "Pria")).toBe("Child of Pria");
    expect(describeFrom(e("a", "b", "spouse"), "b", "Ann")).toBe("Spouse of Ann");
    expect(describeFrom(e("a", "b", "member"), "b", "Ann")).toBe("Has member Ann");
    expect(describeFrom(e("a", "b", "vassal"), "b", "Ann")).toBe("Overlord of Ann");
  });
});

test.describe("what may be added", () => {
  test("[TC-RELC-004] a good relation of each kind passes", () => {
    expect(refusals(e("a", "b", "parent"), NPCS)).toEqual([]);
    expect(refusals(e("a", "b", "spouse"), NPCS)).toEqual([]);
    expect(refusals(e("a", "b", "sibling"), NPCS)).toEqual([]);
    expect(refusals(e("a", "b", "ally"), { a: "empire", b: "organization" })).toEqual([]);
    expect(refusals(e("a", "b", "rival"), { a: "faction", b: "location" })).toEqual([]);
    expect(refusals(e("a", "b", "vassal"), { a: "location", b: "empire" })).toEqual([]);
    expect(refusals(e("a", "b", "member"), { a: "npc", b: "organization" })).toEqual([]);
  });

  test("[TC-RELC-005] a page cannot be related to itself", () => {
    expect(refusals(e("a", "a", "ally"), NPCS)).toEqual(["A page cannot be related to itself."]);
  });

  test("[TC-RELC-006] a page that cannot be found, and pages of the wrong kind, are refused naming the page", () => {
    expect(refusals(e("a", "ghost", "parent"), NPCS)).toEqual(["One of the pages could not be found."]);
    expect(refusals(e("a", "b", "parent"), { a: "location", b: "npc" })[0]).toMatch(/^a is a location, which cannot have a parent relation/);
    expect(refusals(e("a", "b", "spouse"), { a: "npc", b: "organization" })[0]).toMatch(/b is a organization/);
    expect(refusals(e("a", "b", "ally"), { a: "ore", b: "npc" })[0]).toMatch(/a is a ore/);
  });

  test("[TC-RELC-007] a membership must point at a group, not at a person or a place", () => {
    expect(refusals(e("a", "b", "member"), { a: "npc", b: "npc" })).toEqual([expect.stringMatching(/membership must point at one of/)]);
    expect(refusals(e("a", "b", "member"), { a: "npc", b: "location" })).toEqual([expect.stringMatching(/membership must point at one of/)]);
    expect(refusals(e("a", "b", "member"), { a: "organization", b: "empire" })).toEqual([]);
  });

  test("[TC-RELC-008] the note limit holds at the boundary: 300 characters pass, 301 do not; whitespace is not counted", () => {
    expect(refusals(e("a", "b", "ally", "n".repeat(RELATION_LIMITS.noteLength)), NPCS)).toEqual([]);
    expect(refusals(e("a", "b", "ally", `  ${"n".repeat(300)}  `), NPCS)).toEqual([]);
    expect(refusals(e("a", "b", "ally", "n".repeat(301)), NPCS)).toEqual([expect.stringMatching(/301 characters; the limit is 300/)]);
  });

  test("[TC-RELC-009] a repeat is refused, and for a symmetric relation the other way round is a repeat too; the other way round of a directed one is not a repeat", () => {
    expect(refusals(e("a", "b", "ally"), NPCS, [e("a", "b", "ally")])).toEqual(["That relation already exists."]);
    expect(refusals(e("b", "a", "ally"), NPCS, [e("a", "b", "ally")])).toEqual(["That relation already exists."]);
    expect(refusals(e("b", "a", "spouse"), NPCS, [e("a", "b", "spouse")])).toEqual(["That relation already exists."]);
    expect(refusals(e("a", "b", "parent"), NPCS, [e("a", "b", "parent")])).toEqual(["That relation already exists."]);
    expect(refusals(e("a", "c", "ally"), NPCS, [e("a", "b", "ally")])).toEqual([]);
    expect(refusals(e("a", "b", "rival"), NPCS, [e("a", "b", "ally")].filter((x) => x.type === "rival"))).toEqual([]); // a different type is not a repeat
  });
});

test.describe("loops", () => {
  test("[TC-RELC-010] nobody can be their own parent, directly, through a child, or through a long line of descent", () => {
    expect(refusals(e("b", "a", "parent"), NPCS, [e("a", "b", "parent")])[0]).toMatch(/already a descendant of/);
    expect(refusals(e("c", "a", "parent"), NPCS, [e("a", "b", "parent"), e("b", "c", "parent")])[0]).toMatch(/c is already a descendant of a/);
    const chain = Array.from({ length: 60 }, (_, i) => e(`n${i}`, `n${i + 1}`, "parent"));
    const kinds = Object.fromEntries(Array.from({ length: 61 }, (_, i) => [`n${i}`, "npc"]));
    expect(refusals(e("n60", "n0", "parent"), kinds, chain, {})[0]).toMatch(/descendant/);
    expect(refusals(e("n0", "n60", "parent"), kinds, chain.slice(0, 3), {})).toEqual([]);
  });

  test("[TC-RELC-011] two people can share a child and a descendant two ways (a diamond is not a loop)", () => {
    const existing = [e("g1", "p1", "parent"), e("g1", "p2", "parent"), e("p1", "c", "parent")];
    expect(refusals(e("p2", "c", "parent"), { g1: "npc", p1: "npc", p2: "npc", c: "npc" }, existing)).toEqual([]);
  });

  test("[TC-RELC-012] overlords and group memberships cannot loop either, but allies and rivals can be mutual", () => {
    expect(refusals(e("b", "a", "vassal"), { a: "empire", b: "empire" }, [e("a", "b", "vassal")])[0]).toMatch(/each ranked above the other/);
    expect(refusals(e("b", "a", "member"), { a: "organization", b: "organization" }, [e("a", "b", "member")])[0]).toMatch(/each ranked above the other/);
    expect(refusals(e("c", "a", "vassal"), { a: "empire", b: "empire", c: "empire" }, [e("a", "b", "vassal"), e("b", "c", "vassal")])[0]).toMatch(/ranked/);
    expect(refusals(e("b", "a", "rival"), { a: "faction", b: "faction" }, [])).toEqual([]);
  });

  test("[TC-RELC-013] random relations accepted by the rules never make a loop: 3,000 attempts over 25 pages", () => {
    const r = rng(2026);
    const ids = Array.from({ length: 25 }, (_, i) => `p${String(i).padStart(2, "0")}`);
    const kinds = Object.fromEntries(ids.map((id) => [id, "npc"]));
    const accepted: Edge[] = [];
    for (let i = 0; i < 3000; i++) {
      const from = ids[Math.floor(r() * ids.length)];
      const to = ids[Math.floor(r() * ids.length)];
      const edge = e(from, to, "parent");
      if (refusals(edge, kinds, accepted).length === 0) accepted.push(edge);
    }
    expect(accepted.length).toBeGreaterThan(20);
    // An independent check: no page can reach itself by following parent edges.
    for (const id of ids) {
      const next = accepted.filter((x) => x.from === id).map((x) => x.to);
      for (const n of next) expect(reaches(accepted, n, id), `${id} is its own ancestor`).toBe(false);
    }
  });
});

test.describe("limits", () => {
  test("[TC-RELC-014] a child can have up to four parents; a fifth is refused", () => {
    const existing = ["p1", "p2", "p3"].map((p) => e(p, "kid", "parent"));
    const kinds = { p1: "npc", p2: "npc", p3: "npc", p4: "npc", p5: "npc", kid: "npc" };
    expect(refusals(e("p4", "kid", "parent"), kinds, existing)).toEqual([]);
    expect(refusals(e("p5", "kid", "parent"), kinds, [...existing, e("p4", "kid", "parent")])).toEqual([expect.stringMatching(/already has 4 parents/)]);
  });

  test("[TC-RELC-015] a page can have up to 200 relations; the 201st is refused on whichever end it lands", () => {
    expect(refusals(e("a", "b", "ally"), NPCS, [], { a: 199 })).toEqual([]);
    expect(refusals(e("a", "b", "ally"), NPCS, [], { a: 200 })).toEqual([expect.stringMatching(/a already has 200 relations/)]);
    expect(refusals(e("a", "b", "ally"), NPCS, [], { b: 200 })).toEqual([expect.stringMatching(/b already has 200 relations/)]);
  });

  test("[TC-RELC-016] several problems are all reported together", () => {
    const problems = refusals(e("a", "b", "member", "n".repeat(400)), { a: "ore", b: "npc" });
    expect(problems.length).toBeGreaterThanOrEqual(3);
  });
});

test.describe("the family tree layout", () => {
  const people = [
    { id: "g1", name: "Grandmother" },
    { id: "g2", name: "Grandfather" },
    { id: "p1", name: "Parent One" },
    { id: "p2", name: "Parent Two" },
    { id: "c1", name: "Child One" },
    { id: "c2", name: "Child Two" },
  ];
  const edges: Edge[] = [e("g1", "g2", "spouse"), e("g1", "p1", "parent"), e("g2", "p1", "parent"), e("p1", "p2", "spouse"), e("p1", "c1", "parent"), e("p2", "c1", "parent"), e("p1", "c2", "parent"), e("p2", "c2", "parent")];
  const at = (layout: ReturnType<typeof layoutFamily>, id: string) => layout.nodes.find((n) => n.id === id)!;

  test("[TC-RELC-017] generations run down the page: grandparents, then parents (the spouse who married in is level with their partner), then children", () => {
    const l = layoutFamily(people, edges);
    expect(at(l, "g1").generation).toBe(0);
    expect(at(l, "g2").generation).toBe(0);
    expect(at(l, "p1").generation).toBe(1);
    expect(at(l, "p2").generation).toBe(1);
    expect(at(l, "c1").generation).toBe(2);
    expect(at(l, "c2").generation).toBe(2);
    expect(at(l, "p1").y).toBeGreaterThan(at(l, "g1").y);
    expect(at(l, "c1").y).toBeGreaterThan(at(l, "p1").y);
    expect(at(l, "p1").y).toBe(at(l, "p2").y);
  });

  test("[TC-RELC-018] spouses sit side by side, siblings on one row, and no two people share a spot", () => {
    const l = layoutFamily(people, edges);
    expect(Math.abs(at(l, "g1").x - at(l, "g2").x)).toBe(TREE.columnWidth);
    expect(Math.abs(at(l, "p1").x - at(l, "p2").x)).toBe(TREE.columnWidth);
    expect(at(l, "c1").y).toBe(at(l, "c2").y);
    expect(new Set(l.nodes.map((n) => `${n.x},${n.y}`)).size).toBe(l.nodes.length);
  });

  test("[TC-RELC-019] the picture is big enough for everyone and is the same whatever order the people and ties are given in", () => {
    const l = layoutFamily(people, edges);
    for (const n of l.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x + TREE.columnWidth).toBeLessThanOrEqual(l.width + 1);
      expect(n.y + TREE.rowHeight).toBeLessThanOrEqual(l.height + 1);
    }
    const shuffled = layoutFamily([...people].reverse(), [...edges].reverse());
    expect(shuffled).toEqual(l);
    const r = rng(11);
    for (let i = 0; i < 20; i++) {
      const a = [...people].sort(() => r() - 0.5);
      const b = [...edges].sort(() => r() - 0.5);
      expect(layoutFamily(a, b)).toEqual(l);
    }
  });

  test("[TC-RELC-020] a long line of descent, one person alone, nobody at all, and ties to people not in the list are all handled", () => {
    const chain = Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, name: `N${i}` }));
    const l = layoutFamily(chain, chain.slice(1).map((n, i) => e(`n${i}`, n.id, "parent")));
    expect(l.nodes.map((n) => n.generation).sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, i) => i));
    expect(layoutFamily([{ id: "solo", name: "Solo" }], []).nodes).toHaveLength(1);
    expect(layoutFamily([], [])).toMatchObject({ nodes: [] });
    expect(layoutFamily([{ id: "a", name: "A" }], [e("a", "ghost", "parent")]).nodes).toHaveLength(1);
  });

  test("[TC-RELC-021] a loop of ties given anyway (bad data) still gives a finite layout", () => {
    const bad = layoutFamily([{ id: "a", name: "A" }, { id: "b", name: "B" }], [e("a", "b", "parent"), e("b", "a", "parent")]);
    expect(bad.nodes).toHaveLength(2);
    expect(Number.isFinite(bad.height)).toBe(true);
  });

  test("[TC-RELC-022] the family of a page is everyone joined to it by a family tie, in either direction, and no one reached only through the wider world", () => {
    const all: Edge[] = [e("a", "b", "parent"), e("c", "b", "spouse"), e("c", "d", "sibling"), e("d", "x", "ally"), e("x", "y", "parent"), e("lone1", "lone2", "parent")];
    expect([...familyComponent(all, "a")].sort()).toEqual(["a", "b", "c", "d"]);
    expect([...familyComponent(all, "y")].sort()).toEqual(["x", "y"]);
    expect([...familyComponent(all, "nobody")]).toEqual(["nobody"]);
  });
});

test.describe("the web layout", () => {
  const nodes = [{ id: "3", name: "Zed", kind: "empire" }, { id: "1", name: "Ann", kind: "faction" }, { id: "2", name: "Bea", kind: "empire" }, { id: "4", name: "Cat", kind: "faction" }];

  test("[TC-RELC-023] pages sit evenly on a circle, ordered by kind then name, and the same every time", () => {
    const l = layoutWeb(nodes);
    expect(l.map((n) => n.name)).toEqual(["Bea", "Zed", "Ann", "Cat"]);
    const c = WEB.size / 2;
    for (const n of l) expect(Math.hypot(n.x - c, n.y - c)).toBeCloseTo(WEB.radius, 1);
    expect(layoutWeb([...nodes].reverse())).toEqual(l);
    expect(new Set(l.map((n) => `${n.x},${n.y}`)).size).toBe(4);
  });

  test("[TC-RELC-024] one page sits in the middle, and no pages is an empty picture", () => {
    expect(layoutWeb([nodes[0]])).toEqual([{ ...nodes[0], x: WEB.size / 2, y: WEB.size / 2 }]);
    expect(layoutWeb([])).toEqual([]);
  });
});
