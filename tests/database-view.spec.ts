import { randomUUID } from "node:crypto";
import { expect, test, type Browser } from "@playwright/test";
import { compareValues, numericValue, parseColumns, parseSort, sortRows } from "../src/lib/field-sort";
import { closeDbHelpers, createTestPlayer, deleteTestUser, query } from "./db-helpers";

/**
 * Phase 7 (ENH-05): a server-driven database view per kind. Sort, view and
 * columns live in the URL, the key is whitelisted, and numbers sort as numbers.
 */

const PASSWORD = "correct horse battery staple 42";
const tag = randomUUID().slice(0, 8);
const PREFIX = `Zz Dbview ${tag}`;
const FIXTURES: { name: string; cost: string; visibility?: string; dmNotes?: string }[] = [
  { name: `${PREFIX} A five`, cost: "5 gp" },
  { name: `${PREFIX} B five thousand`, cost: "5,000 gp" },
  { name: `${PREFIX} C fifty`, cost: "50 gp" },
  { name: `${PREFIX} D five silver`, cost: "5 sp" },
  { name: `${PREFIX} E blank`, cost: "" },
  { name: `${PREFIX} F secret`, cost: "9 gp", visibility: "secret", dmNotes: `private-note-${tag}` },
];
const slugOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const users: string[] = [];

test.beforeAll(async () => {
  for (const f of FIXTURES) {
    await query(
      `INSERT INTO entries (slug, kind, name, summary, fields, visibility, dm_notes, source_path)
       VALUES ($1, 'ore', $2, 'A database view fixture.', $3::jsonb, $4, $5, 'test: database-view')`,
      [slugOf(f.name), f.name, JSON.stringify(f.cost ? { costPerLb: f.cost, biome: "Test" } : { biome: "Test" }), f.visibility ?? "public", f.dmNotes ?? ""],
    );
  }
});

test.afterAll(async () => {
  await query(`DELETE FROM entries WHERE source_path = 'test: database-view'`);
  for (const id of users) await deleteTestUser(id);
  await closeDbHelpers();
});

async function playerWith(kinds: string[]): Promise<string> {
  const username = `zz-dbv-${randomUUID().slice(0, 8)}`;
  const id = await createTestPlayer(username, PASSWORD);
  users.push(id);
  await query(`UPDATE users SET display_name = 'DBV Tester' WHERE id = $1`, [id]);
  for (const kind of kinds) await query(`INSERT INTO entry_grants (user_id, kind, granted) VALUES ($1, $2, true)`, [id, kind]);
  return username;
}

async function login(browser: Browser, username: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  expect((await page.request.post("/api/auth/login", { data: { username, password: PASSWORD } })).ok()).toBe(true);
  return { context, page };
}

/** Names of the fixture rows, in the order the table shows them. */
async function fixtureOrder(page: import("@playwright/test").Page): Promise<string[]> {
  const names = await page.locator('[data-slot="table-body"] tr td:first-child a').allTextContents();
  return names.filter((n) => n.startsWith(PREFIX)).map((n) => n.slice(PREFIX.length + 1));
}

test.describe("sorting rules (pure)", () => {
  test("numericValue reads thousands separators, fractions, coin units and ranges, and rejects text", () => {
    expect(numericValue("5,000 gp")).toBe(5000);
    expect(numericValue("5 gp")).toBe(5);
    expect(numericValue("CR 1/4")).toBe(0.25);
    expect(numericValue("1/2")).toBe(0.5);
    expect(numericValue("5 sp")).toBeCloseTo(0.5);
    expect(numericValue("2 pp")).toBe(20);
    expect(numericValue("10-15")).toBe(10);
    expect(numericValue("1,234,567.5")).toBe(1234567.5);
    expect(numericValue("Non-ferrous")).toBeNull();
    expect(numericValue("")).toBeNull();
    expect(numericValue(undefined)).toBeNull();
    expect(numericValue("1/0")).toBeNull();
  });

  test("5 gp sorts before 5,000 gp, silver before gold, and blanks last in both directions", () => {
    const values = ["5,000 gp", "", "5 gp", "50 gp", "5 sp"];
    const asc = [...values].sort((a, b) => compareValues("costPerLb", a, b, "asc"));
    expect(asc).toEqual(["5 sp", "5 gp", "50 gp", "5,000 gp", ""]);
    const desc = [...values].sort((a, b) => compareValues("costPerLb", a, b, "desc"));
    expect(desc).toEqual(["5,000 gp", "50 gp", "5 gp", "5 sp", ""]);
  });

  test("rarity sorts by rank, not alphabet, and text falls back to natural order after numbers", () => {
    const rarities = ["Rare", "Common", "Legendary", "Uncommon"];
    expect([...rarities].sort((a, b) => compareValues("rarity", a, b, "asc"))).toEqual(["Common", "Uncommon", "Rare", "Legendary"]);
    expect(compareValues("armorClass", "23", "Varies", "asc")).toBeLessThan(0);
    expect(compareValues("x", "item 2", "item 10", "asc")).toBeLessThan(0);
  });

  test("parseSort and parseColumns accept only whitelisted keys and fall back instead of failing", () => {
    const keys = ["costPerLb", "rarity"];
    expect(parseSort("costPerLb", "desc", keys)).toEqual({ key: "costPerLb", dir: "desc" });
    expect(parseSort("name", undefined, keys)).toEqual({ key: "name", dir: "asc" });
    expect(parseSort("password; DROP TABLE entries", "desc", keys)).toEqual({ key: "name", dir: "asc" });
    expect(parseSort("__proto__", "sideways", keys)).toEqual({ key: "name", dir: "asc" });
    expect(parseSort(["rarity", "x"], ["desc"], keys)).toEqual({ key: "rarity", dir: "desc" });
    expect(parseColumns("rarity,nope", keys, ["costPerLb"])).toEqual(["rarity"]);
    expect(parseColumns("nope", keys, ["costPerLb"])).toEqual(["costPerLb"]);
    expect(parseColumns(undefined, keys, ["costPerLb"])).toEqual(["costPerLb"]);
  });

  test("sortRows is stable and breaks ties by name", () => {
    const rows = [
      { name: "B", fields: { rarity: "Rare" } },
      { name: "A", fields: { rarity: "Rare" } },
      { name: "C", fields: { rarity: "Common" } },
    ];
    expect(sortRows(rows, { key: "rarity", dir: "asc" }).map((r) => r.name)).toEqual(["C", "A", "B"]);
  });
});

test.describe("the view (DM)", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("sorting by cost orders 5 sp, 5 gp, 50 gp, 5,000 gp and puts the blank last", async ({ page }) => {
    await page.goto("/codex/ores?view=table&sort=costPerLb&dir=asc");
    await expect(page.getByRole("columnheader", { name: /Cost per lb/ })).toHaveAttribute("aria-sort", "ascending");
    // 5 sp (0.5) < 5 gp < 9 gp (the secret one, visible to the DM) < 50 gp < 5,000 gp, then the blank.
    expect(await fixtureOrder(page)).toEqual(["D five silver", "A five", "F secret", "C fifty", "B five thousand", "E blank"]);
  });

  test("descending reverses the numbers and still puts the blank last", async ({ page }) => {
    await page.goto("/codex/ores?view=table&sort=costPerLb&dir=desc");
    await expect(page.getByRole("columnheader", { name: /Cost per lb/ })).toHaveAttribute("aria-sort", "descending");
    const order = await fixtureOrder(page);
    expect(order.indexOf("B five thousand")).toBeLessThan(order.indexOf("C fifty"));
    expect(order.indexOf("C fifty")).toBeLessThan(order.indexOf("A five"));
    expect(order.indexOf("A five")).toBeLessThan(order.indexOf("D five silver"));
    expect(order.indexOf("D five silver")).toBeLessThan(order.indexOf("E blank"));
  });

  test("the first row of a descending cost sort is the dearest ore in the whole section", async ({ page }) => {
    const rows = await query<{ name: string; cost: string | null }>(
      `SELECT name, fields->>'costPerLb' AS cost FROM entries WHERE kind = 'ore' AND archived_at IS NULL`,
    );
    const best = rows
      .map((r) => ({ name: r.name, n: numericValue(r.cost) }))
      .filter((r): r is { name: string; n: number } => r.n !== null)
      .sort((a, b) => b.n - a.n)[0];
    await page.goto("/codex/ores?view=table&sort=costPerLb&dir=desc");
    const first = await page.locator('[data-slot="table-body"] tr td:first-child a').first().textContent();
    const firstCost = rows.find((r) => r.name === first)?.cost;
    expect(numericValue(firstCost)).toBe(best.n);
  });

  test("clicking a header writes the sort to the URL and flips direction on a second click", async ({ page }) => {
    await page.goto("/codex/ores?view=table");
    const header = page.getByRole("columnheader", { name: /Cost per lb/ });
    await header.getByRole("button").click();
    await expect(page).toHaveURL(/sort=costPerLb&dir=asc/);
    await expect(header).toHaveAttribute("aria-sort", "ascending");
    await header.getByRole("button").click();
    await expect(page).toHaveURL(/sort=costPerLb&dir=desc/);
    await expect(header).toHaveAttribute("aria-sort", "descending");
  });

  test("the Table button puts the view in the URL, and a reload keeps it", async ({ page }) => {
    await page.goto("/codex/ores");
    await page.getByRole("button", { name: "Table", exact: true }).click();
    await expect(page).toHaveURL(/view=table/);
    await page.reload();
    await expect(page.getByRole("columnheader", { name: /Cost per lb/ })).toBeVisible();
  });

  test("an unknown sort key, direction or column is ignored: 200, default order, no error", async ({ page }) => {
    for (const qs of [
      "view=table&sort=__proto__&dir=desc",
      "view=table&sort=name%3B%20DROP%20TABLE%20entries&dir=sideways",
      "view=table&sort=%00&cols=%00,nope",
      "view=table&sort=costPerLb&dir=%27%20OR%201%3D1",
      "sort=ferrous&dir=asc&page=abc",
    ]) {
      const res = await page.goto(`/codex/ores?${qs}`);
      expect(res?.status(), qs).toBe(200);
      await expect(page.getByRole("heading", { level: 1, name: "Ores & Materials" })).toBeVisible();
    }
    const still = await query<{ n: string }>(`SELECT count(*)::text AS n FROM entries WHERE kind = 'ore'`);
    expect(Number(still[0].n)).toBeGreaterThan(90);
  });

  test("the column picker hides and shows columns through the URL, and a reload keeps them", async ({ page }) => {
    await page.goto("/codex/ores?view=table");
    await expect(page.getByRole("columnheader", { name: /Biome/ })).toBeVisible();
    await page.getByRole("button", { name: "Columns" }).click();
    await page.getByRole("menuitemcheckbox", { name: "Biome" }).click();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/cols=/);
    await expect(page.getByRole("columnheader", { name: /Biome/ })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("columnheader", { name: /Cost per lb/ })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /Biome/ })).toHaveCount(0);
  });

  test("the pager keeps the view, sort and columns", async ({ page }) => {
    await page.goto("/codex/sites?view=table&sort=type&dir=desc");
    const next = page.getByRole("link", { name: /Next/ });
    if (await next.count()) {
      expect(await next.getAttribute("href")).toMatch(/view=table/);
      expect(await next.getAttribute("href")).toMatch(/sort=type&dir=desc/);
    }
  });
});

test.describe("what a player gets", () => {
  test("never a secret row, never a DM note, in the page or its data", async ({ browser }) => {
    const { context, page } = await login(browser, await playerWith(["ore"]));
    try {
      const responses: string[] = [];
      page.on("response", async (r) => {
        if (r.url().includes("/codex/ores")) responses.push(await r.text().catch(() => ""));
      });
      await page.goto("/codex/ores?view=table&sort=costPerLb&dir=desc");
      await expect(page.getByRole("columnheader", { name: /Cost per lb/ })).toBeVisible();
      const order = await fixtureOrder(page);
      expect(order).not.toContain("F secret");
      expect(order).toContain("A five");
      const html = await page.content();
      expect(html).not.toContain(`${PREFIX} F secret`);
      expect(html).not.toContain(`private-note-${tag}`);
      for (const body of responses) {
        expect(body).not.toContain(`private-note-${tag}`);
        expect(body).not.toContain(`${PREFIX} F secret`);
      }
    } finally {
      await context.close();
    }
  });

  test("a player with no grant on the kind gets the empty section, not data", async ({ browser }) => {
    const { context, page } = await login(browser, await playerWith(["location"]));
    try {
      const res = await page.goto("/codex/ores?view=table&sort=costPerLb");
      expect(res?.status()).toBe(200);
      expect(await page.content()).not.toContain(PREFIX);
    } finally {
      await context.close();
    }
  });
});

test.describe("small screens", () => {
  test.use({ storageState: "tests/.auth/dm.json", viewport: { width: 375, height: 800 } });

  test("at 375px the table scrolls inside its container and the page does not scroll sideways", async ({ page }) => {
    await page.goto("/codex/ores?view=table");
    await expect(page.getByRole("columnheader", { name: /Cost per lb/ })).toBeAttached();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const container = page.locator('[data-slot="table-container"]');
    expect(await container.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  });
});
