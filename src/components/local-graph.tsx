import Link from "next/link";
import type { EntryKind } from "@/db/schema";

export type LocalNode = { id: string; slug: string; name: string; kind: EntryKind };

const SIZE = 300;
const CENTRE = SIZE / 2;
const RING = 108;
const MAX_NEIGHBOURS = 10;
const LABEL_CHARS = 14;

const round = (n: number) => Math.round(n * 100) / 100;
const clip = (s: string) => (s.length > LABEL_CHARS ? `${s.slice(0, LABEL_CHARS - 1)}…` : s);

/**
 * The entry and its direct neighbours, drawn as a ring. It is built only from
 * lists the page already fetched through the access-checked queries (outgoing
 * links, backlinks, children, parent), so a player's picture contains exactly
 * the entries they may read and nothing is filtered after the fact.
 */
export function LocalGraph({ centre, neighbours }: { centre: LocalNode; neighbours: LocalNode[] }) {
  const shown = neighbours.slice(0, MAX_NEIGHBOURS);
  if (shown.length === 0) return null;
  const extra = neighbours.length - shown.length;

  const placed = shown.map((n, i) => {
    const angle = (i / shown.length) * Math.PI * 2 - Math.PI / 2;
    return { ...n, x: round(CENTRE + RING * Math.cos(angle)), y: round(CENTRE + RING * Math.sin(angle)) };
  });

  return (
    <section className="mb-8" aria-labelledby="local-graph-title" data-testid="local-graph">
      <h2 id="local-graph-title" className="mb-3 text-xs font-semibold uppercase tracking-[0.07em] text-muted-foreground">
        Connections
      </h2>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        aria-hidden="true"
        className="w-full max-w-[21rem] rounded-xl bg-card ring-1 ring-foreground/10"
      >
        {placed.map((n) => (
          <line key={`edge-${n.id}`} x1={CENTRE} y1={CENTRE} x2={n.x} y2={n.y} className="stroke-border" strokeWidth={1.5} />
        ))}
        <circle cx={CENTRE} cy={CENTRE} r={16} className="fill-primary" />
        <text x={CENTRE} y={CENTRE + 32} textAnchor="middle" className="fill-foreground text-[11px] font-semibold">
          {clip(centre.name)}
        </text>
        {placed.map((n) => (
          <Link key={n.id} href={`/codex/entry/${n.slug}`} data-node={n.slug} tabIndex={-1}>
            <title>{n.name}</title>
            <circle cx={n.x} cy={n.y} r={9} className="fill-muted stroke-primary" strokeWidth={1.5} />
            <text x={n.x} y={n.y + (n.y > CENTRE ? 24 : -15)} textAnchor="middle" className="fill-muted-foreground text-[10px]">
              {clip(n.name)}
            </text>
          </Link>
        ))}
      </svg>
      {/* The picture is for the mouse; every one of these links is also in the lists below, which is what
          keyboard and screen-reader users get, so the diagram is hidden from the accessibility tree. */}
      <p className="sr-only">
        {shown.length} connected {shown.length === 1 ? "entry" : "entries"} are listed below as references and linked mentions.
      </p>
      {extra > 0 && <p className="mt-2 text-[13px] text-muted-foreground">and {extra} more in the lists below</p>}
    </section>
  );
}
