import { expect, test } from "@playwright/test";
import {
  abilityModifier,
  applyBonuses,
  computeHitPoints,
  evaluateRollSequence,
  levelRollValue,
  pointBuyBudget,
  pointBuyCost,
  proficiencyBonus,
  rerollLevel,
  resolveRace,
  rollLevel,
  rollSet,
  scoreFromDice,
  secureRng,
  usesExactly,
  validateAndDerive,
  validatePointBuy,
  validateRolledSet,
  validateStandardArray,
  type CharacterInput,
  type RolledSet,
  type Scores,
} from "../src/lib/character/engine";
import { ABILITIES, COMBAT_HOUSE_RULES, STANDARD_ARRAYS } from "../src/lib/character/house-rules";
import { CLASSES, RACES, SKILLS, pactSlots, spellSlots } from "../src/lib/character/srd";

/**
 * Phase 10: the character rules engine, with the Asetheria house rules checked
 * against exact fixtures and every boundary. Pure functions, so these run
 * without a browser or a database.
 */

const scores = (str: number, dex: number, con: number, int: number, wis: number, cha: number): Scores => ({ str, dex, con, int, wis, cha });

/** A rolled set whose six scores are exactly `values` (dice chosen so the top three sum to each score). */
function setOf(values: number[]): RolledSet {
  const dice = values.map((v) => {
    // Three dice summing to v (3 to 18) plus a fourth die that is never higher than the lowest of them.
    const a = Math.min(6, Math.max(1, Math.ceil(v / 3)));
    const rest = v - a;
    const b = Math.min(a, Math.max(1, Math.ceil(rest / 2)));
    const c = rest - b;
    return [a, b, c, 1];
  });
  const scoresOut = dice.map(scoreFromDice);
  expect(scoresOut).toEqual(values);
  return { dice, scores: scoresOut, total: scoresOut.reduce((s, n) => s + n, 0) };
}

const BASE: CharacterInput = {
  schemaVersion: 1,
  name: "Test Hero",
  playerName: "Tester",
  concept: "",
  race: { raceId: "human" },
  classId: "fighter",
  level: 1,
  backgroundName: "Soldier",
  backgroundSkills: ["survival", "history"],
  classSkills: ["athletics", "perception"],
  method: "point-buy",
  pointBuy: { extraRoll: 1, scores: scores(15, 13, 14, 8, 12, 10) },
  hp: { mode: "rolled", levelRolls: [] },
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
const make = (patch: Partial<CharacterInput>): CharacterInput => ({ ...BASE, ...patch });

test.describe("modifiers and proficiency", () => {
  test("[TC-CHRE-001] ability modifier follows floor((score - 10) / 2) across the whole range", () => {
    const expected: [number, number][] = [[1, -5], [3, -4], [8, -1], [9, -1], [10, 0], [11, 0], [12, 1], [15, 2], [16, 3], [20, 5], [30, 10]];
    for (const [score, mod] of expected) expect(abilityModifier(score), `score ${score}`).toBe(mod);
  });

  test("[TC-CHRE-002] proficiency bonus steps at levels 5, 9, 13 and 17, and clamps outside 1 to 20", () => {
    const expected: [number, number][] = [[1, 2], [4, 2], [5, 3], [8, 3], [9, 4], [12, 4], [13, 5], [16, 5], [17, 6], [20, 6], [0, 2], [25, 6]];
    for (const [level, bonus] of expected) expect(proficiencyBonus(level), `level ${level}`).toBe(bonus);
  });
});

test.describe("point buy (27 + 2 + 1d4, scores 6 to 15)", () => {
  test("[TC-CHRE-003] the budget is 30 to 33 depending on the d4", () => {
    expect([1, 2, 3, 4].map(pointBuyBudget)).toEqual([30, 31, 32, 33]);
  });

  test("[TC-CHRE-004] costs follow the 5e table from 8 to 15, and 6 and 7 refund points", () => {
    expect([6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((s) => pointBuyCost(s))).toEqual([-2, -1, 0, 1, 2, 3, 4, 5, 7, 9]);
    for (const bad of [5, 16, 0, -1, 10.5, NaN, Infinity]) expect(pointBuyCost(bad), String(bad)).toBeNull();
  });

  test("[TC-CHRE-005] spending exactly the budget is allowed and one point over is not", () => {
    const exact = scores(15, 15, 14, 13, 8, 8); // 9 + 9 + 7 + 5 + 0 + 0 = 30
    expect(validatePointBuy(exact, 1)).toMatchObject({ ok: true, spent: 30, budget: 30, remaining: 0 });
    const over = scores(15, 15, 14, 13, 9, 8); // 31
    expect(validatePointBuy(over, 1).ok).toBe(false);
    expect(validatePointBuy(over, 2)).toMatchObject({ ok: true, spent: 31, remaining: 0 });
  });

  test("[TC-CHRE-006] the 6 and 15 limits hold, and refunds from 6 and 7 can pay for more", () => {
    expect(validatePointBuy(scores(6, 6, 6, 6, 6, 6), 1).ok).toBe(true);
    expect(validatePointBuy(scores(15, 15, 15, 15, 15, 15), 4).ok).toBe(false);
    expect(validatePointBuy(scores(16, 8, 8, 8, 8, 8), 4).ok).toBe(false);
    expect(validatePointBuy(scores(5, 8, 8, 8, 8, 8), 4).ok).toBe(false);
    // (6,6,15,15,15,15) costs -4 + 36 = 32: fine at a budget of 32 or 33, not at 30 or 31.
    const stretched = scores(6, 6, 15, 15, 15, 15);
    expect([1, 2, 3, 4].map((d) => validatePointBuy(stretched, d).ok)).toEqual([false, false, true, true]);
  });

  test("[TC-CHRE-007] a non-whole score or a bad bonus die is refused", () => {
    expect(validatePointBuy(scores(10.5, 8, 8, 8, 8, 8), 1).ok).toBe(false);
    expect(validatePointBuy(scores(8, 8, 8, 8, 8, 8), 0).ok).toBe(false);
    expect(validatePointBuy(scores(8, 8, 8, 8, 8, 8), 5).ok).toBe(false);
    expect(validatePointBuy(scores(8, 8, 8, 8, 8, 8), 2.5).ok).toBe(false);
  });
});

test.describe("rolling (4d6 drop the lowest, total at least 72)", () => {
  test("[TC-CHRE-008] a score is the sum of the three highest of four dice", () => {
    expect(scoreFromDice([6, 5, 4, 1])).toBe(15);
    expect(scoreFromDice([1, 1, 1, 1])).toBe(3);
    expect(scoreFromDice([6, 6, 6, 6])).toBe(18);
    expect(scoreFromDice([2, 6, 3, 3])).toBe(12);
  });

  test("[TC-CHRE-009] over thousands of rolls every score stays in 3 to 18 with the right average (about 12.24)", () => {
    let sum = 0;
    let count = 0;
    let min = 99;
    let max = 0;
    for (let i = 0; i < 4000; i++) {
      const set = rollSet(secureRng);
      expect(validateRolledSet(set).ok).toBe(true);
      for (const s of set.scores) {
        sum += s;
        count++;
        min = Math.min(min, s);
        max = Math.max(max, s);
      }
    }
    expect(min).toBeGreaterThanOrEqual(3);
    expect(max).toBeLessThanOrEqual(18);
    expect(sum / count).toBeGreaterThan(12.1);
    expect(sum / count).toBeLessThan(12.4);
  });

  test("[TC-CHRE-010] the secure die is fair and in range", () => {
    const counts = new Array(7).fill(0);
    for (let i = 0; i < 12000; i++) counts[secureRng(6)]++;
    expect(counts[0]).toBe(0);
    for (let face = 1; face <= 6; face++) expect(counts[face]).toBeGreaterThan(1700);
  });

  test("[TC-CHRE-011] 72 is accepted and 71 forces a reroll of all six", () => {
    const at72 = evaluateRollSequence([setOf([12, 12, 12, 12, 12, 12])]);
    expect(at72).toMatchObject({ ok: true, mustReroll: false, canReroll: true });
    expect(at72.final?.total).toBe(72);
    const at71 = evaluateRollSequence([setOf([12, 12, 12, 12, 12, 11])]);
    expect(at71).toMatchObject({ ok: false, mustReroll: true, final: null });
  });

  test("[TC-CHRE-012] below-72 sets are thrown away until one reaches 72", () => {
    const seq = evaluateRollSequence([setOf([10, 10, 10, 10, 10, 10]), setOf([11, 11, 11, 11, 11, 11]), setOf([13, 13, 12, 12, 11, 11])]);
    expect(seq).toMatchObject({ ok: true, canReroll: true });
    expect(seq.final?.total).toBe(72);
  });

  test("[TC-CHRE-013] after 72 or more, one extra reroll is allowed and its result is binding even when lower", () => {
    const high = setOf([15, 14, 13, 12, 10, 8]); // 72
    const worse = setOf([9, 9, 9, 9, 9, 9]); // 54
    const seq = evaluateRollSequence([high, worse]);
    expect(seq).toMatchObject({ ok: true, canReroll: false, mustReroll: false });
    expect(seq.final?.total).toBe(54);
  });

  test("[TC-CHRE-014] a second extra reroll, or no qualifying set at all, is refused", () => {
    const a = setOf([12, 12, 12, 12, 12, 12]);
    expect(evaluateRollSequence([a, a, a]).ok).toBe(false);
    expect(evaluateRollSequence([setOf([10, 10, 10, 10, 10, 10]), setOf([10, 10, 10, 10, 10, 10])]).ok).toBe(false);
    expect(evaluateRollSequence([]).ok).toBe(false);
  });

  test("[TC-CHRE-015] tampered dice are refused: out of range, wrong count, a score or total that does not match", () => {
    const good = setOf([12, 12, 12, 12, 12, 12]);
    const bad = (mutate: (s: RolledSet) => void) => {
      const copy: RolledSet = JSON.parse(JSON.stringify(good));
      mutate(copy);
      return evaluateRollSequence([copy]).ok;
    };
    expect(bad((s) => (s.dice[0][0] = 7))).toBe(false);
    expect(bad((s) => (s.dice[0][0] = 0))).toBe(false);
    expect(bad((s) => s.dice[0].pop())).toBe(false);
    expect(bad((s) => s.dice.pop())).toBe(false);
    expect(bad((s) => (s.scores[0] = 18))).toBe(false);
    expect(bad((s) => (s.total = 90))).toBe(false);
    expect(bad((s) => (s.dice[0][0] = 1.5))).toBe(false);
    expect(bad(() => {})).toBe(true);
  });
});

test.describe("standard arrays", () => {
  test("[TC-CHRE-016] each of the three arrays is accepted in any arrangement, once per value", () => {
    expect(STANDARD_ARRAYS).toEqual([[15, 14, 13, 12, 10, 8], [16, 13, 13, 12, 10, 7], [17, 13, 12, 11, 10, 7]]);
    expect(validateStandardArray(0, scores(8, 10, 12, 13, 14, 15)).ok).toBe(true);
    expect(validateStandardArray(1, scores(13, 13, 16, 12, 10, 7)).ok).toBe(true);
    expect(validateStandardArray(2, scores(7, 10, 17, 13, 12, 11)).ok).toBe(true);
  });

  test("[TC-CHRE-017] reusing a value, using another array's values, or a bad index is refused", () => {
    expect(validateStandardArray(0, scores(15, 15, 13, 12, 10, 8)).ok).toBe(false);
    expect(validateStandardArray(0, scores(16, 13, 13, 12, 10, 7)).ok).toBe(false);
    expect(validateStandardArray(1, scores(15, 14, 13, 12, 10, 8)).ok).toBe(false);
    expect(validateStandardArray(3, scores(15, 14, 13, 12, 10, 8)).ok).toBe(false);
    expect(validateStandardArray(-1, scores(15, 14, 13, 12, 10, 8)).ok).toBe(false);
    expect(usesExactly(scores(1, 2, 3, 4, 5, 6), [6, 5, 4, 3, 2, 1])).toBe(true);
  });
});

test.describe("heritage bonuses", () => {
  test("[TC-CHRE-018] a fixed heritage gives its bonuses and speed", () => {
    const human = resolveRace({ raceId: "human" });
    expect(human.problems).toEqual([]);
    expect(ABILITIES.every((a) => human.bonuses[a] === 1)).toBe(true);
    expect(resolveRace({ raceId: "hill-dwarf" })).toMatchObject({ speed: 25, bonuses: { con: 2, wis: 1 } });
    expect(resolveRace({ raceId: "rock-gnome" }).size).toBe("Small");
  });

  test("[TC-CHRE-019] a Half-Elf places two +1s on abilities other than Charisma, each different", () => {
    expect(resolveRace({ raceId: "half-elf", chosenBonuses: ["str", "dex"] })).toMatchObject({ problems: [], bonuses: { cha: 2, str: 1, dex: 1 } });
    for (const picks of [["str"], ["str", "str"], ["str", "cha"], ["str", "dex", "con"], []] as const) {
      expect(resolveRace({ raceId: "half-elf", chosenBonuses: [...picks] }).problems.length, picks.join()).toBeGreaterThan(0);
    }
    expect(resolveRace({ raceId: "human", chosenBonuses: ["str"] }).problems.length).toBeGreaterThan(0);
  });

  test("[TC-CHRE-020] 'Other' heritage accepts small bonuses and a sane speed, and nothing wilder", () => {
    const ok = resolveRace({ raceId: "other", other: { name: "Sea-kin", bonuses: { con: 2, dex: 1 }, speed: 30 } });
    expect(ok.problems).toEqual([]);
    expect(resolveRace({ raceId: "other", other: { name: "Sea-kin", bonuses: { con: 3 }, speed: 30 } }).problems.length).toBeGreaterThan(0);
    expect(resolveRace({ raceId: "other", other: { name: "Sea-kin", bonuses: { con: 2, dex: 2 }, speed: 30 } }).problems.length).toBeGreaterThan(0);
    expect(resolveRace({ raceId: "other", other: { name: "Sea-kin", bonuses: { con: -1 }, speed: 30 } }).problems.length).toBeGreaterThan(0);
    expect(resolveRace({ raceId: "other", other: { name: "Sea-kin", bonuses: {}, speed: 5 } }).problems.length).toBeGreaterThan(0);
    expect(resolveRace({ raceId: "other", other: { name: "Sea-kin", bonuses: {}, speed: 61 } }).problems.length).toBeGreaterThan(0);
    expect(resolveRace({ raceId: "other", other: { name: "  ", bonuses: {}, speed: 30 } }).problems.length).toBeGreaterThan(0);
    expect(resolveRace({ raceId: "no-such-race" }).problems.length).toBeGreaterThan(0);
  });

  test("[TC-CHRE-021] bonuses never push a score past 20", () => {
    expect(applyBonuses(scores(19, 20, 8, 8, 8, 8), { str: 2, dex: 1, con: 1 })).toEqual(scores(20, 20, 9, 8, 8, 8));
  });
});

test.describe("hit points (max for levels 1 to 3, then roll; a 1 may be rerolled once)", () => {
  test("[TC-CHRE-022] levels 1 to 3 take the full hit die plus Constitution every time", () => {
    for (const [level, total] of [[1, 10], [2, 20], [3, 30]] as const) {
      expect(computeHitPoints({ hitDie: 8, level, conMod: 2, levelRolls: [] })).toMatchObject({ ok: true, total });
    }
  });

  test("[TC-CHRE-023] from level 4 each level uses its roll plus Constitution", () => {
    const r = computeHitPoints({ hitDie: 8, level: 5, conMod: 2, levelRolls: [{ first: 5 }, { first: 8 }] });
    expect(r.ok).toBe(true);
    expect(r.perLevel).toEqual([10, 10, 10, 7, 10]);
    expect(r.total).toBe(47);
  });

  test("[TC-CHRE-024] a rolled 1 that is rerolled uses the new roll, even when that is another 1", () => {
    expect(levelRollValue({ first: 1, reroll: 6 })).toBe(6);
    expect(levelRollValue({ first: 1, reroll: 1 })).toBe(1);
    expect(levelRollValue({ first: 1 })).toBe(1);
    expect(levelRollValue({ first: 4 })).toBe(4);
    expect(computeHitPoints({ hitDie: 8, level: 4, conMod: 0, levelRolls: [{ first: 1, reroll: 6 }] }).perLevel[3]).toBe(6);
    expect(computeHitPoints({ hitDie: 8, level: 4, conMod: 0, levelRolls: [{ first: 1, reroll: 1 }] }).perLevel[3]).toBe(1);
  });

  test("[TC-CHRE-025] only a 1 can be rerolled, rolls must fit the die, and the number of rolls must match the level", () => {
    expect(computeHitPoints({ hitDie: 8, level: 4, conMod: 0, levelRolls: [{ first: 4, reroll: 8 }] }).ok).toBe(false);
    expect(computeHitPoints({ hitDie: 8, level: 4, conMod: 0, levelRolls: [{ first: 9 }] }).ok).toBe(false);
    expect(computeHitPoints({ hitDie: 8, level: 4, conMod: 0, levelRolls: [{ first: 0 }] }).ok).toBe(false);
    expect(computeHitPoints({ hitDie: 8, level: 4, conMod: 0, levelRolls: [{ first: 1, reroll: 9 }] }).ok).toBe(false);
    expect(computeHitPoints({ hitDie: 8, level: 4, conMod: 0, levelRolls: [] }).ok).toBe(false);
    expect(computeHitPoints({ hitDie: 8, level: 3, conMod: 0, levelRolls: [{ first: 3 }] }).ok).toBe(false);
    expect(computeHitPoints({ hitDie: 8, level: 4, conMod: 0, levelRolls: [{ first: 2.5 }] }).ok).toBe(false);
  });

  test("[TC-CHRE-026] a level never gives less than 1 hit point, whatever the Constitution", () => {
    expect(computeHitPoints({ hitDie: 6, level: 1, conMod: -5, levelRolls: [] }).total).toBe(1);
    expect(computeHitPoints({ hitDie: 6, level: 4, conMod: -3, levelRolls: [{ first: 1, reroll: 1 }] }).perLevel).toEqual([3, 3, 3, 1]);
  });

  test("[TC-CHRE-027] the roller rerolls only a 1, only once", () => {
    const fixed = (n: number) => () => n;
    expect(rollLevel(8, fixed(1))).toEqual({ first: 1 });
    expect(rerollLevel({ first: 1 }, 8, fixed(5))).toEqual({ first: 1, reroll: 5 });
    expect(rerollLevel({ first: 1, reroll: 1 }, 8, fixed(7))).toEqual({ first: 1, reroll: 1 });
    expect(rerollLevel({ first: 6 }, 8, fixed(7))).toEqual({ first: 6 });
  });
});

test.describe("spell slots", () => {
  test("[TC-CHRE-028] full casters follow the SRD table", () => {
    expect(spellSlots("full", 1)).toEqual([2]);
    expect(spellSlots("full", 3)).toEqual([4, 2]);
    expect(spellSlots("full", 5)).toEqual([4, 3, 2]);
    expect(spellSlots("full", 9)).toEqual([4, 3, 3, 3, 1]);
    expect(spellSlots("full", 17)).toEqual([4, 3, 3, 3, 2, 1, 1, 1, 1]);
    expect(spellSlots("full", 20)).toEqual([4, 3, 3, 3, 3, 2, 2, 1, 1]);
  });

  test("[TC-CHRE-029] half casters get nothing at level 1 and reach 5th-level slots at 17", () => {
    expect(spellSlots("half", 1)).toEqual([]);
    expect(spellSlots("half", 2)).toEqual([2]);
    expect(spellSlots("half", 5)).toEqual([4, 2]);
    expect(spellSlots("half", 17)).toEqual([4, 3, 3, 3, 1]);
    expect(spellSlots("half", 20)).toEqual([4, 3, 3, 3, 2]);
  });

  test("[TC-CHRE-030] Warlock pact slots are few and all one level", () => {
    expect(pactSlots(1)).toEqual({ slots: 1, slotLevel: 1 });
    expect(pactSlots(2)).toEqual({ slots: 2, slotLevel: 1 });
    expect(pactSlots(5)).toEqual({ slots: 2, slotLevel: 3 });
    expect(pactSlots(11)).toEqual({ slots: 3, slotLevel: 5 });
    expect(pactSlots(17)).toEqual({ slots: 4, slotLevel: 5 });
    expect(spellSlots("none", 10)).toEqual([]);
    expect(spellSlots("pact", 10)).toEqual([]);
  });

  test("[TC-CHRE-031] the table never goes backwards as a character levels", () => {
    for (const kind of ["full", "half"] as const) {
      let prev = 0;
      for (let l = 1; l <= 20; l++) {
        const total = spellSlots(kind, l).reduce((s, n) => s + n, 0);
        expect(total, `${kind} L${l}`).toBeGreaterThanOrEqual(prev);
        prev = total;
      }
    }
  });
});

test.describe("rules data", () => {
  test("[TC-CHRE-032] every class and race is complete and consistent", () => {
    expect(CLASSES).toHaveLength(12);
    expect(RACES).toHaveLength(9);
    expect(SKILLS).toHaveLength(18);
    for (const c of CLASSES) {
      expect([6, 8, 10, 12]).toContain(c.hitDie);
      expect(new Set(c.saves).size).toBe(2);
      const options = c.skillOptions === "any" ? SKILLS.map((s) => s.id) : c.skillOptions;
      expect(options.length).toBeGreaterThanOrEqual(c.skillChoices);
      for (const o of options) expect(SKILLS.some((s) => s.id === o), `${c.id} ${o}`).toBe(true);
    }
    for (const r of RACES) expect([25, 30]).toContain(r.speed);
  });

  test("[TC-CHRE-033] the combat house rules are present and word-for-word from the compendium", () => {
    expect(COMBAT_HOUSE_RULES.map((r) => r.title)).toEqual(["Combat flanking", "Critical attacks", "Critical saving throws", "Death saving throws", "Team dynamics"]);
    expect(COMBAT_HOUSE_RULES[1].text).toContain("1d6 + 6 instead of 2d6");
    expect(COMBAT_HOUSE_RULES[3].text).toContain("whispered to the DM");
  });
});

test.describe("a whole character", () => {
  test("[TC-CHRE-034] a human fighter by point buy has exactly the numbers the rules give", () => {
    const out = validateAndDerive(BASE);
    expect(out.problems).toEqual([]);
    const s = out.sheet!;
    expect(s.scores).toEqual(scores(16, 14, 15, 9, 13, 11));
    expect(s.modifiers).toEqual(scores(3, 2, 2, -1, 1, 0));
    expect(s.proficiencyBonus).toBe(2);
    expect(s.saves.find((x) => x.ability === "str")).toMatchObject({ proficient: true, bonus: 5 });
    expect(s.saves.find((x) => x.ability === "con")).toMatchObject({ proficient: true, bonus: 4 });
    expect(s.saves.find((x) => x.ability === "dex")).toMatchObject({ proficient: false, bonus: 2 });
    expect(s.skills.find((x) => x.id === "athletics")).toMatchObject({ proficient: true, bonus: 5 });
    expect(s.skills.find((x) => x.id === "perception")).toMatchObject({ proficient: true, bonus: 3 });
    expect(s.skills.find((x) => x.id === "stealth")).toMatchObject({ proficient: false, bonus: 2 });
    expect(s.passivePerception).toBe(13);
    expect(s.armorClass).toBe(12);
    expect(s.initiative).toBe(2);
    expect(s.speed).toBe(30);
    expect(s.hitPoints).toBe(12);
    expect(s.hitDice).toBe("1d10");
    expect(s.spellcasting).toBeNull();
  });

  test("[TC-CHRE-035] a high-elf wizard by standard array, level 5, gets spell numbers and rolled hit points", () => {
    const wizard = make({
      race: { raceId: "high-elf" },
      classId: "wizard",
      level: 5,
      classSkills: ["arcana", "investigation"],
      method: "standard-array",
      pointBuy: undefined,
      array: { index: 0, assignment: scores(8, 13, 14, 15, 12, 10) },
      hp: { mode: "rolled", levelRolls: [{ first: 3 }, { first: 6 }] },
    });
    const out = validateAndDerive(wizard);
    expect(out.problems).toEqual([]);
    const s = out.sheet!;
    expect(s.scores).toMatchObject({ dex: 15, int: 16 });
    expect(s.proficiencyBonus).toBe(3);
    expect(s.spellcasting).toMatchObject({ ability: "int", saveDc: 14, attackBonus: 6, slots: [4, 3, 2] });
    expect(s.hitPoints).toBe(8 * 3 + (3 + 2) + (6 + 2));
    expect(s.hitDice).toBe("5d6");
  });

  test("[TC-CHRE-036] a warlock gets pact slots, a level-1 paladin gets none", () => {
    const common = { method: "standard-array" as const, pointBuy: undefined, array: { index: 0, assignment: scores(10, 8, 14, 12, 13, 15) } };
    const warlock = validateAndDerive(make({ ...common, classId: "warlock", level: 5, classSkills: ["arcana", "deception"], hp: { mode: "rolled", levelRolls: [{ first: 4 }, { first: 4 }] } })).sheet!;
    expect(warlock.spellcasting?.pact).toEqual({ slots: 2, slotLevel: 3 });
    const paladin = validateAndDerive(make({ ...common, classId: "paladin", classSkills: ["athletics", "insight"] })).sheet!;
    expect(paladin.spellcasting?.slots).toEqual([]);
  });

  test("[TC-CHRE-037] manual hit points are accepted within the class's ceiling and refused outside it", () => {
    expect(validateAndDerive(make({ hp: { mode: "manual", total: 12 } })).ok).toBe(true);
    expect(validateAndDerive(make({ hp: { mode: "manual", total: 0 } })).ok).toBe(false);
    expect(validateAndDerive(make({ hp: { mode: "manual", total: 13 } })).ok).toBe(false);
    expect(validateAndDerive(make({ hp: { mode: "manual", total: 5.5 } })).ok).toBe(false);
  });

  test("[TC-CHRE-038] every rule a player could bend is refused", () => {
    const refused = (patch: Partial<CharacterInput>, label: string) => expect(validateAndDerive(make(patch)).ok, label).toBe(false);
    refused({ name: "   " }, "blank name");
    refused({ name: "x".repeat(81) }, "name too long");
    refused({ level: 0 }, "level 0");
    refused({ level: 21 }, "level 21");
    refused({ level: 1.5 }, "fractional level");
    refused({ classId: "artificer-of-doom" }, "unknown class");
    refused({ race: { raceId: "half-elf" } }, "half-elf without choices");
    refused({ classSkills: ["athletics"] }, "too few class skills");
    refused({ classSkills: ["athletics", "athletics"] }, "repeated class skill");
    refused({ classSkills: ["athletics", "arcana"] }, "skill not on the class list");
    refused({ backgroundSkills: ["survival"] }, "too few background skills");
    refused({ backgroundSkills: ["athletics", "history"] }, "background repeats a class skill");
    refused({ citizenship: "narnia" }, "unknown citizenship");
    refused({ pointBuy: { extraRoll: 1, scores: scores(15, 15, 15, 15, 15, 15) } }, "point buy over budget");
    refused({ pointBuy: { extraRoll: 9, scores: scores(8, 8, 8, 8, 8, 8) } }, "impossible bonus die");
    refused({ method: "roll", roll: undefined }, "roll method with no rolls");
    refused({ method: "roll", roll: { sets: [setOf([10, 10, 10, 10, 10, 10])], assignment: scores(10, 10, 10, 10, 10, 10) } }, "rolled under 72, not rerolled");
    refused({ method: "roll", roll: { sets: [setOf([12, 12, 12, 12, 12, 12])], assignment: scores(18, 18, 18, 18, 18, 18) } }, "scores that were not rolled");
    refused({ method: "standard-array", array: { index: 0, assignment: scores(15, 15, 13, 12, 10, 8) } }, "array value reused");
    refused({ armorClass: 0 }, "AC 0");
    refused({ armorClass: 31 }, "AC 31");
    refused({ backstory: "x".repeat(4001) }, "backstory too long");
    refused({ schemaVersion: 2 as unknown as 1 }, "wrong schema version");
  });

  test("[TC-CHRE-039] a rolled character is accepted with the final set, including a binding lower reroll", () => {
    const high = setOf([15, 14, 13, 12, 10, 8]);
    const lower = setOf([12, 11, 10, 10, 9, 8]);
    const out = validateAndDerive(make({ method: "roll", pointBuy: undefined, roll: { sets: [high, lower], assignment: scores(12, 11, 10, 10, 9, 8) } }));
    expect(out.problems).toEqual([]);
    expect(out.sheet?.baseScores).toEqual(scores(12, 11, 10, 10, 9, 8));
    // The player cannot go back to the discarded higher set once the reroll is taken.
    const cheat = validateAndDerive(make({ method: "roll", pointBuy: undefined, roll: { sets: [high, lower], assignment: scores(15, 14, 13, 12, 10, 8) } }));
    expect(cheat.ok).toBe(false);
  });

  test("[TC-CHRE-040] validation is deterministic and never changes its input", () => {
    const frozen = JSON.parse(JSON.stringify(BASE)) as CharacterInput;
    const a = validateAndDerive(frozen);
    const b = validateAndDerive(frozen);
    expect(b).toEqual(a);
    expect(frozen).toEqual(BASE);
  });
});
