import { expect, test } from "@playwright/test";
import { STATBLOCK_SKELETON, VALID_CR, abilityModifier, formatModifier, looksLikeStatblock, parseStatblock, proficiencyForCr, statblockProblem } from "../src/lib/statblock";

/**
 * Phase 14 (pure part): reading the standard 5e layout, refusing what is not a stat block, and the
 * arithmetic that follows from it. No browser and no database.
 */

const DIV = `**Armor Class** 16 (natural)
**Hit Points** 152 (16d10 + 64)
**Speed** 40 ft.

STR 22 (+6)   DEX 12 (+1)   CON 19 (+4)   INT 9 (-1)   WIS 14 (+2)   CHA 15 (+2)

**Saving Throws** STR +10, CON +8
**Damage Resistances** cold, fire
**Senses** darkvision 120 ft., passive Perception 12
**Languages** Abyssal
**Challenge** 8 (3,900 XP)

### Traits

**Water-Hater.** The div takes extra damage in flowing water.`;

const block = (text: string) => {
  const r = parseStatblock(text);
  if (r.kind !== "block") throw new Error("expected a stat block");
  return r;
};
const errorsOf = (text: string) => block(text).errors;

test.describe("the arithmetic", () => {
  test("[TC-SBLK-001] ability modifiers for every score from 1 to 30 follow floor((score - 10) / 2)", () => {
    const expected: Record<number, number> = { 1: -5, 2: -4, 3: -4, 8: -1, 9: -1, 10: 0, 11: 0, 12: 1, 13: 1, 15: 2, 20: 5, 22: 6, 29: 9, 30: 10 };
    for (const [score, mod] of Object.entries(expected)) expect(abilityModifier(Number(score)), `score ${score}`).toBe(mod);
    for (let s = 1; s <= 30; s++) expect(abilityModifier(s)).toBe(Math.floor((s - 10) / 2));
  });

  test("[TC-SBLK-002] modifiers print with a plus sign, or a true minus sign", () => {
    expect(formatModifier(0)).toBe("+0");
    expect(formatModifier(6)).toBe("+6");
    expect(formatModifier(-1)).toBe("−1");
    expect(formatModifier(-5)).toBe("−5");
  });

  test("[TC-SBLK-003] proficiency bonus by challenge rating, at each edge of every band", () => {
    const bands: [string[], number][] = [
      [["0", "1/8", "1/4", "1/2", "1", "2", "3", "4"], 2],
      [["5", "6", "7", "8"], 3],
      [["9", "10", "11", "12"], 4],
      [["13", "14", "15", "16"], 5],
      [["17", "18", "19", "20"], 6],
      [["21", "22", "23", "24"], 7],
      [["25", "26", "27", "28"], 8],
      [["29", "30"], 9],
    ];
    for (const [crs, bonus] of bands) for (const cr of crs) expect(proficiencyForCr(cr), `CR ${cr}`).toBe(bonus);
    for (const bad of ["31", "-1", "1/3", "", "abc", "1.5", "01", "10/20"]) expect(proficiencyForCr(bad), bad).toBeNull();
    expect(VALID_CR).toHaveLength(34);
  });
});

test.describe("what is and is not a stat block", () => {
  test("[TC-SBLK-004] a few notes, a one-line summary, prose and nothing are left alone as free text", () => {
    for (const text of ["", "   ", "AC: 17 | CR: 5", "Class: Ranger 4", "HP: 230 | AC: 17 | CR: 6", "A tall figure in a grey cloak with a limp."]) {
      expect(parseStatblock(text), JSON.stringify(text)).toEqual({ kind: "free" });
      expect(statblockProblem(text)).toBeNull();
    }
  });

  test("[TC-SBLK-005] an Armor Class line or an ability line makes it a stat block", () => {
    expect(looksLikeStatblock("**Armor Class** 12")).toBe(true);
    expect(looksLikeStatblock("STR 10 (+0)   DEX 10 (+0)")).toBe(true);
    expect(looksLikeStatblock("Strength is a virtue")).toBe(false);
  });
});

test.describe("reading a complete stat block", () => {
  test("[TC-SBLK-006] every part is read: armour, hit points, speed, six abilities, properties, challenge, the rest as the body", () => {
    const r = block(DIV);
    expect(r.errors).toEqual([]);
    const b = r.block;
    expect(b.ac).toEqual({ value: 16, note: "(natural)" });
    expect(b.hp).toEqual({ value: 152, formula: "(16d10 + 64)" });
    expect(b.speed).toBe("40 ft.");
    expect(b.abilities).toEqual({ str: { score: 22, written: 6 }, dex: { score: 12, written: 1 }, con: { score: 19, written: 4 }, int: { score: 9, written: -1 }, wis: { score: 14, written: 2 }, cha: { score: 15, written: 2 } });
    expect(b.properties.map((p) => p.label)).toEqual(["Saving Throws", "Damage Resistances", "Senses", "Languages"]);
    expect(b.challenge).toEqual({ cr: "8", xp: "3,900" });
    expect(b.proficiency).toBe(3);
    expect(b.body.startsWith("### Traits")).toBe(true);
    expect(b.body).toContain("Water-Hater.");
    expect(b.warnings).toEqual([]);
  });

  test("[TC-SBLK-007] Windows line endings, a true minus sign and an en dash in a modifier are all understood", () => {
    const text = DIV.replace(/\n/g, "\r\n").replace("INT 9 (-1)", "INT 9 (−1)").replace("WIS 14 (+2)", "WIS 14 (–2)");
    const r = block(text);
    expect(r.errors).toEqual([]);
    expect(r.block.abilities?.int.written).toBe(-1);
    expect(r.block.abilities?.wis.written).toBe(-2);
  });

  test("[TC-SBLK-008] a trait written straight after the header, with no heading, starts the body and is not read as a property", () => {
    const r = block(`**Armor Class** 12
**Hit Points** 9 (2d8)
STR 10 (+0) DEX 10 (+0) CON 10 (+0) INT 10 (+0) WIS 10 (+0) CHA 10 (+0)
**Challenge** 1/4 (50 XP)
**Pack Tactics.** Advantage when an ally is adjacent.`);
    expect(r.errors).toEqual([]);
    expect(r.block.body).toBe("**Pack Tactics.** Advantage when an ally is adjacent.");
    expect(r.block.properties).toEqual([]);
  });

  test("[TC-SBLK-009] a modifier that does not match its score is a warning, never a refusal, and the correct one is available", () => {
    const r = block(DIV.replace("STR 22 (+6)", "STR 22 (+5)"));
    expect(r.errors).toEqual([]);
    expect(r.block.warnings).toHaveLength(1);
    expect(r.block.warnings[0]).toMatch(/STR 22 should be \+6, not \+5/);
    expect(statblockProblem(DIV.replace("STR 22 (+6)", "STR 22 (+5)"))).toBeNull();
  });

  test("[TC-SBLK-010] a second ability line is ignored with a warning", () => {
    const r = block(DIV.replace("**Saving Throws**", "STR 8 (-1)   DEX 8 (-1)   CON 8 (-1)\n**Saving Throws**"));
    expect(r.errors).toEqual([]);
    expect(r.block.abilities?.str.score).toBe(22);
    expect(r.block.warnings.join(" ")).toMatch(/twice/);
  });

  test("[TC-SBLK-011] the blank skeleton the editor offers is itself a valid stat block with no warnings", () => {
    const r = block(STATBLOCK_SKELETON);
    expect(r.errors).toEqual([]);
    expect(r.block.warnings).toEqual([]);
    expect(r.block.proficiency).toBe(2);
    expect(statblockProblem(STATBLOCK_SKELETON)).toBeNull();
  });
});

test.describe("what is refused, each with the fix", () => {
  const without = (re: RegExp) => DIV.split("\n").filter((l) => !re.test(l)).join("\n");

  test("[TC-SBLK-012] a missing Armor Class, Hit Points, ability line or Challenge", () => {
    expect(errorsOf(without(/Armor Class/).replace("STR 22", "STR 22"))).toEqual([expect.stringMatching(/Add an Armor Class line/)]);
    expect(errorsOf(without(/Hit Points/))).toEqual([expect.stringMatching(/Add a Hit Points line/)]);
    expect(errorsOf(without(/^STR /))).toEqual([expect.stringMatching(/six ability scores/)]);
    expect(errorsOf(without(/Challenge/))).toEqual([expect.stringMatching(/Add a Challenge line/)]);
  });

  test("[TC-SBLK-013] an ability line with fewer than six abilities names the missing ones", () => {
    const e = errorsOf(DIV.replace("   CHA 15 (+2)", "").replace("WIS 14 (+2)", "WIS 14 (+2)"));
    expect(e.join(" ")).toMatch(/missing CHA/);
  });

  test("[TC-SBLK-014] armour class and hit points that are not numbers", () => {
    expect(errorsOf(DIV.replace("16 (natural)", "heavy"))).toEqual([expect.stringMatching(/Armor Class must start with a number/)]);
    expect(errorsOf(DIV.replace("152 (16d10 + 64)", "lots"))).toEqual([expect.stringMatching(/Hit Points must start with a number/)]);
  });

  test("[TC-SBLK-015] the limits hold at the boundary: armour 0 and 40 pass, 41 does not; hit points 1 and 10,000 pass, 0 and 10,001 do not", () => {
    for (const ac of [0, 40]) expect(errorsOf(DIV.replace("16 (natural)", String(ac)))).toEqual([]);
    expect(errorsOf(DIV.replace("16 (natural)", "41"))).toEqual([expect.stringMatching(/Armor Class must be from 0 to 40/)]);
    for (const hp of [1, 10000]) expect(errorsOf(DIV.replace("152 (16d10 + 64)", String(hp)))).toEqual([]);
    for (const hp of [0, 10001]) expect(errorsOf(DIV.replace("152 (16d10 + 64)", String(hp)))).toEqual([expect.stringMatching(/Hit Points must be from 1 to 10,000/)]);
  });

  test("[TC-SBLK-016] ability scores 1 and 30 pass; 0 and 31 do not, and the message names the ability", () => {
    for (const s of [1, 30]) expect(errorsOf(DIV.replace("STR 22 (+6)", `STR ${s}`))).toEqual([]);
    expect(errorsOf(DIV.replace("STR 22 (+6)", "STR 31 (+10)"))).toEqual([expect.stringMatching(/STR must be from 1 to 30 \(it says 31\)/)]);
    expect(errorsOf(DIV.replace("DEX 12 (+1)", "DEX 0 (-5)"))).toEqual([expect.stringMatching(/DEX must be from 1 to 30 \(it says 0\)/)]);
  });

  test("[TC-SBLK-017] a challenge rating that does not exist: 1/3, 31, 0.5, or none at all; 0, 1/8, 1/2 and 30 are fine", () => {
    for (const cr of ["0", "1/8", "1/4", "1/2", "30"]) expect(errorsOf(DIV.replace("8 (3,900 XP)", cr)), cr).toEqual([]);
    for (const cr of ["1/3", "31", "0.5", "many"]) expect(errorsOf(DIV.replace("8 (3,900 XP)", cr)), cr).toEqual([expect.stringMatching(/valid rating/)]);
  });

  test("[TC-SBLK-018] several problems are all reported together, in plain words, by the save-time check", () => {
    const text = DIV.replace("16 (natural)", "heavy").replace("STR 22 (+6)", "STR 99 (+9)").replace("8 (3,900 XP)", "99");
    const e = errorsOf(text);
    expect(e).toHaveLength(3);
    const problem = statblockProblem(text);
    expect(problem).toMatch(/^The stat block can't be saved yet\./);
    for (const part of ["Armor Class", "STR must be", "Challenge"]) expect(problem).toContain(part);
  });
});
