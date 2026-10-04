import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { rollOnTable } from "../src/lib/dice";
import { parseRollTable, validateTable } from "../src/lib/roll-table";
import { closeDbHelpers, createTestPlayer, deleteTestUser, query } from "./db-helpers";
import { testName } from "./helpers";

/**
 * Random tables as codex entries: every table in the database is valid and
 * rolls inside its own rows, the editor refuses a broken table (live and on
 * the server), a table can be authored end to end and rolled in the browser,
 * the old tool address redirects, and access control applies like any entry.
 */

test.afterAll(async () => {
  await closeDbHelpers();
});

/**
 * Tables cannot be blanked (an empty table is invalid and will not save), so the
 * usual blank-then-purge cleanup does not apply; a test table is archived through
 * the same confirmation a DM would use.
 */
async function archiveThroughUi(page: import("@playwright/test").Page, slug: string) {
  await page.goto(`/codex/entry/${slug}`);
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await page.getByRole("button", { name: "Yes, archive" }).click();
  await page.waitForURL(/\/codex\/tables/);
}

test("every active table in the database is valid, and 100 rolls of each always land on a row whose range contains the roll", async () => {
  const tables = await query<{ name: string; body: string; dice: string }>(
    `SELECT name, body, fields->>'dice' AS dice FROM entries WHERE kind = 'table' AND archived_at IS NULL`,
  );
  expect(tables.length).toBeGreaterThan(0);
  for (const t of tables) {
    expect(validateTable(t.dice, t.body), `table "${t.name}"`).toEqual([]);
    const { rows } = parseRollTable(t.body);
    for (let i = 0; i < 100; i++) {
      const { roll, result } = rollOnTable(t.dice, rows);
      const row = rows.find((r) => roll >= r.min && roll <= r.max);
      expect(row, `"${t.name}" rolled ${roll}`).toBeTruthy();
      expect(result).toBe(row!.result);
    }
  }
});

test("the old /tools/tables address permanently redirects to the tables section", async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: "http://localhost:3000", storageState: "tests/.auth/dm.json" });
  const res = await api.get("/tools/tables", { maxRedirects: 0 });
  expect(res.status()).toBe(308);
  expect(res.headers()["location"]).toContain("/codex/tables");
  await api.dispose();
});

test.describe("authoring and rolling a table (DM)", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("create a d4 table with starter rows, roll it 100 times, and every result is one of its rows", async ({ page }) => {
    test.slow();
    const name = testName("table");
    let slug: string | undefined;
    try {
      await page.goto("/codex/new?kind=table");
      await page.getByLabel("Name *", { exact: true }).fill(name);
      await page.getByLabel("Dice", { exact: true }).fill("1d4");

      // Starter rows cover the whole span but are blank, so the table cannot be saved as it stands.
      await page.getByRole("button", { name: "Insert starter rows" }).click();
      await expect(page.locator("#body")).toHaveValue(/\| 1 \| {2}\|/);
      await expect(page.getByRole("button", { name: "Create entry" })).toBeDisabled();
      await expect(page.locator('div[role="alert"][data-variant]')).toContainText(/This table can.t be saved yet/);

      await page.locator("#body").fill(
        ["What the party finds.", "", "| Roll | Result |", "|---|---|", "| 1 | Sword |", "| 2 | Shield |", "| 3 | Potion |", "| 4 | Scroll |"].join("\n"),
      );
      await expect(page.locator('div[role="alert"][data-variant]')).toHaveCount(0);
      await page.getByRole("button", { name: "Create entry" }).click();
      await page.waitForURL(/\/codex\/entry\/.+/);
      slug = decodeURIComponent(page.url().match(/\/codex\/entry\/([^/?#]+)/)![1]);

      // The page draws the table (not the raw Markdown) and offers a Roll button.
      await expect(page.getByRole("table")).toBeVisible();
      await expect(page.getByText("What the party finds.")).toBeVisible();
      const rollButton = page.getByRole("button", { name: "Roll on this table" });
      const status = page.getByRole("status");
      await expect(status).toContainText("Not rolled yet");

      const results = new Set(["Sword", "Shield", "Potion", "Scroll"]);
      const seen = new Set<string>();
      for (let i = 0; i < 100; i++) {
        await rollButton.click();
        const text = (await status.innerText()).trim();
        const match = /^(\d)\s+(Sword|Shield|Potion|Scroll)$/.exec(text);
        expect(match, `roll ${i}: "${text}"`).not.toBeNull();
        const total = Number(match![1]);
        expect(total).toBeGreaterThanOrEqual(1);
        expect(total).toBeLessThanOrEqual(4);
        expect(["Sword", "Shield", "Potion", "Scroll"][total - 1]).toBe(match![2]);
        seen.add(match![2]);
        // The row that came up is highlighted.
        await expect(page.locator('tr[data-hit="true"]')).toHaveCount(1);
      }
      expect([...seen].every((r) => results.has(r))).toBe(true);
      expect(seen.size).toBeGreaterThan(1); // 100 fair d4 rolls hitting one face only is a 1-in-4^99 event
    } finally {
      if (slug) await archiveThroughUi(page, slug).catch(() => {});
    }
  });

  test("overlapping rows, a gap and an out-of-range row are each named in the editor and block saving", async ({ page }) => {
    await page.goto("/codex/new?kind=table");
    await page.getByLabel("Name *", { exact: true }).fill(testName("broken-table"));
    await page.getByLabel("Dice", { exact: true }).fill("1d6");
    const create = page.getByRole("button", { name: "Create entry" });

    const table = (rows: string[]) => ["| Roll | Result |", "|---|---|", ...rows].join("\n");

    await page.locator("#body").fill(table(["| 1-4 | a |", "| 4-6 | b |"]));
    await expect(page.locator('div[role="alert"][data-variant]')).toContainText("Roll 4 is in more than one row.");
    await expect(create).toBeDisabled();

    await page.locator("#body").fill(table(["| 1-2 | a |", "| 5-6 | b |"]));
    await expect(page.locator('div[role="alert"][data-variant]')).toContainText("No row covers 3-4.");
    await expect(create).toBeDisabled();

    await page.locator("#body").fill(table(["| 1-7 | a |"]));
    await expect(page.locator('div[role="alert"][data-variant]')).toContainText("outside 1d6");
    await expect(create).toBeDisabled();

    await page.locator("#body").fill(table(["| 1-6 | fine |"]));
    await expect(page.locator('div[role="alert"][data-variant]')).toHaveCount(0);
    await expect(create).toBeEnabled();
  });

  test("the server refuses a broken table even when the disabled button is bypassed, and nothing is created", async ({ page }) => {
    const name = testName("bypass-table");
    await page.goto("/codex/new?kind=table");
    await page.getByLabel("Name *", { exact: true }).fill(name);
    await page.getByLabel("Dice", { exact: true }).fill("1d6");
    await page.locator("#body").fill(["| Roll | Result |", "|---|---|", "| 1-3 | a |"].join("\n"));
    const create = page.getByRole("button", { name: "Create entry" });
    await expect(create).toBeDisabled();
    await create.evaluate((el) => el.removeAttribute("disabled"));
    await create.click();
    await expect(page.locator('p[role="alert"]')).toContainText(/This table can.t be saved yet/);
    await expect(page).toHaveURL(/\/codex\/new/);
    const rows = await query(`SELECT 1 FROM entries WHERE name = $1`, [name]);
    expect(rows).toHaveLength(0);
  });

  test("a table with a bad dice expression says so and cannot be saved", async ({ page }) => {
    await page.goto("/codex/new?kind=table");
    await page.getByLabel("Name *", { exact: true }).fill(testName("bad-dice"));
    await page.getByLabel("Dice", { exact: true }).fill("banana");
    await page.locator("#body").fill(["| Roll | Result |", "|---|---|", "| 1 | a |"].join("\n"));
    await expect(page.locator('div[role="alert"][data-variant]')).toContainText('"banana" is not dice notation');
    await expect(page.getByRole("button", { name: "Create entry" })).toBeDisabled();
  });

  test("a table is found by the palette (by name) and by full-text search (by content)", async ({ page }) => {
    const find = await page.request.get("/api/find?q=herbalist");
    expect(find.ok()).toBe(true);
    const palette = (await find.json()).results.map((r: { name: string; kind: string }) => `${r.kind}:${r.name}`);
    expect(palette.some((n: string) => n.startsWith("table:") && n.includes("Herbalist"))).toBe(true);

    // The word "forage" is only in the table's description, so this exercises the full-text index.
    await page.goto("/search?q=forage");
    await expect(page.getByRole("link", { name: /Herbalist's Field Guide/ }).first()).toBeVisible();
  });
});

test("a player with no grant on the table kind cannot find a table by search or open it", async ({ browser }) => {
  const username = `zz-tbl-${randomUUID().slice(0, 8)}`;
  const userId = await createTestPlayer(username, "correct horse battery staple 42");
  await query(`UPDATE users SET display_name = 'Table Tester' WHERE id = $1`, [userId]);
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    expect((await page.request.post("/api/auth/login", { data: { username, password: "correct horse battery staple 42" } })).ok()).toBe(true);
    const found = await (await page.request.get("/api/find?q=herbalist")).json();
    expect(JSON.stringify(found)).not.toContain("Herbalist's Field Guide");
    await page.goto("/search?q=forage");
    await expect(page.getByText("Herbalist's Field Guide")).toHaveCount(0);
    expect((await page.goto("/codex/entry/herbalists-field-guide-d20"))?.status()).toBe(404);
  } finally {
    await context.close();
    await deleteTestUser(userId);
  }
});
