import {
  ABILITIES,
  ABILITY_SCORE_METHODS,
  CHARACTER_LIMITS,
  CITIZENSHIPS,
  HIT_POINTS,
  POINT_BUY,
  ROLLING,
  STANDARD_ARRAYS,
  type Ability,
  type AbilityScoreMethod,
} from "@/lib/character/house-rules";
import {
  BACKGROUND_SKILL_COUNT,
  OTHER_RACE,
  SKILLS,
  findClass,
  findRace,
  pactSlots,
  proficiencyBonus,
  spellSlots,
  type Bonuses,
  type SkillId,
} from "@/lib/character/srd";

/**
 * The character rules engine: pure functions, no database, no framework.
 * The wizard uses it to guide the player, and the server uses the very same
 * code to re-check and recompute everything it is sent, so the numbers on a
 * saved sheet always follow the Asetheria house rules.
 */

export type Scores = Record<Ability, number>;
/** Returns a whole number from 1 to `sides`. */
export type Rng = (sides: number) => number;

export const abilityModifier = (score: number) => Math.floor((score - 10) / 2);
export { proficiencyBonus };

const isInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);
const emptyScores = (): Scores => ({ str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 });

/** A uniform die from the platform's secure random source (rejection sampling, so no modulo bias). */
export const secureRng: Rng = (sides) => {
  const limit = Math.floor(0x100000000 / sides) * sides;
  const buf = new Uint32Array(1);
  do {
    globalThis.crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return (buf[0] % sides) + 1;
};

// ---------------------------------------------------------------------------
// Point buy
// ---------------------------------------------------------------------------

export function pointBuyCost(score: number): number | null {
  return isInt(score) && score in POINT_BUY.costs ? POINT_BUY.costs[score] : null;
}

export const pointBuyBudget = (extraRoll: number) => POINT_BUY.basePoints + POINT_BUY.bonusPoints + extraRoll;

export type Check = { ok: boolean; problems: string[] };

export function validatePointBuy(scores: Scores, extraRoll: number): Check & { spent: number; budget: number; remaining: number } {
  const problems: string[] = [];
  if (!isInt(extraRoll) || extraRoll < 1 || extraRoll > POINT_BUY.extraDie) problems.push(`The bonus roll must be a whole number from 1 to ${POINT_BUY.extraDie}.`);
  const budget = pointBuyBudget(isInt(extraRoll) ? extraRoll : 0);
  let spent = 0;
  for (const a of ABILITIES) {
    const cost = pointBuyCost(scores[a]);
    if (cost === null) problems.push(`${a.toUpperCase()} must be a whole number from ${POINT_BUY.minScore} to ${POINT_BUY.maxScore} before bonuses.`);
    else spent += cost;
  }
  if (problems.length === 0 && spent > budget) problems.push(`That costs ${spent} points but you have ${budget}.`);
  return { ok: problems.length === 0, problems, spent, budget, remaining: budget - spent };
}

// ---------------------------------------------------------------------------
// Rolling: 4d6 drop the lowest, six times
// ---------------------------------------------------------------------------

export type RolledSet = {
  /** The four dice behind each of the six scores, in the order rolled. */
  dice: number[][];
  /** The six scores (the three highest dice of each). */
  scores: number[];
  total: number;
};

export function scoreFromDice(dice: number[]): number {
  return [...dice].sort((a, b) => b - a).slice(0, ROLLING.dice - 1).reduce((s, d) => s + d, 0);
}

export function rollSet(rng: Rng = secureRng): RolledSet {
  const dice = Array.from({ length: ABILITIES.length }, () => Array.from({ length: ROLLING.dice }, () => rng(ROLLING.sides)));
  const scores = dice.map(scoreFromDice);
  return { dice, scores, total: scores.reduce((s, n) => s + n, 0) };
}

export function validateRolledSet(set: RolledSet): Check {
  const problems: string[] = [];
  if (!Array.isArray(set?.dice) || set.dice.length !== ABILITIES.length) return { ok: false, problems: ["A roll has six scores."] };
  const scores: number[] = [];
  for (const four of set.dice) {
    if (!Array.isArray(four) || four.length !== ROLLING.dice || four.some((d) => !isInt(d) || d < 1 || d > ROLLING.sides)) {
      problems.push(`Each score is ${ROLLING.dice} dice of 1 to ${ROLLING.sides}.`);
      break;
    }
    scores.push(scoreFromDice(four));
  }
  if (problems.length === 0) {
    if (set.scores?.length !== scores.length || set.scores.some((s, i) => s !== scores[i])) problems.push("The scores do not match the dice.");
    if (set.total !== scores.reduce((s, n) => s + n, 0)) problems.push("The total does not match the scores.");
  }
  return { ok: problems.length === 0, problems };
}

export type RollSequence = Check & {
  /** The set the character uses, when the sequence is complete. */
  final: RolledSet | null;
  /** True while the latest set is under the minimum: the player has no choice but to reroll all six. */
  mustReroll: boolean;
  /** True when the player may still take the one optional reroll. */
  canReroll: boolean;
};

/**
 * Applies the house rule to a history of rolls:
 *  - a set under the minimum total is thrown away and all six are rerolled;
 *  - the first set at or above the minimum may be kept, or rerolled once;
 *  - that one extra reroll is binding, even when it totals less.
 */
export function evaluateRollSequence(sets: RolledSet[]): RollSequence {
  const fail = (problem: string): RollSequence => ({ ok: false, problems: [problem], final: null, mustReroll: false, canReroll: false });
  if (!Array.isArray(sets) || sets.length === 0) return { ok: false, problems: ["Roll your scores first."], final: null, mustReroll: true, canReroll: false };
  for (const set of sets) {
    const valid = validateRolledSet(set);
    if (!valid.ok) return fail(valid.problems[0]);
  }
  const first = sets.findIndex((s) => s.total >= ROLLING.minimumTotal);
  if (first === -1) return { ok: false, problems: [`Your scores add up to ${sets[sets.length - 1].total}; you need ${ROLLING.minimumTotal} or more. Reroll all six.`], final: null, mustReroll: true, canReroll: false };
  const after = sets.length - 1 - first;
  if (after === 0) return { ok: true, problems: [], final: sets[first], mustReroll: false, canReroll: true };
  if (after === ROLLING.optionalRerolls) return { ok: true, problems: [], final: sets[sets.length - 1], mustReroll: false, canReroll: false };
  return fail(`Only ${ROLLING.optionalRerolls} extra reroll is allowed once you reach ${ROLLING.minimumTotal}.`);
}

// ---------------------------------------------------------------------------
// Assigning a fixed collection of values (a rolled set or a standard array) to the abilities
// ---------------------------------------------------------------------------

const sortedDesc = (values: readonly number[]) => [...values].sort((a, b) => b - a);

/** True when the six assigned scores use exactly the given values, each once. */
export function usesExactly(assignment: Scores, values: readonly number[]): boolean {
  const assigned = ABILITIES.map((a) => assignment[a]);
  const want = sortedDesc(values);
  const got = sortedDesc(assigned);
  return want.length === got.length && want.every((v, i) => v === got[i]);
}

export function validateStandardArray(index: number, assignment: Scores): Check {
  const array = STANDARD_ARRAYS[index];
  if (!array) return { ok: false, problems: ["Choose one of the three standard arrays."] };
  return usesExactly(assignment, array) ? { ok: true, problems: [] } : { ok: false, problems: ["Use each value of the array once."] };
}

// ---------------------------------------------------------------------------
// Heritage bonuses
// ---------------------------------------------------------------------------

export type RaceChoice = {
  raceId: string;
  /** Half-Elf: the two abilities that get +1. */
  chosenBonuses?: Ability[];
  /** "Other": hand-entered. */
  other?: { name: string; bonuses: Bonuses; speed: number };
};

export function resolveRace(choice: RaceChoice): { problems: string[]; bonuses: Bonuses; speed: number; size: string; name: string } {
  const problems: string[] = [];
  if (choice.raceId === OTHER_RACE.id) {
    const other = choice.other;
    if (!other || !other.name?.trim()) return { problems: ["Describe your heritage."], bonuses: {}, speed: 30, size: "Medium", name: "" };
    let total = 0;
    for (const a of ABILITIES) {
      const v = other.bonuses?.[a] ?? 0;
      if (!isInt(v) || v < 0 || v > OTHER_RACE.maxBonusEach) problems.push(`A bonus is 0 to ${OTHER_RACE.maxBonusEach}.`);
      else total += v;
    }
    if (total > OTHER_RACE.maxBonusTotal) problems.push(`Heritage bonuses add up to at most ${OTHER_RACE.maxBonusTotal}.`);
    if (!isInt(other.speed) || other.speed < OTHER_RACE.minSpeed || other.speed > OTHER_RACE.maxSpeed) problems.push(`Speed is ${OTHER_RACE.minSpeed} to ${OTHER_RACE.maxSpeed} feet.`);
    return { problems, bonuses: other.bonuses ?? {}, speed: other.speed, size: "Medium", name: other.name.trim() };
  }
  const race = findRace(choice.raceId);
  if (!race) return { problems: ["Choose a heritage."], bonuses: {}, speed: 30, size: "Medium", name: "" };
  const bonuses: Bonuses = { ...race.bonuses };
  if (race.choiceBonuses) {
    const picks = choice.chosenBonuses ?? [];
    const valid =
      picks.length === race.choiceBonuses.count &&
      new Set(picks).size === picks.length &&
      picks.every((a) => (ABILITIES as readonly string[]).includes(a) && !race.choiceBonuses!.exclude.includes(a));
    if (!valid) problems.push(`Choose ${race.choiceBonuses.count} different abilities for +${race.choiceBonuses.amount} (not ${race.choiceBonuses.exclude.map((a) => a.toUpperCase()).join(", ")}).`);
    else for (const a of picks) bonuses[a] = (bonuses[a] ?? 0) + race.choiceBonuses.amount;
  } else if (choice.chosenBonuses?.length) {
    problems.push("That heritage has no bonuses to choose.");
  }
  return { problems, bonuses, speed: race.speed, size: race.size, name: race.name };
}

export function applyBonuses(base: Scores, bonuses: Bonuses): Scores {
  const out = emptyScores();
  for (const a of ABILITIES) out[a] = Math.min(CHARACTER_LIMITS.maxScore, base[a] + (bonuses[a] ?? 0));
  return out;
}

// ---------------------------------------------------------------------------
// Hit points
// ---------------------------------------------------------------------------

/** One level's roll: the first roll, and the reroll if the first was a 1 and the player took it. */
export type LevelRoll = { first: number; reroll?: number };

export const rolledLevelsNeeded = (level: number) => Math.max(0, level - HIT_POINTS.maxedThroughLevel);

/** The value that counts for a level: the reroll when a 1 was rerolled, otherwise the first roll. */
export const levelRollValue = (r: LevelRoll) => (r.first === HIT_POINTS.rerollOn && r.reroll !== undefined ? r.reroll : r.first);

export function rollLevel(hitDie: number, rng: Rng = secureRng): LevelRoll {
  return { first: rng(hitDie) };
}

export function rerollLevel(roll: LevelRoll, hitDie: number, rng: Rng = secureRng): LevelRoll {
  if (roll.first !== HIT_POINTS.rerollOn || roll.reroll !== undefined) return roll;
  return { first: roll.first, reroll: rng(hitDie) };
}

export function computeHitPoints(input: { hitDie: number; level: number; conMod: number; levelRolls: LevelRoll[] }): Check & { total: number; perLevel: number[] } {
  const { hitDie, level, conMod, levelRolls } = input;
  const problems: string[] = [];
  const perLevel: number[] = [];
  const needed = rolledLevelsNeeded(level);
  if (levelRolls.length !== needed) problems.push(`Levels ${HIT_POINTS.maxedThroughLevel + 1} and up need ${needed} rolls; there are ${levelRolls.length}.`);

  for (let l = 1; l <= level; l++) {
    if (l <= HIT_POINTS.maxedThroughLevel) {
      perLevel.push(Math.max(1, hitDie + conMod));
      continue;
    }
    const r = levelRolls[l - HIT_POINTS.maxedThroughLevel - 1];
    if (!r) break;
    if (!isInt(r.first) || r.first < 1 || r.first > hitDie) {
      problems.push(`Level ${l}: roll a d${hitDie}.`);
      continue;
    }
    if (r.reroll !== undefined) {
      if (r.first !== HIT_POINTS.rerollOn) problems.push(`Level ${l}: only a ${HIT_POINTS.rerollOn} may be rerolled.`);
      else if (!isInt(r.reroll) || r.reroll < 1 || r.reroll > hitDie) problems.push(`Level ${l}: the reroll is a d${hitDie}.`);
    }
    perLevel.push(Math.max(1, levelRollValue(r) + conMod));
  }
  return { ok: problems.length === 0, problems, total: perLevel.reduce((s, n) => s + n, 0), perLevel };
}

// ---------------------------------------------------------------------------
// The character, validated and turned into a sheet
// ---------------------------------------------------------------------------

export type CharacterInput = {
  schemaVersion: 1;
  name: string;
  playerName: string;
  concept: string;
  race: RaceChoice;
  classId: string;
  level: number;
  backgroundName: string;
  backgroundSkills: SkillId[];
  classSkills: SkillId[];
  method: AbilityScoreMethod;
  /** Point buy: the bonus d4 and the base scores. */
  pointBuy?: { extraRoll: number; scores: Scores };
  /** Rolling: every set rolled in order, and how the final set was assigned. */
  roll?: { sets: RolledSet[]; assignment: Scores };
  array?: { index: number; assignment: Scores };
  hp: { mode: "rolled"; levelRolls: LevelRoll[] } | { mode: "manual"; total: number };
  armorClass?: number;
  equipment: string;
  citizenship: string;
  worship: string;
  traits: string;
  ideals: string;
  bonds: string;
  flaws: string;
  appearance: string;
  backstory: string;
};

export type SkillLine = { id: SkillId; name: string; ability: Ability; proficient: boolean; bonus: number };

export type Sheet = {
  name: string;
  playerName: string;
  heritage: string;
  className: string;
  level: number;
  background: string;
  baseScores: Scores;
  scores: Scores;
  modifiers: Scores;
  proficiencyBonus: number;
  saves: { ability: Ability; proficient: boolean; bonus: number }[];
  skills: SkillLine[];
  passivePerception: number;
  armorClass: number;
  initiative: number;
  speed: number;
  size: string;
  hitPoints: number;
  hitDice: string;
  spellcasting: null | { ability: Ability; saveDc: number; attackBonus: number; slots: number[]; pact?: { slots: number; slotLevel: number } };
};

const signed = (n: number) => n;
const TEXT_FIELDS = ["concept", "equipment", "traits", "ideals", "bonds", "flaws", "appearance", "backstory", "worship", "backgroundName"] as const;

/** Finds the base scores a character's chosen method produced, or the reasons it is not allowed. */
export function resolveBaseScores(c: CharacterInput): { problems: string[]; scores: Scores } {
  const none = { problems: [] as string[], scores: emptyScores() };
  if (!ABILITY_SCORE_METHODS.includes(c.method)) return { ...none, problems: ["Choose how to set your ability scores."] };
  if (c.method === "point-buy") {
    if (!c.pointBuy) return { ...none, problems: ["Spend your points."] };
    const check = validatePointBuy(c.pointBuy.scores, c.pointBuy.extraRoll);
    return { problems: check.problems, scores: { ...c.pointBuy.scores } };
  }
  if (c.method === "roll") {
    if (!c.roll) return { ...none, problems: ["Roll your scores."] };
    const seq = evaluateRollSequence(c.roll.sets);
    if (!seq.ok || !seq.final) return { ...none, problems: seq.problems };
    return usesExactly(c.roll.assignment, seq.final.scores)
      ? { problems: [], scores: { ...c.roll.assignment } }
      : { ...none, problems: ["Assign each rolled score to one ability."] };
  }
  if (!c.array) return { ...none, problems: ["Choose a standard array."] };
  const check = validateStandardArray(c.array.index, c.array.assignment);
  return { problems: check.problems, scores: { ...c.array.assignment } };
}

/**
 * Checks a whole character against the house rules and the SRD tables and, if
 * it passes, returns the derived sheet. The same call runs in the browser and
 * on the server, and the server stores its own result, never the client's.
 */
export function validateAndDerive(c: CharacterInput): { ok: boolean; problems: string[]; sheet: Sheet | null } {
  const problems: string[] = [];
  const add = (p: string[] | string) => problems.push(...(Array.isArray(p) ? p : [p]));

  if (c.schemaVersion !== 1) add("This character was made with a different version of the creator.");
  if (typeof c.name !== "string" || !c.name.trim() || c.name.length > 80) add("Give your character a name (up to 80 characters).");
  if (typeof c.playerName !== "string" || c.playerName.length > 80) add("The player name is up to 80 characters.");
  for (const f of TEXT_FIELDS) if (typeof c[f] !== "string" || c[f].length > CHARACTER_LIMITS.maxTextLength) add(`"${f}" is too long.`);

  if (!isInt(c.level) || c.level < CHARACTER_LIMITS.minLevel || c.level > CHARACTER_LIMITS.maxLevel) add(`Level is ${CHARACTER_LIMITS.minLevel} to ${CHARACTER_LIMITS.maxLevel}.`);
  const klass = findClass(c.classId);
  if (!klass) add("Choose a class.");
  const race = resolveRace(c.race);
  add(race.problems);

  const base = resolveBaseScores(c);
  add(base.problems);

  // Skills: class picks, then two background picks, none repeated.
  if (klass) {
    const options = klass.skillOptions === "any" ? SKILLS.map((s) => s.id as SkillId) : klass.skillOptions;
    if (!Array.isArray(c.classSkills) || c.classSkills.length !== klass.skillChoices || new Set(c.classSkills).size !== c.classSkills.length) add(`Choose ${klass.skillChoices} different class skills.`);
    else if (c.classSkills.some((s) => !options.includes(s))) add("A class skill is not on your class list.");
  }
  if (!Array.isArray(c.backgroundSkills) || c.backgroundSkills.length !== BACKGROUND_SKILL_COUNT || new Set(c.backgroundSkills).size !== BACKGROUND_SKILL_COUNT || c.backgroundSkills.some((s) => !SKILLS.some((k) => k.id === s))) {
    add(`Choose ${BACKGROUND_SKILL_COUNT} different background skills.`);
  } else if (Array.isArray(c.classSkills) && c.backgroundSkills.some((s) => c.classSkills.includes(s))) {
    add("A background skill repeats a class skill; pick a different one.");
  }

  if (!["none", ...CITIZENSHIPS.map((x) => x.id)].includes(c.citizenship)) add("Choose a citizenship from the three empires, or none.");

  if (problems.length > 0 || !klass) return { ok: false, problems, sheet: null };

  const scores = applyBonuses(base.scores, race.bonuses);
  const modifiers = emptyScores();
  for (const a of ABILITIES) modifiers[a] = abilityModifier(scores[a]);
  const prof = proficiencyBonus(c.level);

  let hitPoints: number;
  if (c.hp.mode === "rolled") {
    const hp = computeHitPoints({ hitDie: klass.hitDie, level: c.level, conMod: modifiers.con, levelRolls: c.hp.levelRolls });
    if (!hp.ok) return { ok: false, problems: hp.problems, sheet: null };
    hitPoints = hp.total;
  } else {
    const ceiling = c.level * (klass.hitDie + Math.max(0, modifiers.con));
    if (!isInt(c.hp.total) || c.hp.total < 1 || c.hp.total > ceiling) return { ok: false, problems: [`Hit points are 1 to ${ceiling} for this class and level.`], sheet: null };
    hitPoints = c.hp.total;
  }

  const ac = c.armorClass ?? 10 + modifiers.dex;
  if (!isInt(ac) || ac < 1 || ac > 30) return { ok: false, problems: ["Armor Class is 1 to 30."], sheet: null };

  const proficient = new Set<SkillId>([...c.classSkills, ...c.backgroundSkills]);
  const skills: SkillLine[] = SKILLS.map((s) => ({
    id: s.id,
    name: s.name,
    ability: s.ability,
    proficient: proficient.has(s.id),
    bonus: signed(modifiers[s.ability] + (proficient.has(s.id) ? prof : 0)),
  }));
  const perception = skills.find((s) => s.id === "perception")!;

  let spellcasting: Sheet["spellcasting"] = null;
  if (klass.spellcasting.kind !== "none" && klass.spellcasting.ability) {
    const ability = klass.spellcasting.ability;
    spellcasting = {
      ability,
      saveDc: 8 + prof + modifiers[ability],
      attackBonus: prof + modifiers[ability],
      slots: spellSlots(klass.spellcasting.kind, c.level),
      ...(klass.spellcasting.kind === "pact" ? { pact: pactSlots(c.level) } : {}),
    };
  }

  const sheet: Sheet = {
    name: c.name.trim(),
    playerName: c.playerName.trim(),
    heritage: race.name,
    className: klass.name,
    level: c.level,
    background: c.backgroundName.trim(),
    baseScores: base.scores,
    scores,
    modifiers,
    proficiencyBonus: prof,
    saves: ABILITIES.map((a) => ({ ability: a, proficient: klass.saves.includes(a), bonus: modifiers[a] + (klass.saves.includes(a) ? prof : 0) })),
    skills,
    passivePerception: 10 + perception.bonus,
    armorClass: ac,
    initiative: modifiers.dex,
    speed: race.speed,
    size: race.size,
    hitPoints,
    hitDice: `${c.level}d${klass.hitDie}`,
    spellcasting,
  };
  return { ok: true, problems: [], sheet };
}
