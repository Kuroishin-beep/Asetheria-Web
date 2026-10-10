import { expect, test } from "@playwright/test";
import { validateAndDerive, rollSet, type Scores } from "../src/lib/character/engine";
import { emptyDraft, finalConScore, fromInput, furthestStep, isStepComplete, loadDraft, stepProblems, STEPS, toInput, type Draft } from "../src/lib/character/draft";
import { STANDARD_ARRAYS } from "../src/lib/character/house-rules";
import { allWikidotLinks, backgroundLink, classLink, heritageLink, isAllowedWikidotUrl, STEP_LINKS, wikidotSearch, WIKIDOT_HOST } from "../src/lib/character/links";
import { BACKGROUND_NAMES, CLASSES, RACES } from "../src/lib/character/srd";
import { PUBLIC_EMPIRES } from "../src/lib/character/public-options";

/**
 * Phase 11 (pure parts): the wizard's working copy, its per-step rules, how it
 * is read back from storage, and the table of Wikidot links.
 */

const scores = (str: number, dex: number, con: number, int: number, wis: number, cha: number): Scores => ({ str, dex, con, int, wis, cha });

/** A draft that is complete and valid at every step. */
function complete(patch: Partial<Draft> = {}): Draft {
  return {
    ...emptyDraft(),
    name: "Test Hero",
    raceId: "human",
    classId: "fighter",
    level: 1,
    backgroundName: "Soldier",
    method: "point-buy",
    pbExtraRoll: 1,
    pbScores: scores(15, 13, 14, 8, 12, 10),
    classSkills: ["athletics", "perception"],
    backgroundSkills: ["survival", "history"],
    citizenship: "none",
    ...patch,
  };
}

test.describe("steps and the draft", () => {
  test("[TC-CHRD-001] there are twelve steps ending in the review, each with a unique id", () => {
    expect(STEPS).toHaveLength(12);
    expect(STEPS[STEPS.length - 1].id).toBe("review");
    expect(new Set(STEPS.map((s) => s.id)).size).toBe(12);
  });

  test("[TC-CHRD-002] a fresh draft asks for things in order: nothing past the first step is reachable", () => {
    const d = emptyDraft();
    expect(furthestStep(d)).toBe(0);
    expect(stepProblems(d, "who").length).toBeGreaterThan(0);
    expect(stepProblems(d, "heritage").length).toBeGreaterThan(0);
    expect(stepProblems(d, "class").length).toBeGreaterThan(0);
    expect(stepProblems(d, "background").length).toBeGreaterThan(0);
    expect(stepProblems(d, "scores").length).toBeGreaterThan(0);
    expect(stepProblems(d, "skills")).toEqual(["Choose 2 background skills (you have 0)."]); // no class yet, so only the background picks are asked for
    expect(stepProblems(d, "hp").length).toBeGreaterThan(0);
    for (const free of ["equipment", "worship", "personality", "review"] as const) expect(stepProblems(d, free)).toEqual([]);
  });

  test("[TC-CHRD-003] a complete draft passes every step and reaches the review", () => {
    const d = complete();
    for (const s of STEPS) expect(stepProblems(d, s.id), s.id).toEqual([]);
    expect(furthestStep(d)).toBe(STEPS.length - 1);
    expect(validateAndDerive(toInput(d)).ok).toBe(true);
  });

  test("[TC-CHRD-004] each step's rule is enforced: name, heritage, class and level, background, skills, citizenship, armor class", () => {
    expect(isStepComplete(complete({ name: "   " }), "who")).toBe(false);
    expect(isStepComplete(complete({ name: "x".repeat(81) }), "who")).toBe(false);
    expect(isStepComplete(complete({ raceId: "half-elf", chosenBonuses: ["str"] }), "heritage")).toBe(false);
    expect(isStepComplete(complete({ raceId: "half-elf", chosenBonuses: ["str", "dex"] }), "heritage")).toBe(true);
    expect(isStepComplete(complete({ raceId: "other", otherName: "", otherBonuses: {}, otherSpeed: 30 }), "heritage")).toBe(false);
    expect(isStepComplete(complete({ classId: "nope" }), "class")).toBe(false);
    expect(isStepComplete(complete({ level: 0 }), "class")).toBe(false);
    expect(isStepComplete(complete({ level: 21 }), "class")).toBe(false);
    expect(isStepComplete(complete({ level: 20 }), "class")).toBe(true);
    expect(isStepComplete(complete({ backgroundName: "" }), "background")).toBe(false);
    expect(isStepComplete(complete({ classSkills: ["athletics"] }), "skills")).toBe(false);
    expect(isStepComplete(complete({ classSkills: ["athletics", "arcana"] }), "skills")).toBe(false);
    expect(isStepComplete(complete({ backgroundSkills: ["athletics", "history"] }), "skills")).toBe(false);
    expect(isStepComplete(complete({ citizenship: "atlantis" }), "citizenship")).toBe(false);
    expect(isStepComplete(complete({ citizenship: "hellenoria" }), "citizenship")).toBe(true);
    expect(isStepComplete(complete({ armorClass: 31 }), "equipment")).toBe(false);
    expect(isStepComplete(complete({ armorClass: 0 }), "equipment")).toBe(true);
  });

  test("[TC-CHRD-005] the ability-score step needs the right inputs for each method", () => {
    expect(stepProblems(complete({ method: "" }), "scores").length).toBeGreaterThan(0);
    expect(stepProblems(complete({ pbExtraRoll: 0 }), "scores")).toEqual(["Roll your bonus die first."]);
    expect(stepProblems(complete({ pbScores: scores(15, 15, 15, 15, 15, 15) }), "scores").length).toBeGreaterThan(0);
    expect(stepProblems(complete({ method: "roll", rolls: [] }), "scores").length).toBeGreaterThan(0);
    expect(stepProblems(complete({ method: "standard-array", arrayIndex: -1 }), "scores").length).toBeGreaterThan(0);
    expect(stepProblems(complete({ method: "standard-array", arrayIndex: 0, arrayAssignment: scores(15, 14, 13, 12, 10, 8) }), "scores")).toEqual([]);
    expect(stepProblems(complete({ method: "standard-array", arrayIndex: 0, arrayAssignment: scores(15, 15, 13, 12, 10, 8) }), "scores").length).toBeGreaterThan(0);
  });

  test("[TC-CHRD-006] the hit-point step needs the right number of rolls, or a manual total in range", () => {
    expect(stepProblems(complete({ level: 4, levelRolls: [] }), "hp").length).toBeGreaterThan(0);
    expect(stepProblems(complete({ level: 4, levelRolls: [{ first: 6 }] }), "hp")).toEqual([]);
    expect(stepProblems(complete({ level: 4, levelRolls: [{ first: 6, reroll: 3 }] }), "hp").length).toBeGreaterThan(0);
    expect(stepProblems(complete({ hpMode: "manual", manualHp: 0 }), "hp").length).toBeGreaterThan(0);
    expect(stepProblems(complete({ hpMode: "manual", manualHp: 12 }), "hp")).toEqual([]);
    expect(stepProblems(complete({ hpMode: "manual", manualHp: 13 }), "hp").length).toBeGreaterThan(0);
  });

  test("[TC-CHRD-007] Constitution for hit points includes the heritage bonus (a Hill Dwarf's +2)", () => {
    expect(finalConScore(complete({ raceId: "human" }))).toBe(15);
    expect(finalConScore(complete({ raceId: "hill-dwarf" }))).toBe(16);
    expect(finalConScore(complete({ raceId: "" }))).toBe(14);
  });

  test("[TC-CHRD-008] the furthest reachable step stops at the first incomplete one", () => {
    expect(furthestStep(complete({ name: "" }))).toBe(0);
    expect(furthestStep(complete({ classId: "" }))).toBe(2);
    expect(furthestStep(complete({ classSkills: [] }))).toBe(5);
  });
});

test.describe("draft <-> character", () => {
  test("[TC-CHRD-009] a draft becomes a character and back without loss, for each method", () => {
    const rolled = rollSet();
    const variants: Draft[] = [
      complete(),
      complete({ method: "standard-array", arrayIndex: 1, arrayAssignment: scores(16, 13, 13, 12, 10, 7) }),
      complete({ method: "roll", rolls: [rolled], rollAssignment: scores(rolled.scores[0], rolled.scores[1], rolled.scores[2], rolled.scores[3], rolled.scores[4], rolled.scores[5]) }),
      complete({ level: 5, levelRolls: [{ first: 1, reroll: 4 }, { first: 9 }], armorClass: 17, citizenship: "acheaoria", worship: "Somebody", equipment: "A sword" }),
      complete({ raceId: "other", otherName: "Sea-kin", otherBonuses: { con: 2, dex: 1 }, otherSpeed: 35 }),
      complete({ raceId: "half-elf", chosenBonuses: ["dex", "wis"] }),
      complete({ hpMode: "manual", manualHp: 9 }),
    ];
    for (const d of variants) {
      const input = toInput(d);
      const back = fromInput(input);
      expect(toInput(back)).toEqual(input);
      expect(back.step).toBe(STEPS.length - 1);
    }
  });

  test("[TC-CHRD-010] only the chosen method's data goes into the character", () => {
    const input = toInput(complete({ method: "standard-array", arrayIndex: 0, arrayAssignment: scores(15, 14, 13, 12, 10, 8) }));
    expect(input.array).toBeDefined();
    expect(input.pointBuy).toBeUndefined();
    expect(input.roll).toBeUndefined();
  });
});

test.describe("reading storage safely", () => {
  test("[TC-CHRD-011] a stored draft round-trips", () => {
    const d = complete({ step: 4 });
    expect(loadDraft(JSON.stringify(d))).toEqual(d);
  });

  test("[TC-CHRD-012] nothing usable (null, empty, garbage, the wrong shape, extra keys, wrong types, huge text) gives a clean draft", () => {
    const clean = emptyDraft();
    for (const raw of [null, undefined, "", "{", "not json", "[]", "null", "42", '{"name":42}', JSON.stringify({ ...emptyDraft(), step: 99 }), JSON.stringify({ ...emptyDraft(), extra: true }), JSON.stringify({ ...emptyDraft(), name: "x".repeat(500) }), JSON.stringify({ ...emptyDraft(), method: "teleport" }), JSON.stringify({ ...emptyDraft(), classSkills: ["not-a-skill"] }), JSON.stringify({ ...emptyDraft(), backstory: "y".repeat(5000) })]) {
      expect(loadDraft(raw as string | null | undefined), String(raw).slice(0, 40)).toEqual(clean);
    }
  });
});

test.describe("Wikidot links (links only, one host, known page shapes)", () => {
  test("[TC-CHRD-013] every link is https on dnd5e.wikidot.com and matches an allowed page shape", () => {
    const links = allWikidotLinks();
    expect(links.length).toBeGreaterThan(40);
    for (const href of links) {
      expect(href.startsWith(`https://${WIKIDOT_HOST}/`), href).toBe(true);
      expect(isAllowedWikidotUrl(href), href).toBe(true);
    }
  });

  test("[TC-CHRD-014] hostile or foreign addresses are refused", () => {
    for (const bad of [
      "http://dnd5e.wikidot.com/",
      "https://dnd5e.wikidot.com.evil.example/",
      "https://evil.example/https://dnd5e.wikidot.com/",
      "https://user@dnd5e.wikidot.com/",
      "https://dnd5e.wikidot.com:8443/",
      "https://dnd5e.wikidot.com/fighter?x=1",
      "https://dnd5e.wikidot.com/fighter#top",
      "https://dnd5e.wikidot.com/unknown-page",
      "https://dnd5e.wikidot.com/lineage:UPPER",
      "javascript:alert(1)",
      "//dnd5e.wikidot.com/",
      "",
      "not a url",
    ]) {
      expect(isAllowedWikidotUrl(bad), bad).toBe(false);
    }
  });

  test("[TC-CHRD-015] every race, class and background resolves to a link (or none, for a custom one), and subraces use their parent's page", () => {
    for (const r of RACES) expect(heritageLink(r.id), r.id).not.toBeNull();
    for (const c of CLASSES) expect(classLink(c.id)?.href, c.id).toBe(`https://${WIKIDOT_HOST}/${c.id}`);
    for (const b of BACKGROUND_NAMES) expect(backgroundLink(b), b).not.toBeNull();
    expect(heritageLink("hill-dwarf")?.href).toBe(`https://${WIKIDOT_HOST}/lineage:dwarf`);
    expect(heritageLink("rock-gnome")?.href).toBe(`https://${WIKIDOT_HOST}/lineage:gnome`);
    expect(heritageLink("other")).toBeNull();
    expect(backgroundLink("Something I made up")).toBeNull();
    expect(classLink("necromancer")).toBeNull();
  });

  test("[TC-CHRD-016] a search link encodes its words, and each step with an explainer has links", () => {
    expect(wikidotSearch("ability scores")).toBe(`https://${WIKIDOT_HOST}/search:site/q/ability%20scores`);
    expect(isAllowedWikidotUrl(wikidotSearch("death saving throws"))).toBe(true);
    for (const id of ["who", "heritage", "class", "background", "scores", "skills", "hp", "equipment", "review"]) expect(STEP_LINKS[id].length, id).toBeGreaterThan(0);
  });
});

test.describe("public options", () => {
  test("[TC-CHRD-017] the signed-out creator offers exactly the three empires, as constants", () => {
    expect(PUBLIC_EMPIRES.map((e) => e.id)).toEqual(["imperium-invicta", "hellenoria", "acheaoria"]);
    for (const e of PUBLIC_EMPIRES) {
      expect(e.summary.length).toBeGreaterThan(20);
      expect(e.href).toBeUndefined();
    }
  });

  test("[TC-CHRD-018] the standard arrays used by the wizard are the three from the compendium", () => {
    expect(STANDARD_ARRAYS).toHaveLength(3);
  });
});
