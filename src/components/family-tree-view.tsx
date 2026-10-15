import Link from "next/link";
import { RELATION_TYPES, describeFrom, type Edge, type TreeLayout } from "@/lib/relations-core";

const BOX_W = 160;
const BOX_H = 48;
const PAD_X = 20;
const PAD_Y = 20;

const shorten = (s: string, n = 21) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

type Person = { id: string; slug: string; name: string };

/**
 * A family tree drawn from a layout: each generation a row, parents joined to children by curves, spouses by
 * a double line and siblings by a dashed one. The picture is for the eye; the list underneath says the same
 * thing in words and holds the real links, so nothing depends on seeing it.
 */
export function FamilyTreeView({ layout, people, edges, rootId }: { layout: TreeLayout; people: Person[]; edges: (Edge & { id: string })[]; rootId: string }) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const pos = new Map(layout.nodes.map((n) => [n.id, n]));
  const generations = [...new Set(layout.nodes.map((n) => n.generation))].sort((a, b) => a - b);
  const centreX = (id: string) => (pos.get(id)?.x ?? 0) + PAD_X + BOX_W / 2;
  const top = (id: string) => (pos.get(id)?.y ?? 0) + PAD_Y;

  const tiesOf = (id: string) =>
    edges
      .filter((e) => e.from === id || e.to === id)
      .map((e) => describeFrom(e, id, byId.get(e.from === id ? e.to : e.from)?.name ?? ""))
      .sort();

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card p-2" data-testid="family-tree">
        <svg viewBox={`0 0 ${layout.width} ${layout.height}`} width={layout.width} height={layout.height} className="mx-auto block max-w-none" aria-hidden="true" focusable="false">
          {edges.map((e) => {
            if (!pos.has(e.from) || !pos.has(e.to)) return null;
            const x1 = centreX(e.from);
            const x2 = centreX(e.to);
            if (e.type === "parent") {
              const y1 = top(e.from) + BOX_H;
              const y2 = top(e.to);
              const mid = (y1 + y2) / 2;
              return <path key={e.id} d={`M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`} className="fill-none stroke-muted-foreground" strokeWidth={2} data-edge="parent" />;
            }
            const y = top(e.from);
            const lift = Math.max(14, Math.min(40, Math.abs(x2 - x1) / 8));
            const d = `M ${x1} ${y} Q ${(x1 + x2) / 2} ${y - lift * 1.6}, ${x2} ${y}`;
            return e.type === "spouse" ? (
              <g key={e.id} data-edge="spouse">
                <path d={d} className="fill-none stroke-gold" strokeWidth={4} />
                <path d={d} className="fill-none stroke-card" strokeWidth={1.5} />
              </g>
            ) : (
              <path key={e.id} d={d} className="fill-none stroke-muted-foreground" strokeWidth={2} strokeDasharray="5 4" data-edge="sibling" />
            );
          })}
          {layout.nodes.map((n) => {
            const p = byId.get(n.id);
            if (!p) return null;
            return (
              <a key={n.id} href={`/codex/entry/${p.slug}`} tabIndex={-1}>
                <rect x={n.x + PAD_X} y={n.y + PAD_Y} width={BOX_W} height={BOX_H} rx={10} className={n.id === rootId ? "fill-card stroke-primary" : "fill-card stroke-border"} strokeWidth={n.id === rootId ? 3 : 1.5} data-person={n.id} />
                <text x={n.x + PAD_X + BOX_W / 2} y={n.y + PAD_Y + BOX_H / 2 + 5} textAnchor="middle" className="fill-foreground text-[14px]">
                  {shorten(n.name)}
                </text>
                <title>{n.name}</title>
              </a>
            );
          })}
        </svg>
      </div>

      <section aria-labelledby="family-members" className="mt-6">
        <h2 id="family-members" className="font-display mb-3 text-xl font-bold tracking-tight">
          Everyone in this family
        </h2>
        <div className="grid gap-4">
          {generations.map((g, i) => (
            <div key={g}>
              <h3 className="mb-1 text-sm font-semibold text-muted-foreground">{generations.length === 1 ? "One generation" : `Generation ${i + 1}`}</h3>
              <ul className="grid gap-1 text-[15px]" data-testid="family-generation">
                {layout.nodes
                  .filter((n) => n.generation === g)
                  .sort((a, b) => a.x - b.x)
                  .map((n) => {
                    const p = byId.get(n.id) as Person;
                    return (
                      <li key={n.id} data-testid="family-person">
                        <Link href={`/codex/entry/${p.slug}`} className="text-link underline-offset-4 hover:underline">
                          {p.name}
                        </Link>
                        {tiesOf(n.id).length > 0 && <span className="text-muted-foreground">: {tiesOf(n.id).join("; ")}</span>}
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[13px] text-muted-foreground">
          {Object.values(RELATION_TYPES).filter((t) => t.group === "family").length} kinds of family tie are drawn: parent (a curve down), spouse (a double line) and sibling (a dashed line).
        </p>
      </section>
    </div>
  );
}
