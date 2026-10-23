import Link from "next/link";
import { RELATION_TYPES, WEB, layoutWeb, type Edge, type RelationType } from "@/lib/relations-core";

type Page = { id: string; slug: string; name: string; kind: string };

/** How each kind of tie is drawn: colour AND pattern, so no tie is told apart by colour alone. */
const STYLE: Partial<Record<RelationType, { stroke: string; dash?: string; width: number; word: string }>> = {
  ally: { stroke: "stroke-chart-2", width: 2.5, word: "solid line" },
  rival: { stroke: "stroke-chart-4", dash: "7 5", width: 2.5, word: "dashed line" },
  vassal: { stroke: "stroke-chart-3", dash: "2 5", width: 3, word: "dotted line with an arrow to the overlord" },
  member: { stroke: "stroke-chart-1", dash: "10 4 2 4", width: 2.5, word: "dash-dot line with an arrow to the group" },
};

const shorten = (s: string, n = 24) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** A small triangle at the target end of a directed tie, pointing along it. */
function arrow(x1: number, y1: number, x2: number, y2: number): string {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const tipX = x2 - 11 * Math.cos(angle);
  const tipY = y2 - 11 * Math.sin(angle);
  const left = [tipX - 9 * Math.cos(angle - 0.45), tipY - 9 * Math.sin(angle - 0.45)];
  const right = [tipX - 9 * Math.cos(angle + 0.45), tipY - 9 * Math.sin(angle + 0.45)];
  return `${tipX},${tipY} ${left[0]},${left[1]} ${right[0]},${right[1]}`;
}

/**
 * Alliances, rivalries, overlords and memberships among the pages a viewer may read, drawn round a circle and
 * listed in a table underneath (the table is the same information in words, with real links).
 */
export function RelationWebView({ pages, edges }: { pages: Page[]; edges: (Edge & { id: string })[] }) {
  const placed = layoutWeb(pages.map((p) => ({ id: p.id, name: p.name, kind: p.kind })));
  const at = new Map(placed.map((p) => [p.id, p]));
  const byId = new Map(pages.map((p) => [p.id, p]));
  const c = WEB.size / 2;
  const used = [...new Set(edges.map((e) => e.type))];

  return (
    <div>
      {/* Wider than narrow screens, so the box scrolls; keyboard users reach it with Tab and scroll with the arrow keys. */}
      <div className="overflow-x-auto rounded-lg border border-border bg-card p-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50" data-testid="relation-web" tabIndex={0} role="region" aria-label="Relationship web, scrolls sideways">
        <svg viewBox={`-170 -20 ${WEB.size + 340} ${WEB.size + 40}`} width={WEB.size + 340} height={WEB.size + 40} className="mx-auto block max-w-none" aria-hidden="true" focusable="false">
          {edges.map((e) => {
            const a = at.get(e.from);
            const b = at.get(e.to);
            const s = STYLE[e.type];
            if (!a || !b || !s) return null;
            return (
              <g key={e.id} data-edge={e.type}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`${s.stroke} fill-none`} strokeWidth={s.width} strokeDasharray={s.dash} />
                {!RELATION_TYPES[e.type].symmetric && <polygon points={arrow(a.x, a.y, b.x, b.y)} className={`${s.stroke.replace("stroke-", "fill-")}`} />}
              </g>
            );
          })}
          {placed.map((p) => {
            const right = p.x >= c;
            return (
              <a key={p.id} href={`/codex/entry/${byId.get(p.id)?.slug}`} tabIndex={-1}>
                <circle cx={p.x} cy={p.y} r={8} className="fill-card stroke-foreground" strokeWidth={2} data-page={p.id} />
                <text x={p.x + (right ? 14 : -14)} y={p.y + 5} textAnchor={right ? "start" : "end"} className="fill-foreground text-[13px]">
                  {shorten(p.name)}
                </text>
                <title>{p.name}</title>
              </a>
            );
          })}
        </svg>
      </div>

      {used.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm" aria-label="How ties are drawn" data-testid="relation-legend">
          {used.map((t) => (
            <li key={t}>
              <strong>{RELATION_TYPES[t].label.replace(/ of$/, "")}</strong>: {STYLE[t]?.word}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[32rem] border-collapse text-[15px]" data-testid="relation-table">
          <caption className="mb-2 text-left font-display text-lg font-bold">All the ties shown</caption>
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.07em] text-muted-foreground">
              <th scope="col" className="border-b border-border py-2 pr-3">From</th>
              <th scope="col" className="border-b border-border py-2 pr-3">Tie</th>
              <th scope="col" className="border-b border-border py-2 pr-3">To</th>
              <th scope="col" className="border-b border-border py-2">Note</th>
            </tr>
          </thead>
          <tbody>
            {edges.map((e) => {
              const a = byId.get(e.from);
              const b = byId.get(e.to);
              if (!a || !b) return null;
              return (
                <tr key={e.id} data-testid="relation-row">
                  <td className="border-b border-border py-2 pr-3">
                    <Link href={`/codex/entry/${a.slug}`} className="text-link underline-offset-4 hover:underline">{a.name}</Link>
                  </td>
                  <td className="border-b border-border py-2 pr-3">{RELATION_TYPES[e.type].label}</td>
                  <td className="border-b border-border py-2 pr-3">
                    <Link href={`/codex/entry/${b.slug}`} className="text-link underline-offset-4 hover:underline">{b.name}</Link>
                  </td>
                  <td className="border-b border-border py-2 text-muted-foreground">{e.note}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
