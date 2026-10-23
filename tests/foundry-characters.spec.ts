import { randomUUID } from "node:crypto";
import { expect, test, type Browser } from "@playwright/test";
import { validateAndDerive, type CharacterInput } from "../src/lib/character/engine";
import { FoundryImportError, armorClass, fit, htmlToText, maxHitPoints, toCharacterInput, type FoundryActor, type FoundryItem } from "../src/lib/character/foundry";
import { closeDbHelpers, createTestPlayer, deleteTestUser, query } from "./db-helpers";

/**
 * Foundry player characters: the mapping from a Foundry dnd5e actor to a sheet
 * (scores, skills, AC, HP, size and words kept as Foundry has them), the
 * engine's "imported" method, and the rule that only the DM's import writes one.
 * The fixtures are made up; no Foundry or licensed content is copied here.
 */

const PASSWORD = "correct horse battery staple 42";
const SYNCED = "2026-10-23T03:00:00.000Z";
const users: string[] = [];

const ability = (value: number) => ({ value, proficient: 0 });
const skill = (value: number) => ({ value, ability: "dex" });

function item(type: string, name: string, system: Record<string, unknown> = {}, effects: Record<string, unknown>[] = []): FoundryItem {
  return { _id: randomUUID().replace(/-/g, "").slice(0, 16), type, name, system, effects };
}

/** A level 4 fighter-style character with heavy armour, a +1 shield, two spells and some gear. */
function actor(over: Partial<FoundryActor> = {}, extraItems: FoundryItem[] = []): FoundryActor {
  return {
    _id: "zzActor000000001",
    name: "Zz Brannoc Vell",
    type: "character",
    system: {
      abilities: { str: ability(16), dex: ability(14), con: ability(15), int: ability(10), wis: ability(12), cha: ability(8) },
      skills: { ath: skill(1), prc: skill(1), per: skill(0), ste: skill(0.5), itm: skill(2) },
      attributes: { hp: { value: 30, max: null, bonuses: {} }, ac: { calc: "default", flat: null }, movement: { walk: null } },
      details: {
        alignment: "Lawful Good",
        faith: "The Lantern",
        ideal: "<p>Duty first.</p>",
        bond: "",
        flaw: "<p>Too proud &amp; too loud.</p>",
        trait: "",
        appearance: "<p>A scar across the jaw.</p>",
        age: "31",
        eyes: "grey",
        hair: "",
        biography: { value: "<p>Born in a border fort.</p><p>Left it&nbsp;at sixteen.</p>" },
      },
      traits: { languages: { value: ["standard:common", "standard:dwarvish"] } },
    },
    items: [
      item("class", "Fighter", { identifier: "fighter", levels: 4, hitDice: "d10", advancement: [{ type: "HitPoints", value: { 1: "max", 2: 6, 3: 5, 4: 7 } }] }),
      item("subclass", "Champion"),
      item("race", "Zz Hill Folk", { movement: { walk: 25 }, advancement: [{ type: "Size", value: { size: "sm" } }] }),
      item("background", "Soldier"),
      item("feat", "Zz Sturdy", { type: { value: "feat" } }),
      item("feat", "Second Wind", { type: { value: "class" } }),
      item("equipment", "Zz Plate", { type: { value: "heavy" }, armor: { value: 18 }, equipped: true }),
      item("equipment", "Zz Ward Shield", { type: { value: "shield" }, armor: { value: 2, magicalBonus: 1 }, equipped: true }),
      item("weapon", "Longsword"),
      item("consumable", "Zz Ration", { quantity: 3 }),
      item("spell", "Zz Spark", { level: 0 }),
      item("spell", "Zz Ward", { level: 1 }),
      ...extraItems,
    ],
    ...over,
  };
}

const map = (a: FoundryActor) => toCharacterInput({ username: "Zz Player", actor: a }, SYNCED);
const derive = (input: CharacterInput) => validateAndDerive(input);

test.afterAll(async () => {
  for (const id of users) await deleteTestUser(id);
  await closeDbHelpers();
});

test.describe("mapping a Foundry character", () => {
  test("[TC-FCHR-001] scores, skills, class, heritage, AC and HP come over as Foundry has them", () => {
    const input = map(actor());
    expect(input.method).toBe("imported");
    expect(input.imported).toMatchObject({ source: "foundry", sourceId: "zzActor000000001", size: "Small", syncedAt: SYNCED, scores: { str: 16, dex: 14, con: 15, int: 10, wis: 12, cha: 8 } });
    // Proficient (1) and expertise (2) count; half proficiency (0.5) and none do not. "per" is Persuasion, "prc" Perception.
    expect([...(input.imported?.skills ?? [])].sort()).toEqual(["athletics", "intimidation", "perception"]);
    expect(input).toMatchObject({ classId: "fighter", level: 4, backgroundName: "Soldier", race: { raceId: "other", other: { name: "Zz Hill Folk", bonuses: {}, speed: 25 } } });
    // Heavy armour ignores DEX; the shield adds its value and its magic.
    expect(input.armorClass).toBe(18 + 3);
    // 10 + 6 + 5 + 7 from Foundry's record, plus CON +2 at each of 4 levels.
    expect(input.hp).toEqual({ mode: "manual", total: 28 + 8 });
  });

  test("[TC-FCHR-002] the words, feats, languages, spells and gear are kept as readable text", () => {
    const input = map(actor());
    expect(input.concept).toBe("Fighter 4 (Champion). Lawful Good. Feats: Zz Sturdy. Languages: Common, Dwarvish");
    expect(input.backstory).toBe("Born in a border fort.\n\nLeft it at sixteen.");
    expect(input.ideals).toBe("Duty first.");
    expect(input.flaws).toBe("Too proud & too loud.");
    expect(input.appearance).toBe("Age 31 · grey eyes\n\nA scar across the jaw.");
    expect(input.worship).toBe("The Lantern");
    expect(input.citizenship).toBe("none");
    expect(input.equipment).toContain("Weapons: Longsword");
    expect(input.equipment).toContain("Armour and clothing: Zz Plate, Zz Ward Shield");
    expect(input.equipment).toContain("Consumables: Zz Ration ×3");
    expect(input.equipment).toContain("Spells\nCantrips: Zz Spark\n1st: Zz Ward");
    // Class features are not feats.
    expect(input.concept).not.toContain("Second Wind");
  });

  test("[TC-FCHR-003] AC follows Foundry's rules: armour weights, no armour, and a formula set by an item effect", () => {
    const base = actor();
    const without = (names: string[]) => ({ ...base, items: base.items.filter((i) => !names.includes(i.name)) });
    const scores = { str: 16, dex: 14, con: 15, int: 10, wis: 12, cha: 8 };
    const withArmour = (type: string, value: number) => ({ ...without(["Zz Plate", "Zz Ward Shield"]), items: [...without(["Zz Plate", "Zz Ward Shield"]).items, item("equipment", "Zz Coat", { type: { value: type }, armor: { value }, equipped: true })] });

    expect(armorClass(without(["Zz Plate", "Zz Ward Shield"]), scores)).toBe(10 + 2);
    expect(armorClass(withArmour("light", 12), scores)).toBe(12 + 2);
    expect(armorClass(withArmour("medium", 14), { ...scores, dex: 18 })).toBe(14 + 2);
    // An unequipped shield does nothing.
    const stowed = { ...base, items: base.items.map((i) => (i.name === "Zz Ward Shield" ? { ...i, system: { ...i.system, equipped: false } } : i)) };
    expect(armorClass(stowed, scores)).toBe(18);
    // Foundry v14 keeps an effect's changes under `system`: Unarmored Defense switches the formula to 10 + DEX + CON.
    const barbarian = { ...without(["Zz Plate", "Zz Ward Shield"]), items: [...without(["Zz Plate", "Zz Ward Shield"]).items, item("feat", "Zz Unarmored", {}, [{ disabled: false, transfer: true, system: { changes: [{ key: "system.attributes.ac.calc", value: "unarmoredBarb" }] } }])] };
    expect(armorClass(barbarian, scores)).toBe(10 + 2 + 2);
    // A disabled effect is ignored.
    const off = { ...barbarian, items: barbarian.items.map((i) => (i.name === "Zz Unarmored" ? { ...i, effects: [{ ...i.effects![0], disabled: true }] } : i)) };
    expect(armorClass(off, scores)).toBe(12);
  });

  test("[TC-FCHR-004] HP: Foundry's stated maximum wins, and current HP above the record lifts it", () => {
    const stated = actor({ system: { ...actor().system, attributes: { hp: { value: 10, max: 52 }, ac: {} } } });
    expect(maxHitPoints(stated, 15)).toBe(52);
    const hurt = actor({ system: { ...actor().system, attributes: { hp: { value: 40, max: null }, ac: {} } } });
    expect(maxHitPoints(hurt, 15)).toBe(40);
  });

  test("[TC-FCHR-005] a character the sheet cannot show is refused with its reason, not guessed", () => {
    const odd = actor({ items: actor().items.map((i) => (i.type === "class" ? { ...i, name: "Zz Artificer", system: { ...i.system, identifier: "zz-artificer" } } : i)) });
    expect(() => map(odd)).toThrow(FoundryImportError);
    expect(() => map(odd)).toThrow(/Zz Artificer/);
    const noScore = actor({ system: { ...actor().system, abilities: { str: ability(10) } } });
    expect(() => map(noScore)).toThrow(/no DEX score/);
  });

  test("[TC-FCHR-006] HTML becomes plain text and long text is cut at a word with a mark", () => {
    expect(htmlToText("<h2>Title</h2><ul><li>one</li><li>two</li></ul>a<br>b &quot;c&quot;")).toBe("Title\n\n• one\n\n• two\n\na\nb \"c\"");
    const long = "word ".repeat(1000).trim();
    const cut = fit(long, 100);
    expect(cut.length).toBeLessThanOrEqual(100);
    expect(cut.endsWith(" …")).toBe(true);
    expect(fit("short", 100)).toBe("short");
  });
});

test.describe("the imported method in the engine", () => {
  test("[TC-FCHR-007] the sheet keeps the final scores as they are, the listed skills, the size and where it came from", () => {
    const out = derive(map(actor()));
    expect(out.problems).toEqual([]);
    expect(out.sheet).toMatchObject({
      heritage: "Zz Hill Folk",
      className: "Fighter",
      scores: { str: 16, dex: 14, con: 15, int: 10, wis: 12, cha: 8 },
      armorClass: 21,
      hitPoints: 36,
      size: "Small",
      speed: 25,
      importedFrom: { source: "foundry", syncedAt: SYNCED },
    });
    const proficient = out.sheet!.skills.filter((s) => s.proficient).map((s) => s.id).sort();
    expect(proficient).toEqual(["athletics", "intimidation", "perception"]);
    expect(out.sheet!.skills.find((s) => s.id === "athletics")?.bonus).toBe(3 + 2);
    expect(out.sheet!.saves.filter((s) => s.proficient).map((s) => s.ability)).toEqual(["str", "con"]);
  });

  test("[TC-FCHR-008] imported numbers are still range-checked", () => {
    const good = map(actor());
    const bad = (patch: Partial<NonNullable<CharacterInput["imported"]>>, hp?: number) =>
      derive({ ...good, imported: { ...good.imported!, ...patch }, ...(hp === undefined ? {} : { hp: { mode: "manual" as const, total: hp } }) });
    expect(bad({ scores: { ...good.imported!.scores, str: 31 } }).problems).toContain("Imported scores are whole numbers from 1 to 30.");
    expect(bad({ scores: { ...good.imported!.scores, dex: 0 } }).ok).toBe(false);
    expect(bad({ skills: ["athletics", "athletics"] }).ok).toBe(false);
    expect(bad({ skills: ["zz-not-a-skill" as never] }).ok).toBe(false);
    expect(bad({ size: "Gigantic" as never }).ok).toBe(false);
    expect(bad({}, 999).ok).toBe(true);
    expect(bad({}, 1000).ok).toBe(false);
    expect(derive({ ...good, imported: undefined }).problems).toContain("An imported character carries its scores.");
  });
});

async function newPlayer() {
  const username = `zz-fc-${randomUUID().slice(0, 8)}`;
  const id = await createTestPlayer(username, PASSWORD);
  users.push(id);
  await query(`UPDATE users SET display_name = $2 WHERE id = $1`, [id, `Zz ${username.slice(-4)}`]);
  return { id, username };
}

async function signIn(browser: Browser, username: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  expect((await page.request.post("/api/auth/login", { data: { username, password: PASSWORD } })).ok()).toBe(true);
  return { context, page };
}

/** Writes an imported character the way scripts/import-foundry-players.ts does. */
async function insertImported(userId: string) {
  const input = map(actor());
  const sheet = derive(input).sheet!;
  const [row] = await query<{ id: string }>(`INSERT INTO characters (user_id, name, input, sheet, shared) VALUES ($1, $2, $3, $4, true) RETURNING id`, [userId, sheet.name, JSON.stringify(input), JSON.stringify(sheet)]);
  return { id: row.id, input };
}

test.describe("imported characters in the app", () => {
  test("[TC-FCHR-009] a player cannot make an imported character, so no one forges Foundry numbers", async ({ browser }) => {
    const p = await newPlayer();
    const { context, page } = await signIn(browser, p.username);
    try {
      const res = await page.request.post("/api/characters", { data: map(actor()) });
      expect(res.status()).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe("Only the DM imports characters from Foundry.");
      expect((await query(`SELECT 1 FROM characters WHERE user_id = $1`, [p.id])).length).toBe(0);
    } finally {
      await context.close();
    }
  });

  test("[TC-FCHR-010] an imported sheet is read-only to its player, who can still share it, set a home and delete it", async ({ browser }) => {
    const p = await newPlayer();
    const { id, input } = await insertImported(p.id);
    const { context, page } = await signIn(browser, p.username);
    try {
      // Overwriting with a creator character, or with the same import, is refused, and nothing changes.
      const creator: CharacterInput = { ...input, method: "point-buy", imported: undefined, race: { raceId: "human" }, classSkills: ["athletics", "perception"], backgroundSkills: ["history", "survival"], pointBuy: { extraRoll: 1, scores: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 } }, armorClass: undefined, hp: { mode: "rolled", levelRolls: [{ first: 6 }] } };
      const put = await page.request.put(`/api/characters/${id}`, { data: creator });
      expect(put.status()).toBe(409);
      expect((await page.request.put(`/api/characters/${id}`, { data: input })).status()).toBe(400);
      const [row] = await query<{ input: CharacterInput }>(`SELECT input FROM characters WHERE id = $1`, [id]);
      expect(row.input.method).toBe("imported");

      expect((await page.request.patch(`/api/characters/${id}`, { data: { shared: false } })).status()).toBe(200);
      expect((await query<{ shared: boolean }>(`SELECT shared FROM characters WHERE id = $1`, [id]))[0].shared).toBe(false);

      await page.goto(`/characters/${id}`);
      await expect(page.getByRole("heading", { name: "Zz Brannoc Vell", level: 1 })).toBeVisible();
      await expect(page.getByTestId("imported-note")).toContainText("Synced from Foundry on 23 October 2026");
      await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);
      await page.goto(`/characters/${id}/edit`);
      await expect(page).toHaveURL(new RegExp(`/characters/${id}$`));

      expect((await page.request.delete(`/api/characters/${id}`)).status()).toBe(200);
    } finally {
      await context.close();
    }
  });

  test.describe("the DM", () => {
    test.use({ storageState: "tests/.auth/dm.json" });

    test("[TC-FCHR-011] reads an imported character like any other, with its owner", async ({ request }) => {
      const p = await newPlayer();
      const { id } = await insertImported(p.id);
      const res = await request.get(`/api/characters/${id}`);
      expect(res.status()).toBe(200);
      const { character } = (await res.json()) as { character: { sheet: { importedFrom?: { source: string } } } };
      expect(character.sheet.importedFrom?.source).toBe("foundry");
      const all = (await (await request.get("/api/characters?scope=all")).json()) as { characters: { id: string; owner?: { id: string } }[] };
      expect(all.characters.find((c) => c.id === id)?.owner?.id).toBe(p.id);
    });
  });
});
