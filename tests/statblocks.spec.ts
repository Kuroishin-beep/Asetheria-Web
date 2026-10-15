import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { closeDbHelpers, createTestPlayer, deleteTestUser, query } from "./db-helpers";
import { testName } from "./helpers";
import { isAllowedWikidotUrl } from "../src/lib/character/links";
import { STATBLOCK_SKELETON, parseStatblock, statblockProblem } from "../src/lib/statblock";
import { tc } from "./case-id";

/**
 * Phase 14: stat blocks on pages. The standard 5e layout a DM writes into a page's Stat Block property is
 * shown as a laid-out card with the modifiers and proficiency bonus worked out; a badly formed one is
 * refused on save; text that is not a stat block is left exactly as written.
 */

const PASSWORD = "correct horse battery staple 42";
const users: string[] = [];
const tag = randomUUID().slice(0, 6);

const DIV = `**Armor Class** 16 (natural)
**Hit Points** 152 (16d10 + 64)
**Speed** 40 ft.

STR 22 (+6)   DEX 12 (+1)   CON 19 (+4)   INT 9 (-1)   WIS 14 (+2)   CHA 15 (+2)

**Saving Throws** STR +10, CON +8
**Senses** darkvision 120 ft., passive Perception 12
**Languages** Abyssal
**Challenge** 8 (3,900 XP)

### Traits

**Water-Hater ${tag}.** The div takes extra damage in flowing water.`;

test.use({ storageState: "tests/.auth/dm.json" });

test.afterAll(async () => {
  await query(`DELETE FROM entries WHERE name LIKE 'zz-playwright-sb-%'`);
  for (const id of users) await deleteTestUser(id);
  await closeDbHelpers();
});

type Made = { name: string; slug: string; id: string };

async function fillCreature(page: Page, name: string, statblock: string | null, fields: { cr?: string; type?: string } = {}, kind = "creature") {
  await page.goto(`/codex/new?kind=${kind}`);
  await page.waitForLoadState("networkidle");
  await page.fill("#name", name);
  if (fields.cr !== undefined) await page.fill("#field-cr", fields.cr);
  if (fields.type !== undefined) await page.fill("#field-type", fields.type);
  if (statblock !== null) await page.fill("#field-statblock", statblock);
}

async function makeCreature(page: Page, statblock: string | null, fields: { cr?: string; type?: string } = {}, kind = "creature"): Promise<Made> {
  const name = testName("sb");
  await fillCreature(page, name, statblock, fields, kind);
  await page.getByRole("button", { name: "Create entry" }).click();
  await page.waitForURL(/\/codex\/entry\/[^/]+$/);
  const slug = decodeURIComponent(new URL(page.url()).pathname.split("/").pop() as string);
  const [row] = await query<{ id: string }>(`SELECT id FROM entries WHERE slug = $1`, [slug]);
  return { name, slug, id: row.id };
}

async function readerPlayer(browser: Browser, kinds: string[] = ["creature", "npc"]) {
  const username = `zz-sb-${randomUUID().slice(0, 6)}`;
  const id = await createTestPlayer(username, PASSWORD);
  users.push(id);
  await query(`UPDATE users SET display_name = $2 WHERE id = $1`, [id, `Zz ${username.slice(-4)}`]);
  for (const k of kinds) await query(`INSERT INTO entry_grants (user_id, kind, granted) VALUES ($1, $2::entry_kind, true)`, [id, k]);
  const context = await browser.newContext();
  const page = await context.newPage();
  const res = await page.request.post("/api/auth/login", { data: { username, password: PASSWORD }, headers: { "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.8.${Math.floor(Math.random() * 250)}` } });
  expect(res.ok()).toBe(true);
  return { context, page };
}

test.describe("existing content", () => {
  test("[TC-SBPG-001] every stat block already in the codex still saves: the 12 creature stat blocks are well formed, and the NPC notes are left as free text", async () => {
    const rows = await query<{ name: string; kind: string; sb: string }>(`SELECT name, kind, fields->>'statblock' AS sb FROM entries WHERE archived_at IS NULL AND fields ? 'statblock' AND length(fields->>'statblock') > 0`);
    expect(rows.length).toBeGreaterThanOrEqual(30);
    let blocks = 0;
    for (const r of rows) {
      expect(statblockProblem(r.sb), `${r.kind} ${r.name} must not be newly refused`).toBeNull();
      const parsed = parseStatblock(r.sb);
      if (parsed.kind === "block") {
        blocks++;
        expect(parsed.errors, r.name).toEqual([]);
        expect(parsed.block.warnings, `${r.name} has a modifier that disagrees with its score`).toEqual([]);
      }
    }
    expect(blocks).toBeGreaterThanOrEqual(12);
  });
});

test.describe("the card", () => {
  test("[TC-SBPG-002] a stat block is shown as a laid-out card with every number, and the raw text is not shown a second time", async ({ page }) => {
    test.slow();
    const made = await makeCreature(page, DIV, { cr: "8", type: "Fiend" });
    const card = page.getByTestId("statblock");
    await expect(card).toBeVisible();
    await expect(card.getByRole("heading", { name: made.name })).toBeVisible();
    await expect(card).toContainText("Fiend · Challenge 8");
    await expect(page.getByTestId("statblock-ac")).toHaveText("16 (natural)");
    await expect(page.getByTestId("statblock-hp")).toHaveText("152 (16d10 + 64)");
    await expect(card).toContainText("40 ft.");
    await expect(page.getByTestId("statblock-str")).toContainText("22");
    await expect(page.getByTestId("statblock-str")).toContainText("(+6)");
    await expect(page.getByTestId("statblock-int")).toContainText("(−1)"); // a true minus sign
    await expect(page.getByTestId("statblock-cr")).toHaveText("8 (3,900 XP)");
    await expect(page.getByTestId("statblock-prof")).toHaveText("+3");
    await expect(card).toContainText("Saving Throws");
    await expect(card).toContainText(`Water-Hater ${tag}.`);
    // The stat block is not also listed as a plain property.
    await expect(page.locator("dt", { hasText: /^Stat Block$/ })).toHaveCount(0);
    expect(made.id).toBeTruthy();
  });

  test("[TC-SBPG-003] the modifiers shown are the correct ones even when the written ones are wrong, and only the DM is told", async ({ page, browser }) => {
    test.slow();
    const made = await makeCreature(page, DIV.replace("STR 22 (+6)", "STR 22 (+5)"), { cr: "8" });
    await expect(page.getByTestId("statblock-str")).toContainText("(+6)");
    await expect(page.getByTestId("statblock-notes")).toContainText("STR 22 should be +6, not +5");
    const { context, page: pp } = await readerPlayer(browser);
    try {
      await pp.goto(`/codex/entry/${made.slug}`);
      await expect(pp.getByTestId("statblock")).toBeVisible();
      await expect(pp.getByTestId("statblock-str")).toContainText("(+6)");
      await expect(pp.getByTestId("statblock-notes")).toHaveCount(0);
      expect(await pp.content()).not.toContain("should be +6");
    } finally {
      await context.close();
    }
  });

  test("[TC-SBPG-004] a Challenge Rating property that disagrees with the stat block is flagged for the DM only", async ({ page, browser }) => {
    test.slow();
    const made = await makeCreature(page, DIV, { cr: "3" });
    await expect(page.getByTestId("statblock-notes")).toContainText("Challenge Rating property says 3, but the stat block says 8");
    const { context, page: pp } = await readerPlayer(browser);
    try {
      await pp.goto(`/codex/entry/${made.slug}`);
      expect(await pp.content()).not.toContain("property says 3");
    } finally {
      await context.close();
    }
  });

  test("[TC-SBPG-005] text that is not a stat block is shown as written, with no card", async ({ page }) => {
    test.slow();
    await makeCreature(page, "AC: 17 | CR: 5", {}, "npc");
    await expect(page.getByTestId("statblock")).toHaveCount(0);
    await expect(page.locator("dd", { hasText: "AC: 17 | CR: 5" })).toBeVisible();
  });

  test("[TC-SBPG-006] a page with no stat block shows no card", async ({ page }) => {
    test.slow();
    await makeCreature(page, null, { cr: "1", type: "Beast" });
    await expect(page.getByTestId("statblock")).toHaveCount(0);
  });

  test("[TC-SBPG-007] a player sees the card only for a page they can read: a secret page is a 404 with nothing of the stat block in it", async ({ page, browser }) => {
    test.slow();
    const made = await makeCreature(page, DIV, { cr: "8" });
    await query(`UPDATE entries SET visibility = 'secret' WHERE id = $1`, [made.id]);
    const { context, page: pp } = await readerPlayer(browser);
    try {
      const res = await pp.goto(`/codex/entry/${made.slug}`);
      expect(res?.status()).toBe(404);
      const html = await pp.content();
      expect(html).not.toContain(`Water-Hater ${tag}`);
      const find = await (await pp.request.get(`/api/find?q=${encodeURIComponent(made.name)}`)).text();
      expect(find).not.toContain(made.name);
    } finally {
      await context.close();
    }
  });

  test("[TC-SBPG-008] the rules links open in a new tab, on the one allowed host, and say so", async ({ page }) => {
    test.slow();
    await makeCreature(page, DIV, { cr: "8" });
    const links = page.getByTestId("statblock").getByRole("link");
    await expect(links).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      const a = links.nth(i);
      const href = (await a.getAttribute("href")) ?? "";
      expect(isAllowedWikidotUrl(href), href).toBe(true);
      expect(await a.getAttribute("target")).toBe("_blank");
      expect(await a.getAttribute("rel")).toContain("noopener");
      expect(await a.getAttribute("rel")).toContain("noreferrer");
      await expect(a).toContainText("opens in a new tab");
    }
  });
});

test.describe("saving", () => {
  test("[TC-SBPG-009] a badly formed stat block is refused with every problem named, and nothing is created", async ({ page }) => {
    test.slow();
    const name = testName("sb-bad");
    const bad = DIV.replace("16 (natural)", "heavy").replace("STR 22 (+6)", "STR 31 (+10)").replace("8 (3,900 XP)", "99");
    await fillCreature(page, name, bad);
    await page.getByRole("button", { name: "Create entry" }).click();
    const alert = page.locator('p[role="alert"]');
    await expect(alert).toContainText("The stat block can't be saved yet.");
    for (const part of ["Armor Class must start with a number", "STR must be from 1 to 30 (it says 31)", "valid rating"]) await expect(alert).toContainText(part);
    await expect(page).toHaveURL(/\/codex\/new/);
    expect(await query(`SELECT 1 FROM entries WHERE name = $1`, [name])).toHaveLength(0);
  });

  test("[TC-SBPG-010] editing a saved page into a bad stat block is refused and leaves the stored one unchanged", async ({ page }) => {
    test.slow();
    const made = await makeCreature(page, DIV, { cr: "8" });
    await page.goto(`/codex/entry/${made.slug}/edit`);
    await page.waitForLoadState("networkidle");
    await page.fill("#field-statblock", DIV.replace("152 (16d10 + 64)", "0"));
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.locator('p[role="alert"]')).toContainText("Hit Points must be from 1 to 10,000");
    const [row] = await query<{ sb: string }>(`SELECT fields->>'statblock' AS sb FROM entries WHERE id = $1`, [made.id]);
    // A browser posts a textarea with CRLF line endings; the text is otherwise exactly what was saved.
    expect(row.sb.split("\r\n").join("\n")).toBe(DIV);
  });

  test("[TC-SBPG-011] the limits hold at the boundary: armour 40, 10,000 hit points, scores 1 and 30 and CR 1/8 save; 41, 10,001, 31 and CR 31 are refused", async ({ page }) => {
    test.slow();
    const extreme = DIV.replace("16 (natural)", "40").replace("152 (16d10 + 64)", "10000").replace("STR 22 (+6)", "STR 30 (+10)").replace("DEX 12 (+1)", "DEX 1 (-5)").replace("8 (3,900 XP)", "1/8 (25 XP)");
    await makeCreature(page, extreme, { cr: "1/8" });
    await expect(page.getByTestId("statblock-ac")).toHaveText("40");
    await expect(page.getByTestId("statblock-hp")).toHaveText("10000");
    await expect(page.getByTestId("statblock-str")).toContainText("(+10)");
    await expect(page.getByTestId("statblock-dex")).toContainText("(−5)");
    await expect(page.getByTestId("statblock-prof")).toHaveText("+2");

    const name = testName("sb-over");
    const over = DIV.replace("16 (natural)", "41").replace("152 (16d10 + 64)", "10001").replace("STR 22 (+6)", "STR 31 (+10)").replace("8 (3,900 XP)", "31");
    await fillCreature(page, name, over);
    await page.getByRole("button", { name: "Create entry" }).click();
    const alert = page.locator('p[role="alert"]');
    for (const part of ["Armor Class must be from 0 to 40", "Hit Points must be from 1 to 10,000", "STR must be from 1 to 30", "valid rating"]) await expect(alert).toContainText(part);
    expect(await query(`SELECT 1 FROM entries WHERE name = $1`, [name])).toHaveLength(0);
  });

  test("[TC-SBPG-012] Insert a blank stat block fills the field with a valid one that saves and shows as a card", async ({ page }) => {
    test.slow();
    const name = testName("sb-blank");
    await fillCreature(page, name, null);
    await page.getByTestId("insert-statblock").click();
    await expect(page.locator("#field-statblock")).toHaveValue(STATBLOCK_SKELETON);
    await page.getByRole("button", { name: "Create entry" }).click();
    await page.waitForURL(/\/codex\/entry\/[^/]+$/);
    await expect(page.getByTestId("statblock-ac")).toHaveText("12");
    await expect(page.getByTestId("statblock-cr")).toHaveText("1/4 (50 XP)");
    await expect(page.getByTestId("statblock-prof")).toHaveText("+2");
    await expect(page.getByTestId("statblock-notes")).toHaveCount(0);
  });

  test("[TC-SBPG-013] Insert a blank stat block asks before replacing text that is already there, and Cancel keeps it", async ({ page }) => {
    await fillCreature(page, testName("sb-keep"), "my own notes");
    let asked = false;
    page.once("dialog", (d) => {
      asked = true;
      void d.dismiss();
    });
    await page.getByTestId("insert-statblock").click();
    expect(asked).toBe(true);
    await expect(page.locator("#field-statblock")).toHaveValue("my own notes");
  });
});

test.describe("accessibility and small screens", () => {
  for (const theme of ["dark", "light"] as const) {
    test(tc("statblocks.spec.ts", "accessibility and small screens", `a page with a stat block has no serious axe violations (${theme})`), async ({ page }) => {
      test.slow();
      await page.addInitScript((t) => localStorage.setItem("asetheria-theme", t), theme);
      await makeCreature(page, DIV.replace("STR 22 (+6)", "STR 22 (+5)"), { cr: "3" });
      await page.waitForTimeout(400);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help} -> ${v.nodes[0]?.target.join(" ")}`);
      expect(serious).toEqual([]);
    });
  }

  test("[TC-SBPG-016] at 375px the card fits without sideways scrolling and the six abilities wrap onto two rows", async ({ browser }) => {
    test.slow();
    const context = await browser.newContext({ storageState: "tests/.auth/dm.json", viewport: { width: 375, height: 800 } });
    const page = await context.newPage();
    try {
      await makeCreature(page, DIV, { cr: "8" });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      const tops = await Promise.all(["str", "dex", "con", "int", "wis", "cha"].map((a) => page.getByTestId(`statblock-${a}`).evaluate((el) => Math.round(el.getBoundingClientRect().top))));
      expect(new Set(tops).size).toBe(2);
    } finally {
      await context.close();
    }
  });

  test("[TC-SBPG-017] printing keeps the card and hides the DM notes and the rules links", async ({ page }) => {
    test.slow();
    await makeCreature(page, DIV.replace("STR 22 (+6)", "STR 22 (+5)"), { cr: "8" });
    await page.emulateMedia({ media: "print" });
    await expect(page.getByTestId("statblock")).toBeVisible();
    await expect(page.getByTestId("statblock-notes")).toBeHidden();
    await expect(page.getByText("Look up the rules")).toBeHidden();
  });
});
