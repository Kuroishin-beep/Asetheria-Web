"use client";

import { useState } from "react";
import { Dices, Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  abilityModifier,
  evaluateRollSequence,
  pointBuyBudget,
  pointBuyCost,
  resolveRace,
  rollSet,
  secureRng,
  type RolledSet,
  type Scores,
} from "@/lib/character/engine";
import { toInput, type Draft } from "@/lib/character/draft";
import { ABILITIES, ABILITY_NAMES, POINT_BUY, ROLLING, STANDARD_ARRAYS, type Ability } from "@/lib/character/house-rules";
import { cn } from "@/lib/utils";

type Update = (patch: Partial<Draft>) => void;

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);
const blank = (): Scores => ({ str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 });

/** The heritage bonus for each ability, so every panel can show base + bonus = final. */
function heritageBonuses(draft: Draft): Partial<Record<Ability, number>> {
  if (!draft.raceId) return {};
  return resolveRace(toInput(draft).race).bonuses;
}

/** One row per ability: the base score, any heritage bonus, and the result. */
function FinalColumn({ draft, base, ability }: { draft: Draft; base: number; ability: Ability }) {
  const bonus = heritageBonuses(draft)[ability] ?? 0;
  if (!base) return <span className="text-faint-foreground">no score yet</span>;
  const final = Math.min(20, base + bonus);
  return (
    <span className="tabular-nums" data-testid={`final-${ability}`}>
      {bonus ? `${base} ${signed(bonus)} = ` : ""}
      <strong>{final}</strong> <span className="text-muted-foreground">({signed(abilityModifier(final))})</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Point buy
// ---------------------------------------------------------------------------

export function PointBuyPanel({ draft, update }: { draft: Draft; update: Update }) {
  const rolled = draft.pbExtraRoll > 0;
  const budget = rolled ? pointBuyBudget(draft.pbExtraRoll) : 0;
  const spent = ABILITIES.reduce((sum, a) => sum + (pointBuyCost(draft.pbScores[a]) ?? 0), 0);
  const remaining = budget - spent;

  function set(a: Ability, value: number) {
    update({ pbScores: { ...draft.pbScores, [a]: value } });
  }

  return (
    <div className="grid gap-4" data-testid="point-buy">
      <div className="flex flex-wrap items-center gap-3">
        {rolled ? (
          <p className="text-sm" data-testid="pb-budget">
            Your points: {POINT_BUY.basePoints} + {POINT_BUY.bonusPoints} + bonus roll {draft.pbExtraRoll} = <strong>{budget}</strong>. Spent {spent}, <strong data-testid="pb-remaining">{remaining}</strong> left.
          </p>
        ) : (
          <>
            <Button type="button" onClick={() => update({ pbExtraRoll: secureRng(POINT_BUY.extraDie) })} data-testid="pb-roll">
              <Dices aria-hidden="true" />
              Roll your bonus die (1d{POINT_BUY.extraDie})
            </Button>
            <p className="text-sm text-muted-foreground">You roll it once; it stays with this character.</p>
          </>
        )}
      </div>

      {rolled && (
        <>
          <ul className="grid gap-2" aria-label="Ability scores">
            {ABILITIES.map((a) => {
              const score = draft.pbScores[a];
              const nextCost = pointBuyCost(score + 1);
              const canUp = score < POINT_BUY.maxScore && nextCost !== null && nextCost - (pointBuyCost(score) ?? 0) <= remaining;
              return (
                <li key={a} className="grid grid-cols-[6.5rem_auto_1fr] items-center gap-3 rounded-lg bg-muted/40 p-2 sm:grid-cols-[8rem_auto_6rem_1fr]">
                  <span className="font-medium">{ABILITY_NAMES[a]}</span>
                  <span className="flex items-center gap-1">
                    <Button type="button" variant="outline" size="icon-sm" aria-label={`Lower ${ABILITY_NAMES[a]}`} disabled={score <= POINT_BUY.minScore} onClick={() => set(a, score - 1)}>
                      <Minus aria-hidden="true" />
                    </Button>
                    <span className="w-8 text-center font-display text-lg font-bold tabular-nums" data-testid={`pb-${a}`}>
                      {score}
                    </span>
                    <Button type="button" variant="outline" size="icon-sm" aria-label={`Raise ${ABILITY_NAMES[a]}`} disabled={!canUp} onClick={() => set(a, score + 1)}>
                      <Plus aria-hidden="true" />
                    </Button>
                  </span>
                  <span className="hidden text-xs text-muted-foreground sm:block">costs {pointBuyCost(score)}</span>
                  <FinalColumn draft={draft} base={score} ability={a} />
                </li>
              );
            })}
          </ul>
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => update({ pbScores: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 } })}>
              <RotateCcw aria-hidden="true" />
              Reset to 8s
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Giving a fixed collection of values to the six abilities (rolled set or standard array)
// ---------------------------------------------------------------------------

export function AssignScores({ values, assignment, onChange, draft }: { values: readonly number[]; assignment: Scores; onChange: (s: Scores) => void; draft: Draft }) {
  const remaining = new Map<number, number>();
  for (const v of values) remaining.set(v, (remaining.get(v) ?? 0) + 1);
  for (const a of ABILITIES) {
    const used = assignment[a];
    if (used) remaining.set(used, (remaining.get(used) ?? 0) - 1);
  }
  const distinct = [...new Set(values)].sort((x, y) => y - x);

  return (
    <div className="grid gap-2" role="group" aria-label="Assign your scores">
      {ABILITIES.map((a) => (
        <div key={a} className="grid grid-cols-[6.5rem_7rem_1fr] items-center gap-3 rounded-lg bg-muted/40 p-2 sm:grid-cols-[8rem_8rem_1fr]">
          <Label htmlFor={`assign-${a}`}>{ABILITY_NAMES[a]}</Label>
          <NativeSelect id={`assign-${a}`} value={assignment[a] ? String(assignment[a]) : ""} onChange={(e) => onChange({ ...assignment, [a]: e.target.value ? Number(e.target.value) : 0 })}>
            <NativeSelectOption value="">Choose</NativeSelectOption>
            {distinct.map((v) => {
              const left = remaining.get(v) ?? 0;
              const current = assignment[a] === v;
              return (
                <NativeSelectOption key={v} value={String(v)} disabled={left <= 0 && !current}>
                  {v}
                </NativeSelectOption>
              );
            })}
          </NativeSelect>
          <FinalColumn draft={draft} base={assignment[a]} ability={a} />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rolling
// ---------------------------------------------------------------------------

function DiceLine({ set }: { set: RolledSet }) {
  return (
    <ul className="grid gap-1 text-sm" aria-label="The dice you rolled">
      {set.dice.map((four, i) => {
        const sorted = [...four].sort((x, y) => y - x);
        const dropped = sorted[sorted.length - 1];
        let skipped = false;
        return (
          <li key={i} className="flex items-center gap-2 tabular-nums">
            <span className="w-6 text-faint-foreground">#{i + 1}</span>
            <span className="flex gap-1">
              {four.map((d, j) => {
                const isDropped = !skipped && d === dropped;
                if (isDropped) skipped = true;
                return (
                  <span key={j} className={cn("inline-flex size-7 items-center justify-center rounded-md border border-border", isDropped && "text-faint-foreground line-through")} aria-label={isDropped ? `${d}, dropped` : String(d)}>
                    {d}
                  </span>
                );
              })}
            </span>
            <span>= <strong>{set.scores[i]}</strong></span>
          </li>
        );
      })}
    </ul>
  );
}

export function RollPanel({ draft, update }: { draft: Draft; update: Update }) {
  const seq = evaluateRollSequence(draft.rolls);
  const last = draft.rolls[draft.rolls.length - 1];
  const [confirming, setConfirming] = useState(false);

  function roll() {
    update({ rolls: [...draft.rolls, rollSet()], rollAssignment: blank() });
    setConfirming(false);
  }

  return (
    <div className="grid gap-4" data-testid="roll-panel">
      <div className="flex flex-wrap items-center gap-3">
        {draft.rolls.length === 0 && (
          <Button type="button" onClick={roll} data-testid="roll-first">
            <Dices aria-hidden="true" />
            Roll my six scores
          </Button>
        )}
        {draft.rolls.length > 0 && seq.mustReroll && (
          <Button type="button" onClick={roll} data-testid="roll-again">
            <Dices aria-hidden="true" />
            Reroll all six
          </Button>
        )}
        {seq.canReroll && !confirming && (
          <Button type="button" variant="outline" onClick={() => setConfirming(true)} data-testid="roll-optional">
            <Dices aria-hidden="true" />
            Reroll once more
          </Button>
        )}
        {seq.canReroll && confirming && (
          <div role="alertdialog" aria-label="Confirm the reroll" className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/50 p-3 text-sm">
            <span>You must keep the new rolls, even if they are lower. Reroll?</span>
            <Button type="button" size="sm" variant="destructive" onClick={roll} data-testid="roll-confirm">
              Yes, reroll
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(false)}>
              Keep these
            </Button>
          </div>
        )}
      </div>

      {last && (
        <>
          <DiceLine set={last} />
          <p className="text-sm" data-testid="roll-status" role="status">
            Total <strong>{last.total}</strong>.{" "}
            {seq.mustReroll
              ? `That is under ${ROLLING.minimumTotal}, so all six are rerolled.`
              : seq.canReroll
                ? `That reaches ${ROLLING.minimumTotal}. Keep it, or reroll once more.`
                : draft.rolls.length > 1
                  ? "This is your final set: you must keep it."
                  : ""}
          </p>
          {draft.rolls.length > 1 && (
            <p className="text-xs text-muted-foreground">Rolls so far: {draft.rolls.map((s) => s.total).join(", ")}</p>
          )}
        </>
      )}

      {seq.ok && seq.final && (
        <div className="grid gap-2">
          <h3 className="text-sm font-semibold">Give each rolled score to an ability</h3>
          <AssignScores values={seq.final.scores} assignment={draft.rollAssignment} onChange={(rollAssignment) => update({ rollAssignment })} draft={draft} />
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => update({ rollAssignment: Object.fromEntries(ABILITIES.map((a, i) => [a, seq.final!.scores[i]])) as Scores })}>
              Assign in the order rolled
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Standard array
// ---------------------------------------------------------------------------

export function ArrayPanel({ draft, update }: { draft: Draft; update: Update }) {
  return (
    <div className="grid gap-4" data-testid="array-panel">
      <RadioGroup value={draft.arrayIndex >= 0 ? String(draft.arrayIndex) : ""} onValueChange={(v) => update({ arrayIndex: Number(v), arrayAssignment: blank() })} aria-label="Standard arrays" className="gap-2">
        {STANDARD_ARRAYS.map((arr, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg bg-muted/40 p-2">
            <RadioGroupItem id={`array-${i}`} value={String(i)} />
            <Label htmlFor={`array-${i}`} className="font-normal tabular-nums">
              {arr.join(", ")}
            </Label>
          </div>
        ))}
      </RadioGroup>
      {draft.arrayIndex >= 0 && (
        <AssignScores values={STANDARD_ARRAYS[draft.arrayIndex]} assignment={draft.arrayAssignment} onChange={(arrayAssignment) => update({ arrayAssignment })} draft={draft} />
      )}
    </div>
  );
}
