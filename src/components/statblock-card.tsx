import { ExternalLink, TriangleAlert } from "lucide-react";
import { ABILITIES, abilityModifier, formatModifier, type Statblock } from "@/lib/statblock";
import { wikidotSearch } from "@/lib/character/links";

const ABILITY_LABEL: Record<(typeof ABILITIES)[number], string> = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" };

/** Where a reader can look up the rules words used in a stat block (links only; no rules text is held here). */
const RULE_LINKS = [
  { label: "Conditions", href: wikidotSearch("conditions") },
  { label: "Damage types", href: wikidotSearch("damage types") },
  { label: "Senses", href: wikidotSearch("senses") },
];

/**
 * A 5e stat block laid out from the text a DM wrote. The ability modifiers and the proficiency bonus are
 * worked out here, so they are right even when the written ones are not; the DM is told when they differ.
 */
export function StatblockCard({
  name,
  subtitle,
  block,
  bodyHtml,
  notes,
}: {
  name: string;
  subtitle: string;
  block: Statblock;
  bodyHtml: string;
  /** Warnings for the DM only (mismatched modifiers, a Challenge Rating that disagrees with the property). */
  notes: string[];
}) {
  return (
    <section aria-label={`Stat block for ${name}`} data-testid="statblock" className="mb-6 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="h-1.5 bg-gold" aria-hidden="true" />
      <div className="grid gap-4 p-4">
        <header>
          <h2 className="font-display text-xl font-bold tracking-tight">{name}</h2>
          {subtitle && <p className="text-sm italic text-muted-foreground">{subtitle}</p>}
        </header>

        <dl className="grid gap-1 text-[15px]">
          {block.ac && (
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-semibold">Armor Class</dt>
              <dd data-testid="statblock-ac">
                {block.ac.value} {block.ac.note}
              </dd>
            </div>
          )}
          {block.hp && (
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-semibold">Hit Points</dt>
              <dd data-testid="statblock-hp">
                {block.hp.value} {block.hp.formula}
              </dd>
            </div>
          )}
          {block.speed && (
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-semibold">Speed</dt>
              <dd>{block.speed}</dd>
            </div>
          )}
        </dl>

        <div className="h-px bg-gold/60" aria-hidden="true" />

        {block.abilities && (
          <dl className="grid grid-cols-3 gap-2 text-center sm:grid-cols-6" aria-label="Ability scores and modifiers">
            {ABILITIES.map((a) => {
              const score = block.abilities![a].score;
              return (
                <div key={a} className="rounded-lg bg-muted/60 px-1 py-2" data-testid={`statblock-${a}`}>
                  <dt className="text-xs font-semibold tracking-wide text-muted-foreground">{ABILITY_LABEL[a]}</dt>
                  <dd className="text-[15px]">
                    {score} <span className="text-muted-foreground">({formatModifier(abilityModifier(score))})</span>
                  </dd>
                </div>
              );
            })}
          </dl>
        )}

        <div className="h-px bg-gold/60" aria-hidden="true" />

        <dl className="grid gap-1 text-[15px]">
          {block.properties.map((p) => (
            <div key={p.label} className="flex flex-wrap gap-x-2">
              <dt className="font-semibold">{p.label}</dt>
              <dd>{p.value}</dd>
            </div>
          ))}
          {block.challenge && (
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-semibold">Challenge</dt>
              <dd data-testid="statblock-cr">
                {block.challenge.cr}
                {block.challenge.xp ? ` (${block.challenge.xp} XP)` : ""}
              </dd>
            </div>
          )}
          {block.proficiency !== null && (
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-semibold">Proficiency Bonus</dt>
              <dd data-testid="statblock-prof">+{block.proficiency}</dd>
            </div>
          )}
        </dl>

        {bodyHtml && (
          <>
            <div className="h-px bg-gold/60" aria-hidden="true" />
            <div className="prose-codex" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
          </>
        )}

        {notes.length > 0 && (
          <div role="note" className="no-print rounded-lg border border-dashed border-secret/50 bg-secret/5 p-3 text-sm" data-testid="statblock-notes">
            <p className="mb-1 flex items-center gap-2 font-semibold text-secret">
              <TriangleAlert aria-hidden="true" className="size-4" />
              For you only
            </p>
            <ul className="list-disc pl-5">
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        )}

        <p className="no-print flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
          Look up the rules:
          {RULE_LINKS.map((l) => (
            <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-link underline-offset-4 hover:underline">
              {l.label}
              <ExternalLink aria-hidden="true" className="size-3" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ))}
        </p>
      </div>
    </section>
  );
}
