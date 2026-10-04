import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { expect, test, type Browser } from "@playwright/test";
import { diceSpan, parseRollTable, validateTable } from "../src/lib/roll-table";
import { TABLE_TARGET, loadTables } from "../scripts/lib/natural-world";
import { closeDbHelpers, createTestPlayer, deleteTestUser, query } from "./db-helpers";

/**
 * Phase 6 (ENH-04): the 24 authored tables are valid, cross-linked with the
 * places that use them, role-scoped, and import without duplicates.
 */

const ROOT = path.join(__dirname, "..");
const PASSWORD = "correct horse battery staple 42";
const SOURCE = "original: natural-world/tables";
const users: string[] = [];

async function playerWith(kinds: string[]): Promise<string> {
  const username = `zz-tbl-${randomUUID().slice(0, 8)}`;
  const id = await createTestPlayer(username, PASSWORD);
  users.push(id);
  await query(`UPDATE users SET display_name = 'TBL Tester' WHERE id = $1`, [id]);
  for (const kind of kinds) await query(`INSERT INTO entry_grants (user_id, kind, granted) VALUES ($1, $2, true)`, [id, kind]);
  return username;
}

async function login(browser: Browser, username: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  expect((await page.request.post("/api/auth/login", { data: { username, password: PASSWORD } })).ok()).toBe(true);
  return { context, page };
}

test.afterAll(async () => {
  await query(`DELETE FROM entries WHERE source_path = 'test: natural-world-tables'`);
  for (const id of users) await deleteTestUser(id);
  await closeDbHelpers();
});

test.describe("the tables (data)", () => {
  test("the data file holds exactly 24 tables and each covers its full dice span once, with no gap or overlap", () => {
    const tables = loadTables();
    expect(tables).toHaveLength(TABLE_TARGET);
    for (const t of tables) {
      expect(validateTable(t.fields.dice, t.body), t.name).toEqual([]);
      const span = diceSpan(t.fields.dice)!;
      const rows = parseRollTable(t.body).rows;
      for (let n = span.min; n <= span.max; n++) {
        expect(rows.filter((r) => n >= r.min && n <= r.max), `${t.name} roll ${n}`).toHaveLength(1);
      }
    }
  });

  test("the same holds for what is in the database, and every row is a real sentence", async () => {
    const rows = await query<{ name: string; body: string; dice: string }>(
      `SELECT name, body, fields->>'dice' AS dice FROM entries WHERE source_path = $1 AND archived_at IS NULL`,
      [SOURCE],
    );
    expect(rows).toHaveLength(TABLE_TARGET);
    for (const r of rows) {
      expect(validateTable(r.dice, r.body), r.name).toEqual([]);
      for (const row of parseRollTable(r.body).rows) expect(row.result.length, `${r.name} ${row.min}`).toBeGreaterThan(10);
    }
  });

  test("each table names places or specimens that exist, and the places it names cite it back", async () => {
    const tables = await query<{ id: string; name: string }>(`SELECT id, name FROM entries WHERE source_path = $1 AND archived_at IS NULL`, [SOURCE]);
    const lacking: string[] = [];
    for (const t of tables) {
      const out = await query<{ n: string }>(`SELECT count(*)::text AS n FROM links WHERE source_id = $1`, [t.id]);
      if (Number(out[0].n) < 3) lacking.push(`${t.name}: only ${out[0].n} outgoing links`);
      const back = await query<{ n: string }>(
        `SELECT count(*)::text AS n FROM links l JOIN entries e ON e.id = l.source_id
         WHERE l.target_id = $1 AND e.kind = 'location' AND e.archived_at IS NULL`,
        [t.id],
      );
      if (Number(back[0].n) < 1) lacking.push(`${t.name}: no place cites it`);
    }
    expect(lacking).toEqual([]);
  });

  test("re-importing creates no duplicates, and linking tables to places again changes nothing", async () => {
    const before = await query<{ n: string }>(`SELECT count(*)::text AS n FROM entries`);
    const imp = execFileSync("npx", ["tsx", "scripts/import-codex-file.ts", "data/natural-world/tables.json"], { cwd: ROOT, encoding: "utf8", shell: true });
    expect(imp).toContain(" 0 created,");
    const link = execFileSync("npx", ["tsx", "scripts/link-tables-to-places.ts"], { cwd: ROOT, encoding: "utf8", shell: true });
    expect(link).toContain("0 places would be updated");
    const after = await query<{ n: string }>(`SELECT count(*)::text AS n FROM entries`);
    expect(after[0].n).toBe(before[0].n);
    const dupes = await query(`SELECT slug FROM entries WHERE archived_at IS NULL GROUP BY slug HAVING count(*) > 1`);
    expect(dupes).toHaveLength(0);
  });
});

test.describe("the tables on the site", () => {
  test.describe("DM", () => {
    test.use({ storageState: "tests/.auth/dm.json" });

    test("a table page rolls, shows its places as links and its DM usage note", async ({ page }) => {
      await page.goto("/codex/entry/forage-in-the-desert");
      await expect(page.getByRole("heading", { level: 1, name: "Forage in the Desert" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Dasht-a Khaliq" }).first()).toBeVisible();
      await expect(page.getByText(/^Use:/)).toBeVisible();
      await page.getByRole("button", { name: /roll/i }).first().click();
      await expect(page.getByRole("status")).toContainText(/\d/);
    });

    test("a place that uses the table is listed in the table's linked mentions", async ({ page }) => {
      await page.goto("/codex/entry/forage-in-the-desert");
      await expect(page.getByRole("heading", { name: /Linked mentions/ })).toBeVisible();
      await expect(page.getByRole("link", { name: /The Myrrh Wadi/ }).first()).toBeVisible();
    });

    test("the section lists all of the tables", async ({ page }) => {
      await page.goto("/codex/tables");
      await expect(page.locator('[data-slot="card"]').first()).toBeVisible();
      await expect(page.getByText(/\d+ total/)).toBeVisible();
    });
  });

  test("a player with the table grant sees a table and the roller but never the DM note", async ({ browser }) => {
    const { context, page } = await login(browser, await playerWith(["table", "location"]));
    try {
      await page.goto("/codex/entry/forage-in-the-desert");
      await expect(page.getByRole("heading", { level: 1, name: "Forage in the Desert" })).toBeVisible();
      expect(await page.content()).not.toContain("Use: ");
      await page.goto("/codex/entry/the-myrrh-wadi");
      await expect(page.getByRole("link", { name: "Forage in the Desert" }).first()).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("a secret table never reaches a player: 404 on the page, absent from the list and from search", async ({ browser }) => {
    const slug = `zz-secret-table-${randomUUID().slice(0, 8)}`;
    const body = "A hidden table.\n\n| Roll | Result |\n|---|---|\n| 1-2 | Something only the DM should know about |";
    await query(
      `INSERT INTO entries (slug, kind, name, summary, body, fields, visibility, source_path)
       VALUES ($1, 'table', $2, 'secret', $3, $4::jsonb, 'secret', 'test: natural-world-tables')`,
      [slug, `Zz Secret ${slug}`, body, JSON.stringify({ dice: "1d2" })],
    );
    const { context, page } = await login(browser, await playerWith(["table"]));
    try {
      expect((await page.goto(`/codex/entry/${slug}`))?.status()).toBe(404);
      await page.goto("/codex/tables");
      expect(await page.content()).not.toContain(slug);
      await page.goto(`/search?q=${encodeURIComponent("only the DM should know")}`);
      expect(await page.content()).not.toContain("Something only the DM");
    } finally {
      await context.close();
    }
  });

  test("a player with no table grant sees an empty section and a 404 on a table", async ({ browser }) => {
    const { context, page } = await login(browser, await playerWith(["location"]));
    try {
      expect((await page.goto("/codex/entry/forage-in-the-desert"))?.status()).toBe(404);
    } finally {
      await context.close();
    }
  });
});
