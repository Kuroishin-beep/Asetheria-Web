import type { Ability } from "@/lib/character/house-rules";

/**
 * Rules facts from the System Reference Document 5.1 (CC BY 4.0): hit dice,
 * saving-throw proficiencies, skill lists, ability bonuses, speeds and the
 * spell-slot tables. Names and numbers only. Descriptions and class features
 * are not copied: the wizard links to Wikidot for those.
 */

export const SKILLS = [
  { id: "acrobatics", name: "Acrobatics", ability: "dex" },
  { id: "animal-handling", name: "Animal Handling", ability: "wis" },
  { id: "arcana", name: "Arcana", ability: "int" },
  { id: "athletics", name: "Athletics", ability: "str" },
  { id: "deception", name: "Deception", ability: "cha" },
  { id: "history", name: "History", ability: "int" },
  { id: "insight", name: "Insight", ability: "wis" },
  { id: "intimidation", name: "Intimidation", ability: "cha" },
  { id: "investigation", name: "Investigation", ability: "int" },
  { id: "medicine", name: "Medicine", ability: "wis" },
  { id: "nature", name: "Nature", ability: "int" },
  { id: "perception", name: "Perception", ability: "wis" },
  { id: "performance", name: "Performance", ability: "cha" },
  { id: "persuasion", name: "Persuasion", ability: "cha" },
  { id: "religion", name: "Religion", ability: "int" },
  { id: "sleight-of-hand", name: "Sleight of Hand", ability: "dex" },
  { id: "stealth", name: "Stealth", ability: "dex" },
  { id: "survival", name: "Survival", ability: "wis" },
] as const satisfies readonly { id: string; name: string; ability: Ability }[];
export type SkillId = (typeof SKILLS)[number]["id"];
export const SKILL_IDS: readonly SkillId[] = SKILLS.map((s) => s.id);

export type Bonuses = Partial<Record<Ability, number>>;

export type RaceDef = {
  id: string;
  name: string;
  bonuses: Bonuses;
  /** Extra +1s the player places on abilities of their choice (Half-Elf: two, other than Charisma). */
  choiceBonuses?: { count: number; amount: number; exclude: Ability[] };
  speed: number;
  size: "Small" | "Medium";
};

export const RACES: readonly RaceDef[] = [
  { id: "dragonborn", name: "Dragonborn", bonuses: { str: 2, cha: 1 }, speed: 30, size: "Medium" },
  { id: "hill-dwarf", name: "Hill Dwarf", bonuses: { con: 2, wis: 1 }, speed: 25, size: "Medium" },
  { id: "high-elf", name: "High Elf", bonuses: { dex: 2, int: 1 }, speed: 30, size: "Medium" },
  { id: "rock-gnome", name: "Rock Gnome", bonuses: { int: 2, con: 1 }, speed: 25, size: "Small" },
  { id: "half-elf", name: "Half-Elf", bonuses: { cha: 2 }, choiceBonuses: { count: 2, amount: 1, exclude: ["cha"] }, speed: 30, size: "Medium" },
  { id: "half-orc", name: "Half-Orc", bonuses: { str: 2, con: 1 }, speed: 30, size: "Medium" },
  { id: "lightfoot-halfling", name: "Lightfoot Halfling", bonuses: { dex: 2, cha: 1 }, speed: 25, size: "Small" },
  { id: "human", name: "Human", bonuses: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 }, speed: 30, size: "Medium" },
  { id: "tiefling", name: "Tiefling", bonuses: { int: 1, cha: 2 }, speed: 30, size: "Medium" },
];

/** "Other": a homebrew or non-SRD heritage. Bonuses and speed are entered by hand within these limits. */
export const OTHER_RACE = { id: "other", name: "Other (describe it)", maxBonusEach: 2, maxBonusTotal: 3, minSpeed: 10, maxSpeed: 60 } as const;

export type SpellcastingKind = "full" | "half" | "pact" | "none";

export type ClassDef = {
  id: string;
  name: string;
  hitDie: 6 | 8 | 10 | 12;
  saves: readonly [Ability, Ability];
  skillChoices: number;
  skillOptions: readonly SkillId[] | "any";
  spellcasting: { kind: SpellcastingKind; ability?: Ability };
};

export const CLASSES: readonly ClassDef[] = [
  { id: "barbarian", name: "Barbarian", hitDie: 12, saves: ["str", "con"], skillChoices: 2, skillOptions: ["animal-handling", "athletics", "intimidation", "nature", "perception", "survival"], spellcasting: { kind: "none" } },
  { id: "bard", name: "Bard", hitDie: 8, saves: ["dex", "cha"], skillChoices: 3, skillOptions: "any", spellcasting: { kind: "full", ability: "cha" } },
  { id: "cleric", name: "Cleric", hitDie: 8, saves: ["wis", "cha"], skillChoices: 2, skillOptions: ["history", "insight", "medicine", "persuasion", "religion"], spellcasting: { kind: "full", ability: "wis" } },
  { id: "druid", name: "Druid", hitDie: 8, saves: ["int", "wis"], skillChoices: 2, skillOptions: ["arcana", "animal-handling", "insight", "medicine", "nature", "perception", "religion", "survival"], spellcasting: { kind: "full", ability: "wis" } },
  { id: "fighter", name: "Fighter", hitDie: 10, saves: ["str", "con"], skillChoices: 2, skillOptions: ["acrobatics", "animal-handling", "athletics", "history", "insight", "intimidation", "perception", "survival"], spellcasting: { kind: "none" } },
  { id: "monk", name: "Monk", hitDie: 8, saves: ["str", "dex"], skillChoices: 2, skillOptions: ["acrobatics", "athletics", "history", "insight", "religion", "stealth"], spellcasting: { kind: "none" } },
  { id: "paladin", name: "Paladin", hitDie: 10, saves: ["wis", "cha"], skillChoices: 2, skillOptions: ["athletics", "insight", "intimidation", "medicine", "persuasion", "religion"], spellcasting: { kind: "half", ability: "cha" } },
  { id: "ranger", name: "Ranger", hitDie: 10, saves: ["str", "dex"], skillChoices: 3, skillOptions: ["animal-handling", "athletics", "insight", "investigation", "nature", "perception", "stealth", "survival"], spellcasting: { kind: "half", ability: "wis" } },
  { id: "rogue", name: "Rogue", hitDie: 8, saves: ["dex", "int"], skillChoices: 4, skillOptions: ["acrobatics", "athletics", "deception", "insight", "intimidation", "investigation", "perception", "performance", "persuasion", "sleight-of-hand", "stealth"], spellcasting: { kind: "none" } },
  { id: "sorcerer", name: "Sorcerer", hitDie: 6, saves: ["con", "cha"], skillChoices: 2, skillOptions: ["arcana", "deception", "insight", "intimidation", "persuasion", "religion"], spellcasting: { kind: "full", ability: "cha" } },
  { id: "warlock", name: "Warlock", hitDie: 8, saves: ["wis", "cha"], skillChoices: 2, skillOptions: ["arcana", "deception", "history", "intimidation", "investigation", "nature", "religion"], spellcasting: { kind: "pact", ability: "cha" } },
  { id: "wizard", name: "Wizard", hitDie: 6, saves: ["int", "wis"], skillChoices: 2, skillOptions: ["arcana", "history", "insight", "investigation", "medicine", "religion"], spellcasting: { kind: "full", ability: "int" } },
];

/**
 * Background names only. The SRD ships one background; the others are listed
 * as plain names (with a link out) and the two skills they grant are chosen by
 * the player, so no background text is reproduced.
 */
export const BACKGROUND_NAMES = [
  "Acolyte",
  "Charlatan",
  "Criminal",
  "Entertainer",
  "Folk Hero",
  "Guild Artisan",
  "Hermit",
  "Noble",
  "Outlander",
  "Sage",
  "Sailor",
  "Soldier",
  "Urchin",
] as const;
export const BACKGROUND_SKILL_COUNT = 2;

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/** Proficiency bonus by level: +2 (1 to 4), +3 (5 to 8), +4 (9 to 12), +5 (13 to 16), +6 (17 to 20). */
export function proficiencyBonus(level: number): number {
  return 2 + Math.floor((Math.min(Math.max(level, 1), 20) - 1) / 4);
}

/** Spell slots per spell level (index 0 = 1st level) for a full caster, by character level (index 0 = level 1). */
const FULL_SLOTS: readonly (readonly number[])[] = [
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

/** Paladin and Ranger: no slots at level 1. */
const HALF_SLOTS: readonly (readonly number[])[] = [
  [],
  [2],
  [3],
  [3],
  [4, 2],
  [4, 2],
  [4, 3],
  [4, 3],
  [4, 3, 2],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2],
];

/** Warlock Pact Magic: a few slots, all of one level. */
export function pactSlots(level: number): { slots: number; slotLevel: number } {
  const l = Math.min(Math.max(level, 1), 20);
  const slots = l === 1 ? 1 : l <= 10 ? 2 : l <= 16 ? 3 : 4;
  const slotLevel = l === 1 ? 1 : l <= 2 ? 1 : l <= 4 ? 2 : l <= 6 ? 3 : l <= 8 ? 4 : 5;
  return { slots, slotLevel };
}

export function spellSlots(kind: SpellcastingKind, level: number): number[] {
  const l = Math.min(Math.max(level, 1), 20);
  if (kind === "full") return [...FULL_SLOTS[l - 1]];
  if (kind === "half") return [...HALF_SLOTS[l - 1]];
  return [];
}

export const findRace = (id: string) => RACES.find((r) => r.id === id);
export const findClass = (id: string) => CLASSES.find((c) => c.id === id);
