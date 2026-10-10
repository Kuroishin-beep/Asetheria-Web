import { Card, CardContent } from "@/components/ui/card";
import type { CharacterInput, Sheet } from "@/lib/character/engine";
import { ABILITIES, ABILITY_NAMES, COMBAT_HOUSE_RULES, CITIZENSHIPS } from "@/lib/character/house-rules";
import { cn } from "@/lib/utils";

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);
const ordinal = (n: number) => ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"][n - 1] ?? `${n}th`;

function Block({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("break-inside-avoid rounded-xl border border-border p-4", className)}>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.07em] text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg bg-muted/60 p-3 text-center">
      <div className="font-display text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{label}</div>
      {hint && <div className="text-[11px] text-faint-foreground">{hint}</div>}
    </div>
  );
}

/**
 * A character laid out like the 5e sheet: name block, the six abilities, saves,
 * the eighteen skills, combat numbers, spellcasting, equipment and the
 * personality boxes. It is a plain read-only view of what the engine computed,
 * and it prints cleanly (the app's print styles hide the chrome).
 */
export function CharacterSheetView({ sheet, input }: { sheet: Sheet; input: CharacterInput }) {
  const citizenship = CITIZENSHIPS.find((c) => c.id === input.citizenship)?.name ?? "None";
  return (
    <article aria-label={`Character sheet for ${sheet.name}`} className="grid gap-4" data-testid="character-sheet">
      <Card>
        <CardContent className="grid gap-3 sm:grid-cols-[1.5fr_repeat(3,1fr)]">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight" data-testid="sheet-name">
              {sheet.name}
            </h2>
            <p className="text-sm text-muted-foreground">
              {sheet.heritage} {sheet.className}, level {sheet.level}
            </p>
            {sheet.playerName && <p className="text-xs text-faint-foreground">Player: {sheet.playerName}</p>}
          </div>
          <Info label="Background" value={sheet.background || "None"} />
          <Info label="Citizenship" value={citizenship} />
          <Info label="Worship" value={input.worship.trim() || "Unaffiliated"} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="grid content-start gap-4">
          <Block title="Ability scores">
            <ul className="grid grid-cols-3 gap-2 lg:grid-cols-2" aria-label="Ability scores">
              {ABILITIES.map((a) => (
                <li key={a} className="rounded-lg bg-muted/60 p-2 text-center" data-testid={`ability-${a}`}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{ABILITY_NAMES[a]}</div>
                  <div className="font-display text-xl font-bold tabular-nums">{signed(sheet.modifiers[a])}</div>
                  <div className="text-xs text-muted-foreground tabular-nums">{sheet.scores[a]}</div>
                </li>
              ))}
            </ul>
          </Block>

          <Block title="Saving throws">
            <ul className="grid gap-1 text-sm">
              {sheet.saves.map((s) => (
                <li key={s.ability} className="flex items-center justify-between gap-2" data-testid={`save-${s.ability}`}>
                  <span>
                    {ABILITY_NAMES[s.ability]}
                    {s.proficient && <span className="ml-1 text-xs text-gold">proficient</span>}
                  </span>
                  <span className="tabular-nums">{signed(s.bonus)}</span>
                </li>
              ))}
            </ul>
          </Block>

          <Block title="Skills">
            <ul className="grid gap-1 text-sm">
              {sheet.skills.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2" data-testid={`skill-${s.id}`}>
                  <span>
                    {s.name} <span className="text-xs text-faint-foreground">({s.ability.toUpperCase()})</span>
                    {s.proficient && <span className="ml-1 text-xs text-gold">proficient</span>}
                  </span>
                  <span className="tabular-nums">{signed(s.bonus)}</span>
                </li>
              ))}
            </ul>
          </Block>
        </div>

        <div className="grid content-start gap-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            <Stat label="Armor class" value={sheet.armorClass} />
            <Stat label="Initiative" value={signed(sheet.initiative)} />
            <Stat label="Speed" value={`${sheet.speed} ft`} />
            <Stat label="Hit points" value={sheet.hitPoints} hint={`Hit dice ${sheet.hitDice}`} />
            <Stat label="Proficiency" value={signed(sheet.proficiencyBonus)} />
            <Stat label="Passive Perception" value={sheet.passivePerception} />
          </div>

          {sheet.spellcasting && (
            <Block title="Spellcasting" className="print:break-inside-avoid">
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Ability" value={sheet.spellcasting.ability.toUpperCase()} />
                <Stat label="Spell save DC" value={sheet.spellcasting.saveDc} />
                <Stat label="Spell attack" value={signed(sheet.spellcasting.attackBonus)} />
              </div>
              {sheet.spellcasting.pact ? (
                <p className="mt-3 text-sm" data-testid="pact-slots">
                  Pact Magic: {sheet.spellcasting.pact.slots} {sheet.spellcasting.pact.slots === 1 ? "slot" : "slots"} of {ordinal(sheet.spellcasting.pact.slotLevel)} level, regained on a short rest.
                </p>
              ) : sheet.spellcasting.slots.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">No spell slots yet at this level.</p>
              ) : (
                <ul className="mt-3 flex flex-wrap gap-2 text-sm" aria-label="Spell slots" data-testid="spell-slots">
                  {sheet.spellcasting.slots.map((n, i) => (
                    <li key={i} className="rounded-md bg-muted/60 px-2 py-1">
                      {ordinal(i + 1)}: <strong className="tabular-nums">{n}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </Block>
          )}

          <Block title="Equipment">
            <Prose text={input.equipment} empty="Nothing listed yet." />
          </Block>

          <div className="grid gap-4 sm:grid-cols-2">
            <Block title="Personality traits"><Prose text={input.traits} empty="None" /></Block>
            <Block title="Ideals"><Prose text={input.ideals} empty="None" /></Block>
            <Block title="Bonds"><Prose text={input.bonds} empty="None" /></Block>
            <Block title="Flaws"><Prose text={input.flaws} empty="None" /></Block>
          </div>
          <Block title="Appearance and backstory">
            <Prose text={[input.appearance, input.backstory].filter((t) => t.trim()).join("\n\n")} empty="None" />
          </Block>

          <Block title="Asetheria house rules in play">
            <dl className="grid gap-2 text-sm">
              {COMBAT_HOUSE_RULES.map((r) => (
                <div key={r.title}>
                  <dt className="font-semibold">{r.title}</dt>
                  <dd className="text-muted-foreground">{r.text}</dd>
                </div>
              ))}
            </dl>
          </Block>
        </div>
      </div>
    </article>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function Prose({ text, empty }: { text: string; empty: string }) {
  return text.trim() ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p> : <p className="text-sm italic text-faint-foreground">{empty}</p>;
}
