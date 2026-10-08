/**
 * The Asetheria homebrew house rules for character creation, in one place.
 * The engine enforces these numbers, the wizard shows these words, and the
 * tests assert both, so changing a rule means changing it here and nowhere else.
 *
 * Source: the Asetheria Homebrew compendium ("DnD House Rules" and "Character
 * Stats"), merged where it repeated itself.
 */

export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type Ability = (typeof ABILITIES)[number];

export const ABILITY_NAMES: Record<Ability, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

export const ABILITY_SCORE_METHODS = ["point-buy", "roll", "standard-array"] as const;
export type AbilityScoreMethod = (typeof ABILITY_SCORE_METHODS)[number];

// ---------------------------------------------------------------------------
// Point buy: 27 + 2 + 1d4 points, each score 6 to 15 before bonuses.
// ---------------------------------------------------------------------------

export const POINT_BUY = {
  basePoints: 27,
  bonusPoints: 2,
  /** The extra die rolled once when the character is started. */
  extraDie: 4,
  minScore: 6,
  maxScore: 15,
  /**
   * Cost of each score. 8 to 15 is the standard 5e table. The compendium allows
   * 6 and 7 but gives them no price; they refund 2 and 1 points, continuing the
   * table downward. (Assumption (c) in PLAN.md; change it here if the DM rules otherwise.)
   */
  costs: { 6: -2, 7: -1, 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 } as Record<number, number>,
} as const;

// ---------------------------------------------------------------------------
// Rolling: 4d6 drop the lowest, six times; the total must reach 72.
// ---------------------------------------------------------------------------

export const ROLLING = {
  dice: 4,
  sides: 6,
  /** The six scores must add up to at least this. Below it, all six are rerolled. */
  minimumTotal: 72,
  /** At or above the minimum you may keep the scores or reroll once more; the second set is binding. */
  optionalRerolls: 1,
} as const;

// ---------------------------------------------------------------------------
// Standard arrays.
// ---------------------------------------------------------------------------

export const STANDARD_ARRAYS: readonly (readonly number[])[] = [
  [15, 14, 13, 12, 10, 8],
  [16, 13, 13, 12, 10, 7],
  [17, 13, 12, 11, 10, 7],
];

// ---------------------------------------------------------------------------
// Hit points.
// ---------------------------------------------------------------------------

export const HIT_POINTS = {
  /** Hit dice are maxed for levels 1 to this level; later levels are rolled. */
  maxedThroughLevel: 3,
  /** When a level's roll comes up this, it may be rerolled once and the new roll must be used. */
  rerollOn: 1,
} as const;

// ---------------------------------------------------------------------------
// Citizenship and worship.
// ---------------------------------------------------------------------------

export const CITIZENSHIPS = [
  { id: "imperium-invicta", name: "Imperium Invicta", codexSlug: "imperium-invicta" },
  { id: "hellenoria", name: "Hellenoria", codexSlug: "hellenoria" },
  { id: "acheaoria", name: "Acheaoria", codexSlug: "acheaoria" },
] as const;
export type CitizenshipId = (typeof CITIZENSHIPS)[number]["id"];

export const CITIZENSHIP_TEXT =
  "You can pick a citizenship from the existing empires (Imperium Invicta, Hellenoria, Acheaoria) or not at all. They come with their corresponding benefits and weaknesses.";

export const WORSHIP_TEXT =
  "You may choose to follow one of the gods or remain unaffiliated. Your connection is personal, with no binding obligations or formal service.";

// ---------------------------------------------------------------------------
// Words shown in the wizard.
// ---------------------------------------------------------------------------

export const STAT_RULES_TEXT = {
  "point-buy": `Spend ${POINT_BUY.basePoints} points plus ${POINT_BUY.bonusPoints} bonus points plus a roll of 1d${POINT_BUY.extraDie}. Before any bonuses, each score is at least ${POINT_BUY.minScore} and at most ${POINT_BUY.maxScore}.`,
  roll: `Roll ${ROLLING.dice}d${ROLLING.sides} and drop the lowest die, six times, once for each ability. The six scores must add up to ${ROLLING.minimumTotal} or more; if they do not, you reroll all six. Once you have ${ROLLING.minimumTotal} or more you may keep them or reroll once more, but then you must keep the new rolls, even if they are lower.`,
  "standard-array": "Use one of the fixed sets of scores and assign each value to an ability. Each value is used once.",
} as const;

export const HIT_POINT_RULES_TEXT =
  `When rolling for hit points, the hit die is maxed out for levels 1 to ${HIT_POINTS.maxedThroughLevel}. From then on you roll as normal. Whenever you roll a ${HIT_POINTS.rerollOn} for a level you may reroll once, and you must use the new roll even if it is another ${HIT_POINTS.rerollOn}.`;

/** The combat house rules, shown on the sheet for reference. */
export const COMBAT_HOUSE_RULES: readonly { title: string; text: string }[] = [
  {
    title: "Combat flanking",
    text: "When a creature and at least one of its allies are adjacent to an enemy and on opposite sides or corners of the enemy's space, they flank that enemy, and each of them has advantage on melee attack rolls against that enemy.",
  },
  {
    title: "Critical attacks",
    text: "When rolling damage for a critical, instead of rolling two sets of damage dice, one set is maxed out, then roll as normal totaling the damage. For example, a critical hit with a dagger would be 1d6 + 6 instead of 2d6.",
  },
  {
    title: "Critical saving throws",
    text: "When a creature is subjected to an effect that allows a saving throw to take half damage, the creature instead takes no damage on a natural 20.",
  },
  {
    title: "Death saving throws",
    text: "When rendered unconscious and rolling for death saves, the player has to minimize their comments and communication about their character's welfare with the party. And when rolling for the death saves, the rolls must be whispered to the DM.",
  },
  {
    title: "Team dynamics",
    text: "Party members may swap places in the initiative order provided there is no other party member in-between them in the order. This can only be done before combat starts and once per party member.",
  },
];

export const CHARACTER_LIMITS = {
  minLevel: 1,
  maxLevel: 20,
  maxScore: 20,
  maxCharactersPerPlayer: 20,
  maxDataBytes: 64 * 1024,
  maxTextLength: 4000,
} as const;
