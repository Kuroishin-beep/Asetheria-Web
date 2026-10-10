import { z } from "zod";
import {
  abilityModifier,
  computeHitPoints,
  evaluateRollSequence,
  resolveRace,
  validatePointBuy,
  validateStandardArray,
  usesExactly,
  type CharacterInput,
  type LevelRoll,
  type RolledSet,
  type Scores,
} from "@/lib/character/engine";
import { ABILITIES, ABILITY_SCORE_METHODS, CHARACTER_LIMITS, CITIZENSHIPS, type Ability, type AbilityScoreMethod } from "@/lib/character/house-rules";
import { BACKGROUND_SKILL_COUNT, OTHER_RACE, SKILL_IDS, findClass, type Bonuses, type SkillId } from "@/lib/character/srd";

/**
 * The wizard's working copy of a character: everything the player has answered
 * so far, in a shape that is easy to edit one question at a time. It is turned
 * into the engine's `CharacterInput` only for checking and saving, and the
 * same engine decides what is allowed, so the wizard can never accept a
 * character the server would refuse.
 */

export const STEPS = [
  { id: "who", title: "Who is this?" },
  { id: "heritage", title: "Heritage" },
  { id: "class", title: "Class and level" },
  { id: "background", title: "Background" },
  { id: "scores", title: "Ability scores" },
  { id: "skills", title: "Skills" },
  { id: "hp", title: "Hit points" },
  { id: "equipment", title: "Equipment" },
  { id: "citizenship", title: "Citizenship" },
  { id: "worship", title: "Worship" },
  { id: "personality", title: "Personality" },
  { id: "review", title: "Review your sheet" },
] as const;
export type StepId = (typeof STEPS)[number]["id"];

const zeroScores = (): Scores => ({ str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 });
const blankAssignment = (): Scores => ({ str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 });

export type Draft = {
  step: number;
  name: string;
  playerName: string;
  concept: string;
  raceId: string;
  chosenBonuses: Ability[];
  otherName: string;
  otherBonuses: Bonuses;
  otherSpeed: number;
  classId: string;
  level: number;
  backgroundName: string;
  backgroundSkills: SkillId[];
  classSkills: SkillId[];
  method: AbilityScoreMethod | "";
  /** 0 until the bonus die has been rolled; then fixed for this character (a refresh does not reroll it). */
  pbExtraRoll: number;
  pbScores: Scores;
  rolls: RolledSet[];
  rollAssignment: Scores;
  arrayIndex: number;
  arrayAssignment: Scores;
  hpMode: "rolled" | "manual";
  levelRolls: LevelRoll[];
  manualHp: number;
  /** 0 means "10 + Dexterity modifier"; any other value is an armor class the player entered. */
  armorClass: number;
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

export function emptyDraft(): Draft {
  return {
    step: 0,
    name: "",
    playerName: "",
    concept: "",
    raceId: "",
    chosenBonuses: [],
    otherName: "",
    otherBonuses: {},
    otherSpeed: 30,
    classId: "",
    level: 1,
    backgroundName: "",
    backgroundSkills: [],
    classSkills: [],
    method: "",
    pbExtraRoll: 0,
    pbScores: zeroScores(),
    rolls: [],
    rollAssignment: blankAssignment(),
    arrayIndex: -1,
    arrayAssignment: blankAssignment(),
    hpMode: "rolled",
    levelRolls: [],
    manualHp: 0,
    armorClass: 0,
    equipment: "",
    citizenship: "none",
    worship: "",
    traits: "",
    ideals: "",
    bonds: "",
    flaws: "",
    appearance: "",
    backstory: "",
  };
}

// ---------------------------------------------------------------------------
// Draft <-> character
// ---------------------------------------------------------------------------

export function toInput(d: Draft): CharacterInput {
  const base: CharacterInput = {
    schemaVersion: 1,
    name: d.name,
    playerName: d.playerName,
    concept: d.concept,
    race:
      d.raceId === OTHER_RACE.id
        ? { raceId: d.raceId, other: { name: d.otherName, bonuses: d.otherBonuses, speed: d.otherSpeed } }
        : { raceId: d.raceId, ...(d.chosenBonuses.length ? { chosenBonuses: d.chosenBonuses } : {}) },
    classId: d.classId,
    level: d.level,
    backgroundName: d.backgroundName,
    backgroundSkills: d.backgroundSkills,
    classSkills: d.classSkills,
    method: (d.method || "point-buy") as AbilityScoreMethod,
    hp: d.hpMode === "manual" ? { mode: "manual", total: d.manualHp } : { mode: "rolled", levelRolls: d.levelRolls },
    ...(d.armorClass > 0 ? { armorClass: d.armorClass } : {}),
    equipment: d.equipment,
    citizenship: d.citizenship,
    worship: d.worship,
    traits: d.traits,
    ideals: d.ideals,
    bonds: d.bonds,
    flaws: d.flaws,
    appearance: d.appearance,
    backstory: d.backstory,
  };
  if (d.method === "point-buy") base.pointBuy = { extraRoll: d.pbExtraRoll, scores: d.pbScores };
  if (d.method === "roll") base.roll = { sets: d.rolls, assignment: d.rollAssignment };
  if (d.method === "standard-array") base.array = { index: d.arrayIndex, assignment: d.arrayAssignment };
  return base;
}

/** Turns a saved character back into a draft, positioned at the review step. */
export function fromInput(c: CharacterInput): Draft {
  const d = emptyDraft();
  d.step = STEPS.length - 1;
  d.name = c.name;
  d.playerName = c.playerName;
  d.concept = c.concept;
  d.raceId = c.race.raceId;
  d.chosenBonuses = c.race.chosenBonuses ?? [];
  if (c.race.other) {
    d.otherName = c.race.other.name;
    d.otherBonuses = c.race.other.bonuses;
    d.otherSpeed = c.race.other.speed;
  }
  d.classId = c.classId;
  d.level = c.level;
  d.backgroundName = c.backgroundName;
  d.backgroundSkills = c.backgroundSkills;
  d.classSkills = c.classSkills;
  d.method = c.method;
  if (c.pointBuy) {
    d.pbExtraRoll = c.pointBuy.extraRoll;
    d.pbScores = c.pointBuy.scores;
  }
  if (c.roll) {
    d.rolls = c.roll.sets;
    d.rollAssignment = c.roll.assignment;
  }
  if (c.array) {
    d.arrayIndex = c.array.index;
    d.arrayAssignment = c.array.assignment;
  }
  if (c.hp.mode === "manual") {
    d.hpMode = "manual";
    d.manualHp = c.hp.total;
  } else {
    d.hpMode = "rolled";
    d.levelRolls = c.hp.levelRolls;
  }
  d.armorClass = c.armorClass ?? 0;
  d.equipment = c.equipment;
  d.citizenship = c.citizenship;
  d.worship = c.worship;
  d.traits = c.traits;
  d.ideals = c.ideals;
  d.bonds = c.bonds;
  d.flaws = c.flaws;
  d.appearance = c.appearance;
  d.backstory = c.backstory;
  return d;
}

// ---------------------------------------------------------------------------
// Per-step validation (friendly messages; the engine's own checks do the work)
// ---------------------------------------------------------------------------

export function stepProblems(d: Draft, step: StepId): string[] {
  switch (step) {
    case "who":
      return d.name.trim() ? (d.name.length > 80 ? ["A name is up to 80 characters."] : []) : ["Give your character a name."];
    case "heritage": {
      if (!d.raceId) return ["Choose a heritage."];
      return resolveRace(toInput(d).race).problems;
    }
    case "class": {
      const out: string[] = [];
      if (!findClass(d.classId)) out.push("Choose a class.");
      if (!Number.isInteger(d.level) || d.level < CHARACTER_LIMITS.minLevel || d.level > CHARACTER_LIMITS.maxLevel) out.push(`Level is ${CHARACTER_LIMITS.minLevel} to ${CHARACTER_LIMITS.maxLevel}.`);
      return out;
    }
    case "background":
      return d.backgroundName.trim() ? [] : ["Choose or name your background."];
    case "scores": {
      if (!d.method) return ["Choose how to set your ability scores."];
      if (d.method === "point-buy") {
        if (d.pbExtraRoll < 1) return ["Roll your bonus die first."];
        return validatePointBuy(d.pbScores, d.pbExtraRoll).problems;
      }
      if (d.method === "roll") {
        const seq = evaluateRollSequence(d.rolls);
        if (!seq.ok || !seq.final) return seq.problems;
        return usesExactly(d.rollAssignment, seq.final.scores) ? [] : ["Give each rolled score to one ability."];
      }
      if (d.arrayIndex < 0) return ["Choose a standard array."];
      return validateStandardArray(d.arrayIndex, d.arrayAssignment).problems;
    }
    case "skills": {
      const klass = findClass(d.classId);
      const out: string[] = [];
      if (klass) {
        if (d.classSkills.length !== klass.skillChoices) out.push(`Choose ${klass.skillChoices} class skills (you have ${d.classSkills.length}).`);
        const options = klass.skillOptions === "any" ? SKILL_IDS : klass.skillOptions;
        if (d.classSkills.some((s) => !options.includes(s))) out.push("A chosen skill is not on your class list.");
      }
      if (d.backgroundSkills.length !== BACKGROUND_SKILL_COUNT) out.push(`Choose ${BACKGROUND_SKILL_COUNT} background skills (you have ${d.backgroundSkills.length}).`);
      if (d.backgroundSkills.some((s) => d.classSkills.includes(s))) out.push("A background skill repeats a class skill. Pick a different one.");
      return out;
    }
    case "hp": {
      const klass = findClass(d.classId);
      if (!klass) return ["Choose a class first."];
      const con = abilityModifier(finalConScore(d));
      if (d.hpMode === "manual") {
        const ceiling = d.level * (klass.hitDie + Math.max(0, con));
        return Number.isInteger(d.manualHp) && d.manualHp >= 1 && d.manualHp <= ceiling ? [] : [`Hit points are 1 to ${ceiling}.`];
      }
      return computeHitPoints({ hitDie: klass.hitDie, level: d.level, conMod: con, levelRolls: d.levelRolls }).problems;
    }
    case "citizenship":
      return ["none", ...CITIZENSHIPS.map((c) => c.id)].includes(d.citizenship) ? [] : ["Choose one of the three empires, or none."];
    case "equipment":
      return d.armorClass === 0 || (Number.isInteger(d.armorClass) && d.armorClass >= 1 && d.armorClass <= 30) ? [] : ["Armor Class is 1 to 30, or leave it blank to use 10 + Dexterity."];
    case "worship":
    case "personality":
      return [];
    case "review":
      return [];
  }
}

/** The Constitution score the character will have, so hit points can be worked out before the review. */
export function finalConScore(d: Draft): number {
  const base = d.method === "point-buy" ? d.pbScores.con : d.method === "roll" ? d.rollAssignment.con : d.method === "standard-array" ? d.arrayAssignment.con : 10;
  if (!d.raceId) return base || 10;
  const race = resolveRace(toInput(d).race);
  return Math.min(CHARACTER_LIMITS.maxScore, (base || 10) + (race.bonuses.con ?? 0));
}

export const isStepComplete = (d: Draft, step: StepId) => stepProblems(d, step).length === 0;

/** The furthest step the player may open: every step before it must already be valid. */
export function furthestStep(d: Draft): number {
  for (let i = 0; i < STEPS.length - 1; i++) if (!isStepComplete(d, STEPS[i].id)) return i;
  return STEPS.length - 1;
}

// ---------------------------------------------------------------------------
// Reading a stored draft safely
// ---------------------------------------------------------------------------

const scoresSchema = z.object({ str: z.number(), dex: z.number(), con: z.number(), int: z.number(), wis: z.number(), cha: z.number() });
const rolledSetSchema = z.object({ dice: z.array(z.array(z.number())), scores: z.array(z.number()), total: z.number() });
const draftSchema = z
  .object({
    step: z.number().int().min(0).max(STEPS.length - 1),
    name: z.string().max(200),
    playerName: z.string().max(200),
    concept: z.string().max(CHARACTER_LIMITS.maxTextLength),
    raceId: z.string().max(40),
    chosenBonuses: z.array(z.enum(ABILITIES)).max(6),
    otherName: z.string().max(200),
    otherBonuses: z.record(z.enum(ABILITIES), z.number()),
    otherSpeed: z.number(),
    classId: z.string().max(40),
    level: z.number(),
    backgroundName: z.string().max(200),
    backgroundSkills: z.array(z.enum(SKILL_IDS as unknown as [string, ...string[]])).max(8),
    classSkills: z.array(z.enum(SKILL_IDS as unknown as [string, ...string[]])).max(8),
    method: z.union([z.enum(ABILITY_SCORE_METHODS), z.literal("")]),
    pbExtraRoll: z.number(),
    pbScores: scoresSchema,
    rolls: z.array(rolledSetSchema).max(60),
    rollAssignment: scoresSchema,
    arrayIndex: z.number(),
    arrayAssignment: scoresSchema,
    hpMode: z.enum(["rolled", "manual"]),
    levelRolls: z.array(z.object({ first: z.number(), reroll: z.number().optional() })).max(CHARACTER_LIMITS.maxLevel),
    manualHp: z.number(),
    armorClass: z.number(),
    equipment: z.string().max(CHARACTER_LIMITS.maxTextLength),
    citizenship: z.string().max(40),
    worship: z.string().max(200),
    traits: z.string().max(CHARACTER_LIMITS.maxTextLength),
    ideals: z.string().max(CHARACTER_LIMITS.maxTextLength),
    bonds: z.string().max(CHARACTER_LIMITS.maxTextLength),
    flaws: z.string().max(CHARACTER_LIMITS.maxTextLength),
    appearance: z.string().max(CHARACTER_LIMITS.maxTextLength),
    backstory: z.string().max(CHARACTER_LIMITS.maxTextLength),
  })
  .strict();

/**
 * Reads whatever is in storage. Anything that is not exactly a draft (corrupt
 * JSON, an older shape, something another script wrote) is ignored and the
 * wizard starts clean; storage is never trusted.
 */
export function loadDraft(raw: string | null | undefined): Draft {
  if (!raw) return emptyDraft();
  try {
    const parsed = draftSchema.safeParse(JSON.parse(raw));
    return parsed.success ? (parsed.data as unknown as Draft) : emptyDraft();
  } catch {
    return emptyDraft();
  }
}

