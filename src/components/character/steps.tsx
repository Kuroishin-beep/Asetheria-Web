"use client";

import Link from "next/link";
import { useState } from "react";
import { Dices, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { ArrayPanel, PointBuyPanel, RollPanel } from "@/components/character/score-panels";
import { computeHitPoints, abilityModifier, rerollLevel, rollLevel, rolledLevelsNeeded } from "@/lib/character/engine";
import { finalConScore, type Draft } from "@/lib/character/draft";
import {
  ABILITIES,
  ABILITY_NAMES,
  ABILITY_SCORE_METHODS,
  CITIZENSHIPS,
  CITIZENSHIP_TEXT,
  HIT_POINTS,
  HIT_POINT_RULES_TEXT,
  STAT_RULES_TEXT,
  WORSHIP_TEXT,
  CHARACTER_LIMITS,
  type Ability,
  type AbilityScoreMethod,
} from "@/lib/character/house-rules";
import { STEP_LINKS, backgroundLink, classLink, heritageLink, type LearnLink } from "@/lib/character/links";
import { BACKGROUND_NAMES, BACKGROUND_SKILL_COUNT, CLASSES, OTHER_RACE, RACES, SKILLS, findClass, findRace, type SkillId } from "@/lib/character/srd";
import { cn } from "@/lib/utils";

export type Update = (patch: Partial<Draft>) => void;
type Props = { draft: Draft; update: Update };

export type EmpireInfo = { id: string; name: string; summary: string; benefits?: string; weaknesses?: string; href?: string };

const METHOD_LABELS: Record<AbilityScoreMethod, string> = {
  "point-buy": "Point buy",
  roll: "Roll the dice",
  "standard-array": "Standard array",
};

/** A "Learn more" link to Wikidot (or a codex page): opens in a new tab and says so. */
export function LearnMore({ links }: { links: LearnLink[] }) {
  const shown = links.filter(Boolean);
  if (shown.length === 0) return null;
  return (
    <nav aria-label="Learn more" className="mt-4 border-t border-border pt-3 text-sm">
      <span className="mr-2 text-xs font-semibold uppercase tracking-[0.07em] text-muted-foreground">Learn more</span>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        {shown.map((l) => {
          const internal = l.href.startsWith("/");
          return (
            <li key={l.href}>
              {internal ? (
                <Link href={l.href} className="text-link underline-offset-4 hover:underline">
                  {l.label}
                </Link>
              ) : (
                <a href={l.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-link underline-offset-4 hover:underline">
                  {l.label}
                  <ExternalLink aria-hidden="true" className="size-3" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Who
// ---------------------------------------------------------------------------

export function StepWho({ draft, update }: Props) {
  return (
    <div className="grid gap-4">
      <Field id="c-name" label="Character name">
        <Input id="c-name" value={draft.name} maxLength={80} onChange={(e) => update({ name: e.target.value })} autoComplete="off" />
      </Field>
      <Field id="c-player" label="Your name (optional)">
        <Input id="c-player" value={draft.playerName} maxLength={80} onChange={(e) => update({ playerName: e.target.value })} autoComplete="off" />
      </Field>
      <Field id="c-concept" label="The idea in one line (optional)" hint="A sentence is plenty: &ldquo;a retired lighthouse keeper who owes the wrong people&rdquo;.">
        <Input id="c-concept" value={draft.concept} maxLength={300} onChange={(e) => update({ concept: e.target.value })} />
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Heritage
// ---------------------------------------------------------------------------

export function StepHeritage({ draft, update }: Props) {
  const race = findRace(draft.raceId);
  const choice = race?.choiceBonuses;
  const bonusText = (r: (typeof RACES)[number]) =>
    ABILITIES.filter((a) => r.bonuses[a])
      .map((a) => `${a.toUpperCase()} +${r.bonuses[a]}`)
      .join(", ") + (r.choiceBonuses ? `, and +${r.choiceBonuses.amount} to ${r.choiceBonuses.count} others` : "");

  function toggleChoice(a: Ability, on: boolean) {
    const next = on ? [...draft.chosenBonuses, a] : draft.chosenBonuses.filter((x) => x !== a);
    update({ chosenBonuses: next });
  }

  return (
    <div className="grid gap-4">
      <RadioGroup value={draft.raceId} onValueChange={(raceId) => update({ raceId, chosenBonuses: [] })} aria-label="Heritage" className="grid gap-2 sm:grid-cols-2">
        {RACES.map((r) => (
          <div key={r.id} className="flex items-start gap-2 rounded-lg border border-border p-3">
            <RadioGroupItem id={`race-${r.id}`} value={r.id} className="mt-0.5" />
            <Label htmlFor={`race-${r.id}`} className="grid gap-0.5 font-normal">
              <span className="font-medium">{r.name}</span>
              <span className="text-xs text-muted-foreground">
                {bonusText(r)}. Speed {r.speed} ft, {r.size.toLowerCase()}.
              </span>
            </Label>
          </div>
        ))}
        <div className="flex items-start gap-2 rounded-lg border border-border p-3">
          <RadioGroupItem id="race-other" value={OTHER_RACE.id} className="mt-0.5" />
          <Label htmlFor="race-other" className="grid gap-0.5 font-normal">
            <span className="font-medium">{OTHER_RACE.name}</span>
            <span className="text-xs text-muted-foreground">A heritage from the codex or your own, with bonuses you enter.</span>
          </Label>
        </div>
      </RadioGroup>

      {choice && (
        <fieldset className="grid gap-2 rounded-lg bg-muted/40 p-3" data-testid="heritage-choices">
          <legend className="text-sm font-medium">
            Choose {choice.count} abilities for +{choice.amount} (not Charisma)
          </legend>
          <div className="flex flex-wrap gap-4">
            {ABILITIES.filter((a) => !choice.exclude.includes(a)).map((a) => {
              const checked = draft.chosenBonuses.includes(a);
              return (
                <div key={a} className="flex items-center gap-2">
                  <Checkbox id={`bonus-${a}`} checked={checked} disabled={!checked && draft.chosenBonuses.length >= choice.count} onCheckedChange={(on) => toggleChoice(a, on === true)} />
                  <Label htmlFor={`bonus-${a}`} className="font-normal">
                    {ABILITY_NAMES[a]}
                  </Label>
                </div>
              );
            })}
          </div>
        </fieldset>
      )}

      {draft.raceId === OTHER_RACE.id && (
        <div className="grid gap-3 rounded-lg bg-muted/40 p-3" data-testid="heritage-other">
          <Field id="other-name" label="Name of your heritage">
            <Input id="other-name" value={draft.otherName} maxLength={80} onChange={(e) => update({ otherName: e.target.value })} />
          </Field>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {ABILITIES.map((a) => (
              <Field key={a} id={`other-${a}`} label={a.toUpperCase()}>
                <NativeSelect id={`other-${a}`} value={String(draft.otherBonuses[a] ?? 0)} onChange={(e) => update({ otherBonuses: { ...draft.otherBonuses, [a]: Number(e.target.value) } })}>
                  {Array.from({ length: OTHER_RACE.maxBonusEach + 1 }, (_, n) => (
                    <NativeSelectOption key={n} value={String(n)}>
                      +{n}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Bonuses add up to at most {OTHER_RACE.maxBonusTotal}.</p>
          <Field id="other-speed" label="Speed (feet)">
            <Input id="other-speed" type="number" min={OTHER_RACE.minSpeed} max={OTHER_RACE.maxSpeed} value={draft.otherSpeed} onChange={(e) => update({ otherSpeed: Number(e.target.value) })} />
          </Field>
        </div>
      )}
      <LearnMore links={[heritageLink(draft.raceId), ...STEP_LINKS.heritage].filter((l): l is LearnLink => l !== null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Class and level
// ---------------------------------------------------------------------------

export function StepClass({ draft, update }: Props) {
  const klass = findClass(draft.classId);
  return (
    <div className="grid gap-4">
      <RadioGroup value={draft.classId} onValueChange={(classId) => update({ classId, classSkills: [], levelRolls: [] })} aria-label="Class" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {CLASSES.map((c) => (
          <div key={c.id} className="flex items-start gap-2 rounded-lg border border-border p-3">
            <RadioGroupItem id={`class-${c.id}`} value={c.id} className="mt-0.5" />
            <Label htmlFor={`class-${c.id}`} className="grid gap-0.5 font-normal">
              <span className="font-medium">{c.name}</span>
              <span className="text-xs text-muted-foreground">
                d{c.hitDie}, saves {c.saves.map((s) => s.toUpperCase()).join(" and ")}
                {c.spellcasting.kind !== "none" ? `, ${c.spellcasting.kind === "pact" ? "pact magic" : "spellcasting"}` : ""}
              </span>
            </Label>
          </div>
        ))}
      </RadioGroup>
      <Field id="c-level" label="Level" hint={`Levels ${CHARACTER_LIMITS.minLevel} to ${CHARACTER_LIMITS.maxLevel}. Most new characters start at 1.`}>
        <Input
          id="c-level"
          type="number"
          min={CHARACTER_LIMITS.minLevel}
          max={CHARACTER_LIMITS.maxLevel}
          value={draft.level}
          onChange={(e) => update({ level: Number(e.target.value), levelRolls: [] })}
          className="max-w-24"
        />
      </Field>
      {klass && (
        <p className="text-sm text-muted-foreground">
          {klass.name}: hit die d{klass.hitDie}, proficient in {klass.saves.map((s) => ABILITY_NAMES[s]).join(" and ")} saving throws, {klass.skillChoices} skill choices.
        </p>
      )}
      <LearnMore links={[classLink(draft.classId), ...STEP_LINKS.class].filter((l): l is LearnLink => l !== null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. Background
// ---------------------------------------------------------------------------

const CUSTOM = "__custom";

export function StepBackground({ draft, update }: Props) {
  const known = (BACKGROUND_NAMES as readonly string[]).includes(draft.backgroundName);
  // "Something else" is a choice the player makes, remembered here, not guessed from the text.
  const [custom, setCustom] = useState(draft.backgroundName.trim() !== "" && !known);
  const selectValue = custom ? CUSTOM : known ? draft.backgroundName : "";
  return (
    <div className="grid gap-4">
      <Field id="c-background" label="Your background" hint="Where you came from before the adventure. The Skills step asks which two skills it gave you.">
        <NativeSelect
          id="c-background"
          value={selectValue}
          onChange={(e) => {
            if (e.target.value === CUSTOM) {
              setCustom(true);
              update({ backgroundName: "" });
            } else {
              setCustom(false);
              update({ backgroundName: e.target.value });
            }
          }}
        >
          <NativeSelectOption value="">Choose</NativeSelectOption>
          {BACKGROUND_NAMES.map((b) => (
            <NativeSelectOption key={b} value={b}>
              {b}
            </NativeSelectOption>
          ))}
          <NativeSelectOption value={CUSTOM}>Something else (write it)</NativeSelectOption>
        </NativeSelect>
      </Field>
      {custom && (
        <Field id="c-background-custom" label="Your background, in a few words">
          <Input id="c-background-custom" value={draft.backgroundName} maxLength={80} onChange={(e) => update({ backgroundName: e.target.value })} />
        </Field>
      )}
      <LearnMore links={[backgroundLink(draft.backgroundName), ...STEP_LINKS.background].filter((l): l is LearnLink => l !== null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. Ability scores
// ---------------------------------------------------------------------------

export function StepScores({ draft, update }: Props) {
  return (
    <div className="grid gap-4">
      <RadioGroup value={draft.method} onValueChange={(method) => update({ method: method as AbilityScoreMethod })} aria-label="How to set your ability scores" className="grid gap-2">
        {ABILITY_SCORE_METHODS.map((m) => (
          <div key={m} className="flex items-start gap-2 rounded-lg border border-border p-3">
            <RadioGroupItem id={`method-${m}`} value={m} className="mt-0.5" />
            <Label htmlFor={`method-${m}`} className="grid gap-0.5 font-normal">
              <span className="font-medium">{METHOD_LABELS[m]}</span>
              <span className="text-xs text-muted-foreground">{STAT_RULES_TEXT[m]}</span>
            </Label>
          </div>
        ))}
      </RadioGroup>
      {draft.method === "point-buy" && <PointBuyPanel draft={draft} update={update} />}
      {draft.method === "roll" && <RollPanel draft={draft} update={update} />}
      {draft.method === "standard-array" && <ArrayPanel draft={draft} update={update} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 6. Skills
// ---------------------------------------------------------------------------

export function StepSkills({ draft, update }: Props) {
  const klass = findClass(draft.classId);
  const options: readonly SkillId[] = !klass ? [] : klass.skillOptions === "any" ? SKILLS.map((s) => s.id) : klass.skillOptions;
  const nameOf = (id: SkillId) => SKILLS.find((s) => s.id === id)?.name ?? id;

  function toggle(list: "classSkills" | "backgroundSkills", id: SkillId, on: boolean) {
    const cur = draft[list];
    update({ [list]: on ? [...cur, id] : cur.filter((x) => x !== id) } as Partial<Draft>);
  }

  if (!klass) return <p className="text-sm text-muted-foreground">Choose a class first.</p>;
  return (
    <div className="grid gap-6">
      <fieldset className="grid gap-2" data-testid="class-skills">
        <legend className="mb-1 text-sm font-medium">
          Your class gives you {klass.skillChoices} skills ({draft.classSkills.length} chosen)
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((id) => {
            const checked = draft.classSkills.includes(id);
            return (
              <div key={id} className="flex items-center gap-2">
                <Checkbox id={`cs-${id}`} checked={checked} disabled={!checked && draft.classSkills.length >= klass.skillChoices} onCheckedChange={(on) => toggle("classSkills", id, on === true)} />
                <Label htmlFor={`cs-${id}`} className="font-normal">
                  {nameOf(id)}
                </Label>
              </div>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="grid gap-2" data-testid="background-skills">
        <legend className="mb-1 text-sm font-medium">
          Your background gave you {BACKGROUND_SKILL_COUNT} skills ({draft.backgroundSkills.length} chosen)
        </legend>
        <p className="text-xs text-muted-foreground">Look up your background (the link is on the Background step) to see which two it grants. A skill you already took from your class is greyed out.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {SKILLS.map((s) => {
            const checked = draft.backgroundSkills.includes(s.id);
            const taken = draft.classSkills.includes(s.id);
            return (
              <div key={s.id} className="flex items-center gap-2">
                <Checkbox id={`bs-${s.id}`} checked={checked} disabled={taken || (!checked && draft.backgroundSkills.length >= BACKGROUND_SKILL_COUNT)} onCheckedChange={(on) => toggle("backgroundSkills", s.id, on === true)} />
                <Label htmlFor={`bs-${s.id}`} className={cn("font-normal", taken && "text-faint-foreground")}>
                  {s.name}
                </Label>
              </div>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 7. Hit points
// ---------------------------------------------------------------------------

export function StepHp({ draft, update }: Props) {
  const klass = findClass(draft.classId);
  if (!klass) return <p className="text-sm text-muted-foreground">Choose a class first.</p>;

  const conMod = abilityModifier(finalConScore(draft));
  const needed = rolledLevelsNeeded(draft.level);
  const hp = computeHitPoints({ hitDie: klass.hitDie, level: draft.level, conMod, levelRolls: draft.levelRolls });
  const ceiling = draft.level * (klass.hitDie + Math.max(0, conMod));

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">{HIT_POINT_RULES_TEXT}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="How to set hit points">
        <Button type="button" variant={draft.hpMode === "rolled" ? "default" : "outline"} size="sm" aria-pressed={draft.hpMode === "rolled"} onClick={() => update({ hpMode: "rolled" })}>
          House rules (maxed, then rolled)
        </Button>
        <Button type="button" variant={draft.hpMode === "manual" ? "default" : "outline"} size="sm" aria-pressed={draft.hpMode === "manual"} onClick={() => update({ hpMode: "manual" })}>
          Enter my own total
        </Button>
      </div>

      {draft.hpMode === "rolled" ? (
        <div className="grid gap-3" data-testid="hp-rolled">
          <p className="text-sm">
            Hit die d{klass.hitDie}, Constitution modifier {conMod >= 0 ? `+${conMod}` : `−${Math.abs(conMod)}`}. Levels 1 to {Math.min(draft.level, HIT_POINTS.maxedThroughLevel)}: the full {klass.hitDie} each.
          </p>
          {needed === 0 ? (
            <p className="text-sm text-muted-foreground">No levels to roll at level {draft.level}.</p>
          ) : (
            <>
              <div>
                <Button type="button" onClick={() => update({ levelRolls: Array.from({ length: needed }, () => rollLevel(klass.hitDie)) })} data-testid="hp-roll">
                  <Dices aria-hidden="true" />
                  {draft.levelRolls.length === needed ? "Roll them all again" : `Roll levels ${HIT_POINTS.maxedThroughLevel + 1} to ${draft.level}`}
                </Button>
              </div>
              {draft.levelRolls.length === needed && (
                <ul className="grid gap-1 text-sm" aria-label="Rolled levels">
                  {draft.levelRolls.map((r, i) => {
                    const level = HIT_POINTS.maxedThroughLevel + 1 + i;
                    const canReroll = r.first === HIT_POINTS.rerollOn && r.reroll === undefined;
                    return (
                      <li key={level} className="flex flex-wrap items-center gap-2 tabular-nums">
                        <span className="w-16 text-faint-foreground">Level {level}</span>
                        <span>
                          rolled <strong>{r.first}</strong>
                          {r.reroll !== undefined && (
                            <>
                              , rerolled <strong>{r.reroll}</strong> (kept)
                            </>
                          )}
                        </span>
                        {canReroll && (
                          <Button type="button" size="xs" variant="outline" onClick={() => update({ levelRolls: draft.levelRolls.map((x, j) => (j === i ? rerollLevel(x, klass.hitDie) : x)) })}>
                            Reroll this {HIT_POINTS.rerollOn} (you must keep the new roll)
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
          {hp.ok && (
            <p className="text-sm" data-testid="hp-total" role="status">
              Hit points: <strong>{hp.total}</strong>
            </p>
          )}
        </div>
      ) : (
        <Field id="hp-manual" label={`Hit points (1 to ${ceiling})`} hint="Use this if your DM has rolled for you or you are bringing a character from elsewhere.">
          <Input id="hp-manual" type="number" min={1} max={ceiling} value={draft.manualHp || ""} onChange={(e) => update({ manualHp: Number(e.target.value) })} className="max-w-32" />
        </Field>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 8. Equipment
// ---------------------------------------------------------------------------

export function StepEquipment({ draft, update }: Props) {
  return (
    <div className="grid gap-4">
      <Field id="c-equipment" label="What you carry, and your gold" hint="One item per line is easiest to read on the sheet.">
        <Textarea id="c-equipment" rows={6} value={draft.equipment} maxLength={CHARACTER_LIMITS.maxTextLength} onChange={(e) => update({ equipment: e.target.value })} />
      </Field>
      <Field id="c-ac" label="Armor Class (optional)" hint="Leave blank to use 10 + your Dexterity modifier. Enter your own if you wear armor.">
        <Input id="c-ac" type="number" min={1} max={30} value={draft.armorClass || ""} onChange={(e) => update({ armorClass: e.target.value === "" ? 0 : Number(e.target.value) })} className="max-w-24" />
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 9. Citizenship
// ---------------------------------------------------------------------------

export function StepCitizenship({ draft, update, empires }: Props & { empires: EmpireInfo[] }) {
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">{CITIZENSHIP_TEXT}</p>
      <RadioGroup value={draft.citizenship} onValueChange={(citizenship) => update({ citizenship })} aria-label="Citizenship" className="grid gap-2">
        <div className="flex items-start gap-2 rounded-lg border border-border p-3">
          <RadioGroupItem id="cit-none" value="none" className="mt-0.5" />
          <Label htmlFor="cit-none" className="font-normal">
            <span className="font-medium">No citizenship</span>
          </Label>
        </div>
        {CITIZENSHIPS.map((c) => {
          const info = empires.find((e) => e.id === c.id);
          return (
            <div key={c.id} className="flex items-start gap-2 rounded-lg border border-border p-3">
              <RadioGroupItem id={`cit-${c.id}`} value={c.id} className="mt-0.5" />
              <Label htmlFor={`cit-${c.id}`} className="grid gap-1 font-normal">
                <span className="font-medium">{c.name}</span>
                {info?.summary && <span className="text-xs text-muted-foreground">{info.summary}</span>}
                <span className="text-xs">
                  <strong>Benefits:</strong> {info?.benefits || "the DM will add these."}
                </span>
                <span className="text-xs">
                  <strong>Weaknesses:</strong> {info?.weaknesses || "the DM will add these."}
                </span>
              </Label>
            </div>
          );
        })}
      </RadioGroup>
      <LearnMore links={empires.filter((e) => e.href).map((e) => ({ label: `${e.name} in the codex`, href: e.href as string }))} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 10. Worship
// ---------------------------------------------------------------------------

const SOMEONE_ELSE = "__other";

export function StepWorship({ draft, update, deities }: Props & { deities: string[] }) {
  const inList = deities.includes(draft.worship);
  const [other, setOther] = useState(draft.worship.trim() !== "" && !inList);
  const selectValue = other ? SOMEONE_ELSE : inList ? draft.worship : "";
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">{WORSHIP_TEXT}</p>
      {deities.length > 0 ? (
        <>
          <Field id="c-worship" label="Whom do you follow?">
            <NativeSelect
              id="c-worship"
              value={selectValue}
              onChange={(e) => {
                if (e.target.value === SOMEONE_ELSE) {
                  setOther(true);
                  update({ worship: "" });
                } else {
                  setOther(false);
                  update({ worship: e.target.value });
                }
              }}
            >
              <NativeSelectOption value="">No one (unaffiliated)</NativeSelectOption>
              {deities.map((d) => (
                <NativeSelectOption key={d} value={d}>
                  {d}
                </NativeSelectOption>
              ))}
              <NativeSelectOption value={SOMEONE_ELSE}>Someone else (write it)</NativeSelectOption>
            </NativeSelect>
          </Field>
          {other && (
            <Field id="c-worship-other" label="Name the god or power">
              <Input id="c-worship-other" value={draft.worship} maxLength={120} onChange={(e) => update({ worship: e.target.value })} />
            </Field>
          )}
        </>
      ) : (
        <Field id="c-worship-text" label="Whom do you follow? (leave blank for no one)" hint="Sign in as a player to choose from the gods your DM has shown you.">
          <Input id="c-worship-text" value={draft.worship} maxLength={120} onChange={(e) => update({ worship: e.target.value })} />
        </Field>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 11. Personality
// ---------------------------------------------------------------------------

export function StepPersonality({ draft, update }: Props) {
  const box = (id: keyof Pick<Draft, "traits" | "ideals" | "bonds" | "flaws" | "appearance" | "backstory">, label: string, rows = 3) => (
    <Field key={id} id={`c-${id}`} label={label}>
      <Textarea id={`c-${id}`} rows={rows} value={draft[id]} maxLength={CHARACTER_LIMITS.maxTextLength} onChange={(e) => update({ [id]: e.target.value } as Partial<Draft>)} />
    </Field>
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {box("traits", "Personality traits")}
      {box("ideals", "Ideals")}
      {box("bonds", "Bonds")}
      {box("flaws", "Flaws")}
      <div className="sm:col-span-2">{box("appearance", "What do they look like?")}</div>
      <div className="sm:col-span-2">{box("backstory", "Backstory", 6)}</div>
    </div>
  );
}

export { ABILITIES };
