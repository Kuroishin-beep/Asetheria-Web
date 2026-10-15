/**
 * Relations between pages: the pure rules (no database).
 *
 * A relation is a typed edge between two pages: a family tie (parent, spouse, sibling) or a tie in the wider
 * world (ally, rival, vassal, member). Some are symmetric (spouse of, ally of) and are stored once with their
 * ends in a fixed order; some have a direction (parent of, vassal of) and may never loop back on themselves.
 * Who may see a relation is decided elsewhere: both its ends must be pages the viewer can read.
 */

export type RelationGroup = "family" | "web";
export type RelationType = "parent" | "spouse" | "sibling" | "ally" | "rival" | "vassal" | "member";

export type RelationTypeDef = {
  label: string;
  /** The same tie read from the other end, for a directed type. */
  reverse?: string;
  group: RelationGroup;
  symmetric: boolean;
  /** A directed type that may not loop: nobody is their own ancestor or their own overlord. */
  acyclic: boolean;
};

export const RELATION_TYPES: Record<RelationType, RelationTypeDef> = {
  parent: { label: "Parent of", reverse: "Child of", group: "family", symmetric: false, acyclic: true },
  spouse: { label: "Spouse of", group: "family", symmetric: true, acyclic: false },
  sibling: { label: "Sibling of", group: "family", symmetric: true, acyclic: false },
  ally: { label: "Ally of", group: "web", symmetric: true, acyclic: false },
  rival: { label: "Rival of", group: "web", symmetric: true, acyclic: false },
  vassal: { label: "Vassal of", reverse: "Overlord of", group: "web", symmetric: false, acyclic: true },
  member: { label: "Member of", reverse: "Has member", group: "web", symmetric: false, acyclic: true },
};
export const RELATION_TYPE_KEYS = Object.keys(RELATION_TYPES) as RelationType[];
export const SYMMETRIC_TYPES = RELATION_TYPE_KEYS.filter((t) => RELATION_TYPES[t].symmetric);

/** Pages a family tie may join. */
export const FAMILY_KINDS: readonly string[] = ["npc", "deity"];
/** Pages a tie in the wider world may join. */
export const WEB_KINDS: readonly string[] = ["empire", "organization", "faction", "family", "location", "npc", "deity", "pantheon"];
/** Where a membership can point. */
export const MEMBERSHIP_TARGET_KINDS: readonly string[] = ["empire", "organization", "faction", "family", "pantheon"];

export const RELATION_LIMITS = { noteLength: 300, perPage: 200, parentsPerChild: 4 } as const;

export type Edge = { id?: string; from: string; to: string; type: RelationType; note?: string };

/** The stored order of a relation: a symmetric one has its ends in a fixed (sorted) order. */
export function canonical(e: Edge): Edge {
  return RELATION_TYPES[e.type].symmetric && e.from > e.to ? { ...e, from: e.to, to: e.from } : e;
}

export function allowedKinds(type: RelationType): readonly string[] {
  return RELATION_TYPES[type].group === "family" ? FAMILY_KINDS : WEB_KINDS;
}

/** True when `target` can be reached from `start` by following edges of one directed type (start itself counts as reached). */
export function reaches(edges: Edge[], start: string, target: string): boolean {
  const next = new Map<string, string[]>();
  for (const e of edges) next.set(e.from, [...(next.get(e.from) ?? []), e.to]);
  const seen = new Set<string>([start]);
  const stack = [start];
  while (stack.length > 0) {
    const cur = stack.pop() as string;
    if (cur === target) return true;
    for (const n of next.get(cur) ?? []) if (!seen.has(n)) {
      seen.add(n);
      stack.push(n);
    }
  }
  return false;
}

export type RelationContext = {
  /** The kind of each page involved. */
  kinds: Map<string, string>;
  /** Every existing relation of the same type (for duplicates, loops and limits), and the count of all relations on each end's page. */
  sameType: Edge[];
  countOnPage: (id: string) => number;
  names: (id: string) => string;
};

/** Every reason a relation cannot be added, in plain words; empty when it is fine. */
export function checkRelation(input: Edge, ctx: RelationContext): string[] {
  const errors: string[] = [];
  const def = RELATION_TYPES[input.type];
  if (!def) return ["That is not a kind of relation."];
  if (input.from === input.to) return ["A page cannot be related to itself."];
  const note = (input.note ?? "").trim();
  if (note.length > RELATION_LIMITS.noteLength) errors.push(`The note is ${note.length} characters; the limit is ${RELATION_LIMITS.noteLength}.`);

  const allowed = allowedKinds(input.type);
  for (const id of [input.from, input.to]) {
    const kind = ctx.kinds.get(id);
    if (!kind) errors.push("One of the pages could not be found.");
    else if (!allowed.includes(kind)) errors.push(`${ctx.names(id)} is a ${kind}, which cannot have a ${def.label.replace(/ of$/, "").toLowerCase()} relation. Allowed: ${allowed.join(", ")}.`);
  }
  const toKind = ctx.kinds.get(input.to);
  if (input.type === "member" && toKind && !MEMBERSHIP_TARGET_KINDS.includes(toKind)) errors.push(`${ctx.names(input.to)} is a ${toKind}; a membership must point at one of: ${MEMBERSHIP_TARGET_KINDS.join(", ")}.`);
  if (errors.length > 0) return errors;

  const edge = canonical(input);
  if (ctx.sameType.some((e) => canonical(e).from === edge.from && canonical(e).to === edge.to)) errors.push("That relation already exists.");
  else if (def.acyclic && reaches(ctx.sameType, input.to, input.from)) {
    errors.push(input.type === "parent" ? `${ctx.names(input.from)} is already a descendant of ${ctx.names(input.to)}, so they cannot also be their parent.` : `That would make ${ctx.names(input.from)} and ${ctx.names(input.to)} each ranked above the other.`);
  }
  if (input.type === "parent" && ctx.sameType.filter((e) => e.to === input.to).length >= RELATION_LIMITS.parentsPerChild) errors.push(`${ctx.names(input.to)} already has ${RELATION_LIMITS.parentsPerChild} parents, the most one page can have.`);
  for (const id of [input.from, input.to]) {
    if (ctx.countOnPage(id) >= RELATION_LIMITS.perPage) errors.push(`${ctx.names(id)} already has ${RELATION_LIMITS.perPage} relations, the most one page can have.`);
  }
  return errors;
}

// ---------------------------------------------------------------------------
// The family tree
// ---------------------------------------------------------------------------

export type TreeNode = { id: string; name: string };
export type Placed = { id: string; name: string; generation: number; x: number; y: number };
export type TreeLayout = { nodes: Placed[]; width: number; height: number; columnWidth: number; rowHeight: number };

export const TREE = { columnWidth: 200, rowHeight: 120, margin: 20 } as const;

/**
 * Lays out a family: each generation is a row, children below their parents, spouses and siblings on the
 * same row and next to each other. Deterministic: the same family always gives the same picture.
 */
export function layoutFamily(nodes: TreeNode[], edges: Edge[]): TreeLayout {
  const ids = new Set(nodes.map((n) => n.id));
  const parentEdges = edges.filter((e) => e.type === "parent" && ids.has(e.from) && ids.has(e.to));
  const sideEdges = edges.filter((e) => (e.type === "spouse" || e.type === "sibling") && ids.has(e.from) && ids.has(e.to));
  const parentsOf = new Map<string, string[]>();
  for (const e of parentEdges) parentsOf.set(e.to, [...(parentsOf.get(e.to) ?? []), e.from]);

  // Generation: one below the lowest of its parents; a spouse or sibling is brought level with their partner.
  const gen = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  const bound = nodes.length + 2;
  for (let round = 0; round < bound; round++) {
    let changed = false;
    for (const e of parentEdges) {
      const want = (gen.get(e.from) as number) + 1;
      if ((gen.get(e.to) as number) < want) {
        gen.set(e.to, want);
        changed = true;
      }
    }
    for (const e of sideEdges) {
      const level = Math.max(gen.get(e.from) as number, gen.get(e.to) as number);
      for (const id of [e.from, e.to]) if ((gen.get(id) as number) < level) {
        gen.set(id, level);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const byName = (a: TreeNode, b: TreeNode) => a.name.localeCompare(b.name, "en") || a.id.localeCompare(b.id);
  const rows = new Map<number, TreeNode[]>();
  for (const n of [...nodes].sort(byName)) rows.set(gen.get(n.id) as number, [...(rows.get(gen.get(n.id) as number) ?? []), n]);

  const spouses = new Map<string, string[]>();
  for (const e of sideEdges) {
    spouses.set(e.from, [...(spouses.get(e.from) ?? []), e.to]);
    spouses.set(e.to, [...(spouses.get(e.to) ?? []), e.from]);
  }

  const xOf = new Map<string, number>();
  const generations = [...rows.keys()].sort((a, b) => a - b);
  const placed: Placed[] = [];
  let maxCols = 1;
  for (const g of generations) {
    const row = rows.get(g) as TreeNode[];
    // Order a row by where the parents sit (their average column), keeping partners together.
    const key = (n: TreeNode) => {
      const ps = (parentsOf.get(n.id) ?? []).filter((p) => xOf.has(p)).map((p) => xOf.get(p) as number);
      return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : Number.POSITIVE_INFINITY;
    };
    const ordered: TreeNode[] = [];
    const used = new Set<string>();
    const sorted = [...row].sort((a, b) => key(a) - key(b) || byName(a, b));
    for (const n of sorted) {
      if (used.has(n.id)) continue;
      ordered.push(n);
      used.add(n.id);
      for (const s of (spouses.get(n.id) ?? []).sort()) {
        const partner = row.find((r) => r.id === s);
        if (partner && !used.has(partner.id)) {
          ordered.push(partner);
          used.add(partner.id);
        }
      }
    }
    maxCols = Math.max(maxCols, ordered.length);
    ordered.forEach((n, col) => {
      xOf.set(n.id, col);
      placed.push({ id: n.id, name: n.name, generation: g, x: 0, y: 0 });
    });
  }
  const minGen = generations[0] ?? 0;
  for (const p of placed) {
    p.x = TREE.margin + (xOf.get(p.id) as number) * TREE.columnWidth;
    p.y = TREE.margin + (p.generation - minGen) * TREE.rowHeight;
  }
  return {
    nodes: placed,
    width: TREE.margin * 2 + maxCols * TREE.columnWidth,
    height: TREE.margin * 2 + Math.max(1, generations.length) * TREE.rowHeight,
    columnWidth: TREE.columnWidth,
    rowHeight: TREE.rowHeight,
  };
}

/** Every page connected to `rootId` by family ties, following them in both directions. */
export function familyComponent(edges: Edge[], rootId: string): Set<string> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (RELATION_TYPES[e.type].group !== "family") continue;
    adj.set(e.from, [...(adj.get(e.from) ?? []), e.to]);
    adj.set(e.to, [...(adj.get(e.to) ?? []), e.from]);
  }
  const seen = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    for (const n of adj.get(stack.pop() as string) ?? []) if (!seen.has(n)) {
      seen.add(n);
      stack.push(n);
    }
  }
  return seen;
}

// ---------------------------------------------------------------------------
// The web
// ---------------------------------------------------------------------------

export type WebNode = { id: string; name: string; kind: string };
export type WebPlaced = WebNode & { x: number; y: number };

export const WEB = { size: 640, radius: 250 } as const;

/** Pages spread evenly round a circle, ordered by kind then name so the picture is the same every time. */
export function layoutWeb(nodes: WebNode[]): WebPlaced[] {
  const sorted = [...nodes].sort((a, b) => a.kind.localeCompare(b.kind, "en") || a.name.localeCompare(b.name, "en") || a.id.localeCompare(b.id));
  const c = WEB.size / 2;
  if (sorted.length === 1) return [{ ...sorted[0], x: c, y: c }];
  return sorted.map((n, i) => {
    const angle = (2 * Math.PI * i) / sorted.length - Math.PI / 2;
    return { ...n, x: Math.round((c + WEB.radius * Math.cos(angle)) * 100) / 100, y: Math.round((c + WEB.radius * Math.sin(angle)) * 100) / 100 };
  });
}

/** How a relation reads from one end, for lists: "Parent of Aria", "Child of Bram", "Ally of Cael". */
export function describeFrom(edge: Edge, fromThisEnd: string, otherName: string): string {
  const def = RELATION_TYPES[edge.type];
  if (def.symmetric || edge.from === fromThisEnd) return `${def.label} ${otherName}`;
  return `${def.reverse ?? def.label} ${otherName}`;
}
