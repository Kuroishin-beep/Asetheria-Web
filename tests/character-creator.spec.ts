import fs from "node:fs";
import { tc } from "./case-id";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { closeDbHelpers, createTestPlayer, deleteTestUser, query } from "./db-helpers";

/**
 * Phase 11: the character wizard end to end, signed out and signed in. Dice are
 * made deterministic by feeding the browser's secure random source, so the house
 * rules (reroll below 72, the one binding reroll, rerolling a 1) are driven
 * through the real screens with exact numbers.
 */

const PASSWORD = "correct horse battery staple 42";
const tag = randomUUID().slice(0, 8);
const users: string[] = [];
const SECRET_GOD = `Zz Secret God ${tag}`;
const OPEN_GOD = `Zz Open God ${tag}`;

const next = (page: Page) => page.getByTestId("next").click();
const title = (page: Page) => page.getByTestId("step-title");

/** Four dice per score (the fourth always the lowest) so the top three sum to each given score. */
function diceFor(values: number[]): number[] {
  return values.flatMap((v) => {
    const a = Math.min(6, Math.max(1, Math.ceil(v / 3)));
    const rest = v - a;
    const b = Math.min(a, Math.max(1, Math.ceil(rest / 2)));
    return [a, b, rest - b, 1];
  });
}

async function stubDice(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __dice: number[] };
    w.__dice = [];
    const real = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = ((arr: ArrayBufferView) => {
      if (w.__dice.length > 0 && arr instanceof Uint32Array && arr.length === 1) {
        arr[0] = (w.__dice.shift() as number) - 1;
        return arr;
      }
      return real(arr as never);
    }) as typeof crypto.getRandomValues;
  });
}
const queueDice = (page: Page, dice: number[]) => page.evaluate((d) => (window as unknown as { __dice: number[] }).__dice.push(...d), dice);

async function open(page: Page, url = "/create-character") {
  await page.goto(url);
  await expect(page.getByTestId("creator")).toHaveAttribute("data-ready", "true");
}

async function stepWho(page: Page, name = "Aelith Vale") {
  await page.getByLabel("Character name").fill(name);
  await next(page);
}
async function stepHeritage(page: Page, race: RegExp = /^Human/) {
  await page.getByRole("radio", { name: race }).click();
  await next(page);
}
async function stepClass(page: Page, klass: RegExp = /^Fighter/, level?: number) {
  await page.getByRole("radio", { name: klass }).click();
  if (level !== undefined) await page.getByLabel("Level").fill(String(level));
  await next(page);
}
async function stepBackground(page: Page, name = "Soldier") {
  await page.getByLabel("Your background").selectOption(name);
  await next(page);
}
async function pickPointBuy(page: Page) {
  await page.getByRole("radio", { name: /^Point buy/ }).click();
  await page.getByTestId("pb-roll").click();
  const raise = async (label: string, times: number) => {
    for (let i = 0; i < times; i++) await page.getByRole("button", { name: `Raise ${label}` }).click();
  };
  await raise("Strength", 7); // 8 -> 15 costs 9
  await raise("Dexterity", 5); // 8 -> 13 costs 5
  await raise("Constitution", 6); // 8 -> 14 costs 7
}
async function pickArray(page: Page) {
  await page.getByRole("radio", { name: /^Standard array/ }).click();
  await page.locator("#array-0").click();
  for (const [a, v] of [["str", "15"], ["dex", "14"], ["con", "13"], ["int", "12"], ["wis", "10"], ["cha", "8"]]) await page.locator(`#assign-${a}`).selectOption(v);
}
async function stepSkills(page: Page) {
  await page.locator("#cs-athletics").check();
  await page.locator("#cs-perception").check();
  await page.locator("#bs-survival").check();
  await page.locator("#bs-history").check();
  await next(page);
}
async function skipTo(page: Page, id: string) {
  // After a step is valid, Next goes on; used for the steps that need no answer.
  for (let i = 0; i < 12; i++) {
    if (((await title(page).getAttribute("data-testid")) ?? "") === id) return;
    await next(page);
  }
}

/** Runs the whole wizard to the review with the standard array (a human fighter). */
async function buildFighter(page: Page, name = "Aelith Vale") {
  await stepWho(page, name);
  await stepHeritage(page);
  await stepClass(page);
  await stepBackground(page);
  await pickArray(page);
  await next(page);
  await stepSkills(page);
  await next(page); // hit points: level 1 needs no roll
  await next(page); // equipment
  await page.locator("#cit-hellenoria").click();
  await next(page);
  await next(page); // worship
  await next(page); // personality
  await expect(title(page)).toHaveText("Review your sheet");
}

test.beforeAll(async () => {
  for (const [name, visibility] of [[SECRET_GOD, "secret"], [OPEN_GOD, "public"]]) {
    await query(`INSERT INTO entries (slug, kind, name, summary, visibility, source_path) VALUES ($1, 'deity', $2, 'A fixture god.', $3, 'test: character-creator')`, [name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name, visibility]);
  }
});

test.afterAll(async () => {
  await query(`DELETE FROM entries WHERE source_path = 'test: character-creator'`);
  for (const id of users) await deleteTestUser(id);
  await closeDbHelpers();
});

async function newPlayer(grants: string[] = []) {
  const username = `zz-cc-${randomUUID().slice(0, 8)}`;
  const id = await createTestPlayer(username, PASSWORD);
  users.push(id);
  await query(`UPDATE users SET display_name = $2 WHERE id = $1`, [id, `Zz ${username.slice(-4)}`]);
  for (const kind of grants) await query(`INSERT INTO entry_grants (user_id, kind, granted) VALUES ($1, $2, true)`, [id, kind]);
  return { id, username };
}
async function login(browser: Browser, username: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  expect((await page.request.post("/api/auth/login", { data: { username, password: PASSWORD } })).ok()).toBe(true);
  return { context, page };
}

test.describe("the public wizard (signed out)", () => {
  test("[TC-CHRC-001] opens without signing in, and reads nothing from the codex: no API calls, no entry names", async ({ page }) => {
    const apiCalls: string[] = [];
    page.on("request", (r) => {
      const p = new URL(r.url()).pathname;
      if (p.startsWith("/api/")) apiCalls.push(p);
    });
    const res = await page.goto("/create-character");
    expect(res?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/create-character");
    await expect(page.getByRole("heading", { level: 1, name: "Forge a hero" })).toBeVisible();
    await expect(page.getByTestId("creator")).toHaveAttribute("data-ready", "true");
    await expect(page.getByRole("note")).toContainText("You are not signed in");

    const html = await page.content();
    const names = await query<{ name: string }>(`SELECT name FROM entries WHERE archived_at IS NULL AND kind IN ('deity','empire','npc','location') AND name NOT IN ('Imperium Invicta','Hellenoria','Acheaoria') ORDER BY random() LIMIT 40`); // the three empires are named on the page on purpose, as constants
    for (const { name } of names) expect(html.includes(name), `leaked: ${name}`).toBe(false);
    for (const secret of [SECRET_GOD, OPEN_GOD]) expect(html).not.toContain(secret);

    await open(page);
    await stepWho(page);
    await stepHeritage(page);
    await stepClass(page);
    expect(apiCalls).toEqual([]);
  });

  test("[TC-CHRC-002] the worship step is free text with no god list, and the citizenship step shows only the three empires", async ({ page }) => {
    await open(page);
    await buildFighter(page);
    await page.getByRole("button", { name: /^10\. Worship/ }).click();
    await expect(page.getByLabel(/Whom do you follow/)).toBeVisible();
    expect(await page.locator("select").count()).toBe(0);
    expect(await page.content()).not.toContain(OPEN_GOD);
    await page.getByRole("button", { name: /^9\. Citizenship/ }).click();
    await expect(page.getByRole("radio")).toHaveCount(4);
    for (const empire of ["Imperium Invicta", "Hellenoria", "Acheaoria"]) await expect(page.getByText(empire, { exact: true }).first()).toBeVisible();
  });

  test("[TC-CHRC-003] a full run with the standard array ends on a sheet whose numbers follow the rules", async ({ page }) => {
    await open(page);
    await buildFighter(page);
    const sheet = page.getByTestId("character-sheet");
    await expect(sheet).toBeVisible();
    await expect(page.getByTestId("sheet-name")).toHaveText("Aelith Vale");
    // Array 15/14/13/12/10/8 plus a human's +1 everywhere: 16/15/14/13/11/9.
    await expect(page.getByTestId("ability-str")).toContainText("+3");
    await expect(page.getByTestId("ability-str")).toContainText("16");
    await expect(page.getByTestId("ability-dex")).toContainText("+2");
    await expect(page.getByTestId("ability-con")).toContainText("14");
    await expect(page.getByTestId("ability-cha")).toContainText("9");
    await expect(page.getByTestId("save-str")).toContainText("+5");
    await expect(page.getByTestId("skill-athletics")).toContainText("+5");
    await expect(page.getByTestId("skill-perception")).toContainText("+2");
    await expect(sheet.getByText("Passive Perception").locator("..")).toContainText("12");
    await expect(sheet.getByText("Hit points").locator("..")).toContainText("12");
    await expect(sheet.getByText("Armor class").locator("..")).toContainText("12");
    await expect(sheet).toContainText("Hellenoria");
    await expect(sheet).toContainText("Combat flanking");
  });

  test("[TC-CHRC-004] point buy: the bonus die is rolled once, the budget follows it, and the limits hold", async ({ page }) => {
    await stubDice(page);
    await open(page);
    await stepWho(page);
    await stepHeritage(page);
    await stepClass(page);
    await stepBackground(page);
    await page.getByRole("radio", { name: /^Point buy/ }).click();
    await queueDice(page, [3]);
    await page.getByTestId("pb-roll").click();
    await expect(page.getByTestId("pb-budget")).toContainText("27 + 2 + bonus roll 3 = 32");
    await expect(page.getByTestId("pb-roll")).toHaveCount(0);

    // Reload: the same roll comes back; refreshing is not a reroll.
    await page.reload();
    await expect(page.getByTestId("creator")).toHaveAttribute("data-ready", "true");
    await expect(page.getByTestId("pb-budget")).toContainText("bonus roll 3 = 32");

    // The floor of 6 (8 to 6 is two steps) and the ceiling of 15.
    for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "Lower Intelligence" }).click();
    await expect(page.getByTestId("pb-int")).toHaveText("6");
    await expect(page.getByRole("button", { name: "Lower Intelligence" })).toBeDisabled();
    for (let i = 0; i < 7; i++) await page.getByRole("button", { name: "Raise Strength" }).click();
    await expect(page.getByTestId("pb-str")).toHaveText("15");
    await expect(page.getByRole("button", { name: "Raise Strength" })).toBeDisabled();

    // Spend until nothing more can be afforded: remaining never goes below zero.
    for (const a of ["Dexterity", "Constitution", "Wisdom", "Charisma"]) {
      for (let i = 0; i < 7; i++) {
        const up = page.getByRole("button", { name: `Raise ${a}` });
        if (await up.isDisabled()) break;
        await up.click();
      }
    }
    const left = Number(await page.getByTestId("pb-remaining").textContent());
    expect(left).toBeGreaterThanOrEqual(0);
    await next(page);
    await expect(title(page)).toHaveText("Skills");
  });

  test("[TC-CHRC-005] rolling: under 72 forces a reroll, 72 is accepted, the one extra reroll is binding even when lower", async ({ page }) => {
    await stubDice(page);
    await open(page);
    await stepWho(page);
    await stepHeritage(page);
    await stepClass(page);
    await stepBackground(page);
    await page.getByRole("radio", { name: /^Roll the dice/ }).click();

    await queueDice(page, diceFor([12, 12, 12, 12, 12, 11])); // 71
    await page.getByTestId("roll-first").click();
    await expect(page.getByTestId("roll-status")).toContainText("Total 71");
    await expect(page.getByTestId("roll-status")).toContainText("under 72");
    await expect(page.getByTestId("roll-again")).toBeVisible();
    await next(page);
    await expect(page.getByTestId("step-problems")).toContainText("72");
    await expect(title(page)).toHaveText("Ability scores");

    await queueDice(page, diceFor([12, 12, 12, 12, 12, 12])); // 72
    await page.getByTestId("roll-again").click();
    await expect(page.getByTestId("roll-status")).toContainText("Total 72");
    await expect(page.getByTestId("roll-status")).toContainText("Keep it, or reroll once more");
    await expect(page.getByTestId("roll-optional")).toBeVisible();

    // The extra reroll asks first, then is final, even though it is lower.
    await page.getByTestId("roll-optional").click();
    await expect(page.getByRole("alertdialog", { name: "Confirm the reroll" })).toContainText("must keep the new rolls");
    await queueDice(page, diceFor([9, 9, 9, 9, 9, 9])); // 54
    await page.getByTestId("roll-confirm").click();
    await expect(page.getByTestId("roll-status")).toContainText("Total 54");
    await expect(page.getByTestId("roll-status")).toContainText("you must keep it");
    await expect(page.getByTestId("roll-optional")).toHaveCount(0);
    await expect(page.getByTestId("roll-again")).toHaveCount(0);

    await page.getByRole("button", { name: "Assign in the order rolled" }).click();
    await expect(page.getByTestId("final-str")).toContainText("9 +1 = 10");
    await next(page);
    await expect(title(page)).toHaveText("Skills");
  });

  test("[TC-CHRC-006] rolling: declining the optional reroll keeps the 72, and the six scores can be given to any ability", async ({ page }) => {
    await stubDice(page);
    await open(page);
    await stepWho(page);
    await stepHeritage(page);
    await stepClass(page);
    await stepBackground(page);
    await page.getByRole("radio", { name: /^Roll the dice/ }).click();
    await queueDice(page, diceFor([15, 14, 13, 12, 10, 8])); // 72
    await page.getByTestId("roll-first").click();
    await page.getByTestId("roll-optional").click();
    await page.getByRole("button", { name: "Keep these" }).click();
    await expect(page.getByTestId("roll-optional")).toBeVisible();

    // Give the 15 to Charisma and the 8 to Strength.
    await page.locator("#assign-cha").selectOption("15");
    await page.locator("#assign-str").selectOption("8");
    await expect(page.locator("#assign-dex option[value='15']")).toBeDisabled(); // already used
    for (const [a, v] of [["dex", "14"], ["con", "13"], ["int", "12"], ["wis", "10"]]) await page.locator(`#assign-${a}`).selectOption(v);
    await expect(page.getByTestId("final-cha")).toContainText("16");
    await next(page);
    await expect(title(page)).toHaveText("Skills");
  });

  test("[TC-CHRC-007] hit points: levels 1 to 3 are maxed, level 4 is rolled, and a 1 may be rerolled once and the reroll stands", async ({ page }) => {
    await stubDice(page);
    await open(page);
    await stepWho(page);
    await stepHeritage(page);
    await stepClass(page, /^Fighter/, 4);
    await stepBackground(page);
    await pickArray(page);
    await next(page);
    await stepSkills(page);
    await expect(title(page)).toHaveText("Hit points");

    await queueDice(page, [1]); // level 4 comes up a 1
    await page.getByTestId("hp-roll").click();
    await expect(page.getByRole("list", { name: "Rolled levels" })).toContainText("rolled 1");
    await queueDice(page, [1]); // and the reroll is another 1: it stands
    await page.getByRole("button", { name: /Reroll this 1/ }).click();
    await expect(page.getByRole("list", { name: "Rolled levels" })).toContainText("rerolled 1 (kept)");
    await expect(page.getByRole("button", { name: /Reroll this 1/ })).toHaveCount(0);
    // d10, CON 13+1=14 (+2): three maxed levels (12 each) plus a 1 (+2 = 3).
    await expect(page.getByTestId("hp-total")).toContainText("39");
    await next(page);
    await expect(title(page)).toHaveText("Equipment");
  });

  test("[TC-CHRC-008] every step refuses to go on without what it needs, in plain words, and keeps you where you are", async ({ page }) => {
    await open(page);
    const refuses = async (stepName: string) => {
      await next(page);
      await expect(page.getByTestId("step-problems")).toBeVisible();
      await expect(title(page)).toHaveText(stepName);
    };
    await refuses("Who is this?");
    await page.getByLabel("Character name").fill("Aelith");
    await next(page);
    await refuses("Heritage");
    await page.getByRole("radio", { name: /^Half-Elf/ }).click();
    await refuses("Heritage"); // needs its two +1s
    await expect(page.getByTestId("heritage-choices")).toBeVisible();
    await page.locator("#bonus-str").check();
    await page.locator("#bonus-dex").check();
    await expect(page.locator("#bonus-con")).toBeDisabled(); // only two may be chosen
    await next(page);
    await refuses("Class and level");
    await page.getByRole("radio", { name: /^Wizard/ }).click();
    await page.getByLabel("Level").fill("21");
    await refuses("Class and level");
    await page.getByLabel("Level").fill("1");
    await next(page);
    await refuses("Background");
    await page.getByLabel("Your background").selectOption("Sage");
    await next(page);
    await refuses("Ability scores");
    await page.getByRole("radio", { name: /^Standard array/ }).click();
    await refuses("Ability scores");
    await page.locator("#array-0").click();
    await refuses("Ability scores"); // nothing assigned yet
  });

  test("[TC-CHRC-009] skills: the count is enforced, a class skill cannot be repeated as a background skill, and extra boxes disable", async ({ page }) => {
    await open(page);
    await stepWho(page);
    await stepHeritage(page);
    await stepClass(page, /^Fighter/);
    await stepBackground(page);
    await pickArray(page);
    await next(page);
    await expect(title(page)).toHaveText("Skills");
    await page.locator("#cs-athletics").check();
    await next(page);
    await expect(page.getByTestId("step-problems")).toContainText("Choose 2 class skills");
    await page.locator("#cs-perception").check();
    await expect(page.locator("#cs-survival")).toBeDisabled(); // two chosen: the rest lock
    await expect(page.locator("#bs-athletics")).toBeDisabled(); // already taken from the class
    await page.locator("#bs-survival").check();
    await page.locator("#bs-history").check();
    await expect(page.locator("#bs-stealth")).toBeDisabled();
    await next(page);
    await expect(title(page)).toHaveText("Hit points");
  });

  test("[TC-CHRC-010] hit points can be entered by hand within the class's ceiling, and a bad number is refused", async ({ page }) => {
    await open(page);
    await stepWho(page);
    await stepHeritage(page);
    await stepClass(page);
    await stepBackground(page);
    await pickArray(page);
    await next(page);
    await stepSkills(page);
    await page.getByRole("button", { name: "Enter my own total" }).click();
    await page.getByLabel(/^Hit points \(1 to/).fill("99");
    await next(page);
    await expect(page.getByTestId("step-problems")).toBeVisible();
    await page.getByLabel(/^Hit points \(1 to/).fill("11");
    await next(page);
    await expect(title(page)).toHaveText("Equipment");
  });

  test("[TC-CHRC-011] every step has a Learn more link to Wikidot that opens in a new tab and says so", async ({ page }) => {
    await open(page);
    const check = async () => {
      const links = page.getByRole("navigation", { name: "Learn more" }).getByRole("link");
      const n = await links.count();
      expect(n).toBeGreaterThan(0);
      for (let i = 0; i < n; i++) {
        const a = links.nth(i);
        expect(await a.getAttribute("href")).toMatch(/^https:\/\/dnd5e\.wikidot\.com\//);
        expect(await a.getAttribute("target")).toBe("_blank");
        expect(await a.getAttribute("rel")).toContain("noopener");
        expect(await a.getAttribute("rel")).toContain("noreferrer");
        await expect(a).toContainText("opens in a new tab");
      }
    };
    await check(); // who
    await page.getByLabel("Character name").fill("Aelith");
    await next(page);
    await page.getByRole("radio", { name: /^Hill Dwarf/ }).click();
    await check();
    await expect(page.getByRole("link", { name: /Hill Dwarf on Wikidot/ })).toHaveAttribute("href", "https://dnd5e.wikidot.com/lineage:dwarf");
    await next(page);
    await page.getByRole("radio", { name: /^Cleric/ }).click();
    await expect(page.getByRole("link", { name: /Cleric on Wikidot/ })).toHaveAttribute("href", "https://dnd5e.wikidot.com/cleric");
    await next(page);
    await page.getByLabel("Your background").selectOption("Noble");
    await expect(page.getByRole("link", { name: /Noble on Wikidot/ })).toHaveAttribute("href", "https://dnd5e.wikidot.com/background:noble");
    await next(page);
    await check(); // scores
  });

  test("[TC-CHRC-012] progress is kept: reload restores the answers and the step; corrupt storage starts clean; Start over clears it", async ({ page }) => {
    await open(page);
    await stepWho(page, "Remembered Rhea");
    await expect(title(page)).toHaveText("Heritage");
    await page.waitForTimeout(500); // the draft is saved shortly after each change
    await page.reload();
    await expect(page.getByTestId("creator")).toHaveAttribute("data-ready", "true");
    await expect(title(page)).toHaveText("Heritage");
    await page.getByRole("button", { name: /^1\. Who is this/ }).click();
    await expect(page.getByLabel("Character name")).toHaveValue("Remembered Rhea");

    // The page saves its draft as it is left, so the corruption is planted as the next page starts, after that save.
    await page.addInitScript(() => {
      if (sessionStorage.getItem("planted") === "1") return;
      sessionStorage.setItem("planted", "1");
      localStorage.setItem("asetheria:character-draft:v1:public", '{"name":"<script>alert(1)</script>","step":"oops"');
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.reload();
    await expect(page.getByTestId("creator")).toHaveAttribute("data-ready", "true");
    await expect(title(page)).toHaveText("Who is this?");
    await expect(page.getByLabel("Character name")).toHaveValue("");
    expect(errors).toEqual([]);

    await stepWho(page, "To be cleared");
    await page.getByRole("button", { name: "Start over" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Start over" }).click();
    await expect(title(page)).toHaveText("Who is this?");
    await expect(page.getByLabel("Character name")).toHaveValue("");
  });

  test("[TC-CHRC-013] steps ahead of the first incomplete one are locked, Back works, and the progress bar follows", async ({ page }) => {
    await open(page);
    await expect(page.getByRole("button", { name: /^5\. Ability scores/ })).toBeDisabled();
    await expect(page.getByTestId("progress")).toHaveAttribute("aria-valuenow", "1");
    await stepWho(page);
    await expect(page.getByTestId("progress")).toHaveAttribute("aria-valuenow", "2");
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(title(page)).toHaveText("Who is this?");
    await expect(page.getByRole("button", { name: "Back", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: /^1\. Who is this/ })).toHaveAttribute("aria-current", "step");
  });

  test("[TC-CHRC-014] the finished sheet downloads as JSON, and that file loads back into the wizard", async ({ page, browser }) => {
    await open(page);
    await buildFighter(page, "Download Dana");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download").click()]);
    const file = await download.path();
    const data = JSON.parse(fs.readFileSync(file!, "utf8")) as { character: { name: string }; sheet: { hitPoints: number } };
    expect(data.character.name).toBe("Download Dana");
    expect(data.sheet.hitPoints).toBe(12);

    // A new browser profile has no saved draft, as for someone opening the file on another day.
    const fresh = await browser.newContext();
    page = await fresh.newPage();
    await open(page);
    await page.getByLabel("Load a character from a JSON file").setInputFiles(file!);
    await expect(title(page)).toHaveText("Review your sheet");
    await expect(page.getByTestId("sheet-name")).toHaveText("Download Dana");

    await fresh.close();
    page = await (await browser.newContext()).newPage();
    await open(page);
    await page.getByLabel("Load a character from a JSON file").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from('{"character": {"name": "Bad", "schemaVersion": 1}}') });
    await expect(page.getByText("not a character this creator can read")).toBeVisible();
  });

  test("[TC-CHRC-015] printing hides the controls and keeps the sheet", async ({ page }) => {
    await open(page);
    await buildFighter(page);
    await page.emulateMedia({ media: "print" });
    await expect(page.getByTestId("step-actions")).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Character creation steps" })).toBeHidden();
    await expect(page.getByTestId("character-sheet")).toBeVisible();
  });

  test("[TC-CHRC-016] a heritage of 'Other' takes small bonuses and refuses wild ones", async ({ page }) => {
    await open(page);
    await stepWho(page);
    await page.getByRole("radio", { name: /^Other/ }).click();
    await page.getByLabel("Name of your heritage").fill("Sea-kin");
    await page.locator("#other-con").selectOption("2");
    await page.locator("#other-dex").selectOption("2");
    await next(page);
    await expect(page.getByTestId("step-problems")).toContainText("at most 3");
    await page.locator("#other-dex").selectOption("1");
    await page.getByLabel("Speed (feet)").fill("70");
    await next(page);
    await expect(page.getByTestId("step-problems")).toContainText("Speed");
    await page.getByLabel("Speed (feet)").fill("35");
    await next(page);
    await expect(title(page)).toHaveText("Class and level");
  });

  test("[TC-CHRC-017] a signed-in visitor is sent to the member creator instead", async ({ browser }) => {
    const p = await newPlayer();
    const { context, page } = await login(browser, p.username);
    try {
      await page.goto("/create-character");
      await expect(page).toHaveURL(/\/characters\/new$/);
    } finally {
      await context.close();
    }
  });
});

test.describe("accessibility and small screens", () => {
  const audit = async (page: Page) => {
    await page.waitForTimeout(400);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help} -> ${v.nodes[0]?.target.join(" ")}`);
  };

  for (const theme of ["dark", "light"] as const) {
    test(tc("character-creator.spec.ts", "accessibility and small screens", `no serious axe violations on the first step, the scores step and the review sheet (${theme})`), async ({ page }) => {
      test.setTimeout(90000); // three full axe audits plus the steps between them; 30 s is too tight on a busy machine
      await page.addInitScript((t) => localStorage.setItem("asetheria-theme", t), theme);
      await open(page);
      expect(await audit(page)).toEqual([]);
      await stepWho(page);
      await stepHeritage(page);
      await stepClass(page);
      await stepBackground(page);
      await page.getByRole("radio", { name: /^Point buy/ }).click();
      await page.getByTestId("pb-roll").click();
      expect(await audit(page)).toEqual([]);
      await page.getByRole("radio", { name: /^Standard array/ }).click();
      await page.locator("#array-0").click();
      expect(await audit(page)).toEqual([]);
    });

    test(tc("character-creator.spec.ts", "accessibility and small screens", `no serious axe violations on a finished sheet (${theme})`), async ({ page }) => {
      test.setTimeout(90000);
      await page.addInitScript((t) => localStorage.setItem("asetheria-theme", t), theme);
      await open(page);
      await buildFighter(page);
      expect(await audit(page)).toEqual([]);
    });
  }

  test("[TC-CHRC-022] at 375px no step scrolls the page sideways, including the sheet", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 800 } });
    const page = await context.newPage();
    try {
      await open(page);
      const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(await overflow()).toBeLessThanOrEqual(0);
      await stepWho(page);
      expect(await overflow()).toBeLessThanOrEqual(0);
      await stepHeritage(page);
      await stepClass(page);
      await stepBackground(page);
      await page.getByRole("radio", { name: /^Point buy/ }).click();
      await page.getByTestId("pb-roll").click();
      expect(await overflow()).toBeLessThanOrEqual(0);
      await pickArray(page);
      await next(page);
      await stepSkills(page);
      await next(page);
      await next(page);
      await page.locator("#cit-hellenoria").click();
      await next(page);
      await next(page);
      await next(page);
      await expect(page.getByTestId("character-sheet")).toBeVisible();
      expect(await overflow()).toBeLessThanOrEqual(0);
    } finally {
      await context.close();
    }
  });
});

test.describe("the member wizard (a signed-in player)", () => {
  test("[TC-CHRC-023] the Characters tab leads to an empty list, then the wizard: the member version offers the codex's own empires and only the gods this player may read", async ({ browser }) => {
    const p = await newPlayer(["deity", "empire"]);
    const { context, page } = await login(browser, p.username);
    try {
      await page.goto("/");
      await page.getByRole("link", { name: "Characters", exact: true }).first().click();
      await expect(page).toHaveURL(/\/characters$/);
      await expect(page.getByText("You have not made a character yet")).toBeVisible();
      await page.getByRole("link", { name: /Forge a hero/ }).first().click();
      await expect(page).toHaveURL(/\/characters\/new$/);
      await expect(page.getByTestId("creator")).toHaveAttribute("data-ready", "true");
      await expect(page.getByRole("note")).toHaveCount(0); // no "you are not signed in" notice

      await buildFighter(page, "Member Mira");
      expect(await page.content()).not.toContain(SECRET_GOD);
      await page.getByRole("button", { name: /^10\. Worship/ }).click();
      const options = await page.getByLabel("Whom do you follow?").locator("option").allTextContents();
      expect(options).toContain(OPEN_GOD);
      expect(options).not.toContain(SECRET_GOD);
      expect(await page.content()).not.toContain(SECRET_GOD);
      await page.getByLabel("Whom do you follow?").selectOption(OPEN_GOD);
      await page.getByRole("button", { name: /^12\. Review/ }).click();
      await expect(page.getByTestId("character-sheet")).toContainText(OPEN_GOD);
    } finally {
      await context.close();
    }
  });

  test("[TC-CHRC-024] saving creates the character, opens its sheet and lists it; editing changes it; deleting removes it", async ({ browser }) => {
    const p = await newPlayer();
    const { context, page } = await login(browser, p.username);
    try {
      await open(page, "/characters/new");
      await buildFighter(page, "Saved Sasha");
      await page.getByTestId("save-character").click();
      await expect(page).toHaveURL(/\/characters\/[0-9a-f-]{36}$/);
      await expect(page.getByRole("heading", { level: 1, name: "Saved Sasha" })).toBeVisible();
      const id = new URL(page.url()).pathname.split("/").pop() as string;
      const [row] = await query<{ user_id: string; sheet: { hitPoints: number } }>(`SELECT user_id, sheet FROM characters WHERE id = $1`, [id]);
      expect(row.user_id).toBe(p.id);
      expect(row.sheet.hitPoints).toBe(12);

      await page.goto("/characters");
      await expect(page.getByTestId("character-list")).toContainText("Saved Sasha");

      await page.goto(`/characters/${id}/edit`);
      await expect(page.getByTestId("creator")).toHaveAttribute("data-ready", "true");
      await expect(title(page)).toHaveText("Review your sheet");
      await page.getByRole("button", { name: /^1\. Who is this/ }).click();
      await page.getByLabel("Character name").fill("Renamed Sasha");
      await page.getByRole("button", { name: /^12\. Review/ }).click();
      await page.getByTestId("save-character").click();
      await expect(page.getByRole("heading", { level: 1, name: "Renamed Sasha" })).toBeVisible();

      await page.getByRole("button", { name: "Delete" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
      await expect(page).toHaveURL(/\/characters$/);
      await expect(page.getByText("You have not made a character yet")).toBeVisible();
      expect((await page.goto(`/characters/${id}`))?.status()).toBe(404);
    } finally {
      await context.close();
    }
  });

  test("[TC-CHRC-025] another player's character is a 404 on the page and on edit, and the DM can read it but not change it", async ({ browser }) => {
    const owner = await newPlayer();
    const other = await newPlayer();
    const A = await login(browser, owner.username);
    const B = await login(browser, other.username);
    const DM = await browser.newContext({ storageState: "tests/.auth/dm.json" });
    const dmPage = await DM.newPage();
    try {
      await open(A.page, "/characters/new");
      await buildFighter(A.page, "Private Piper");
      await A.page.getByTestId("save-character").click();
      await expect(A.page).toHaveURL(/\/characters\/[0-9a-f-]{36}$/);
      const id = new URL(A.page.url()).pathname.split("/").pop() as string;

      expect((await B.page.goto(`/characters/${id}`))?.status()).toBe(404);
      expect((await B.page.goto(`/characters/${id}/edit`))?.status()).toBe(404);
      await B.page.goto("/characters");
      expect(await B.page.content()).not.toContain("Private Piper");

      await dmPage.goto("/characters");
      await expect(dmPage.getByTestId("character-list")).toContainText("Private Piper");
      await dmPage.goto(`/characters/${id}`);
      await expect(dmPage.getByRole("heading", { level: 1, name: "Private Piper" })).toBeVisible();
      await expect(dmPage.getByRole("link", { name: "Edit" })).toHaveCount(0);
      await expect(dmPage.getByRole("button", { name: "Delete" })).toHaveCount(0);
      expect((await dmPage.goto(`/characters/${id}/edit`))?.status()).toBe(404);
      await dmPage.goto("/characters/new");
      await expect(dmPage).toHaveURL(/\/characters$/);
    } finally {
      await A.context.close();
      await B.context.close();
      await DM.close();
    }
  });

  test("[TC-CHRC-026] a rule broken behind the wizard's back is refused when saving, with the reason shown", async ({ browser }) => {
    const p = await newPlayer();
    const { context, page } = await login(browser, p.username);
    try {
      await open(page, "/characters/new");
      await buildFighter(page, "Tampered Tess");
      // Pretend the browser lets through a character the rules forbid.
      await page.route("**/api/characters", async (route) => {
        const body = JSON.parse(route.request().postData() ?? "{}");
        body.level = 25;
        await route.continue({ postData: JSON.stringify(body) });
      });
      await page.getByTestId("save-character").click();
      await expect(page.getByTestId("save-problems")).toContainText("Level is 1 to 20");
      await expect(page).toHaveURL(/\/characters\/new$/);
      expect((await query(`SELECT 1 FROM characters WHERE user_id = $1`, [p.id])).length).toBe(0);
    } finally {
      await context.close();
    }
  });
});
