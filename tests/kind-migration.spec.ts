import { execFileSync } from "node:child_process";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { expect, test, type Browser } from "@playwright/test";
import { parseRollTable } from "../src/lib/roll-table";
import { closeDbHelpers, createTestPlayer, deleteTestUser, query } from "./db-helpers";

/**
 * Phase 1: the `fauna` and `table` kinds exist, the original fauna were moved
 * out of `flora` by name, and every legacy roll table has an equivalent
 * `table` entry. The migration script is run for real against the disposable
 * test database; nothing here is mocked.
 */

const PASSWORD = "correct horse battery staple 42";
const SCRIPT = path.join(__dirname, "..", "scripts", "migrate-fauna-and-tables.ts");
const FAUNA = [
  "Aeolian Petrel",
  "The Geese of Juno",
  "Qanat Newt",
  "Malaunian Saiga",
  "Tabrishi'ir Silkmoth",
  "The Numbfish",
  "Acheaorian Hunting Cheetah",
  "The Watching Ibis",
];

function runMigration(...args: string[]): string {
  return execFileSync("npx", ["tsx", SCRIPT, ...args], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
    shell: true,
  });
}

async function namedPlayer(browser: Browser) {
  const username = `zz-kind-${randomUUID().slice(0, 8)}`;
  const userId = await createTestPlayer(username, PASSWORD);
  await query(`UPDATE users SET display_name = $1 WHERE id = $2`, ["Kind Tester", userId]);
  const context = await browser.newContext();
  const page = await context.newPage();
  const res = await page.request.post("/api/auth/login", { data: { username, password: PASSWORD } });
  expect(res.ok()).toBe(true);
  return { userId, context, page };
}

test.afterAll(async () => {
  await closeDbHelpers();
});

test.describe("fauna and table kinds: migration", () => {
  test.beforeAll(() => {
    // Idempotent: brings a fresh checkout of the test DB to the post-migration state.
    runMigration("--apply");
  });

  test("the enum carries both new values", async () => {
    const labels = (
      await query<{ enumlabel: string }>(
        `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'entry_kind'`,
      )
    ).map((r) => r.enumlabel);
    expect(labels).toContain("fauna");
    expect(labels).toContain("table");
  });

  test("all eight original animals are fauna, and none remain in flora", async () => {
    // Fauna also holds the Phase 4 natural-world batches, so assert the migrated eight by name.
    const fauna = await query<{ name: string }>(
      `SELECT name FROM entries WHERE kind = 'fauna' AND archived_at IS NULL AND name = ANY($1) ORDER BY name`,
      [FAUNA],
    );
    expect(fauna.map((r) => r.name).sort()).toEqual([...FAUNA].sort());
    const stillFlora = await query(`SELECT 1 FROM entries WHERE kind = 'flora' AND name = ANY($1)`, [FAUNA]);
    expect(stillFlora).toHaveLength(0);
  });

  test("every legacy roll table has one table entry with the same dice and row count", async () => {
    const legacy = await query<{ id: string; name: string; dice: string; items: unknown[] }>(
      `SELECT id, name, dice, items FROM roll_tables`,
    );
    expect(legacy.length).toBeGreaterThan(0);
    for (const table of legacy) {
      const entries = await query<{ body: string; dice: string }>(
        `SELECT body, fields->>'dice' AS dice FROM entries
         WHERE kind = 'table' AND fields->>'migratedFromRollTableId' = $1`,
        [table.id],
      );
      expect(entries, `entry for "${table.name}"`).toHaveLength(1);
      expect(entries[0].dice).toBe(table.dice);
      expect(parseRollTable(entries[0].body).rows).toHaveLength(table.items.length);
    }
  });

  test("running the migration again changes nothing", async () => {
    const before = await query<{ n: string }>(`SELECT count(*)::text AS n FROM entries`);
    const out = runMigration("--apply");
    const after = await query<{ n: string }>(`SELECT count(*)::text AS n FROM entries`);
    expect(after[0].n).toBe(before[0].n);
    expect(out).toContain("retagged to fauna: 0");
    expect(out).toContain("table entries created: 0");
  });

  test("a dry run reports the plan and writes nothing", async () => {
    const before = await query<{ n: string }>(`SELECT count(*)::text AS n FROM entries`);
    const out = runMigration();
    const after = await query<{ n: string }>(`SELECT count(*)::text AS n FROM entries`);
    expect(out).toContain("Dry run");
    expect(after[0].n).toBe(before[0].n);
  });
});

test.describe("fauna and table kinds: access", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("the DM can open the fauna and table sections", async ({ page }) => {
    expect((await page.goto("/codex/fauna"))?.status()).toBe(200);
    for (const name of FAUNA) await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    expect((await page.goto("/codex/tables"))?.status()).toBe(200);
  });

  test("the old Flora & Fauna address still resolves", async ({ page }) => {
    expect((await page.goto("/codex/flora-fauna"))?.status()).toBe(200);
  });
});

test("an ungranted player sees no fauna or tables: empty sections, 404 entries, nothing in the palette feed", async ({ browser }) => {
  const { userId, context, page } = await namedPlayer(browser);
  try {
    // Sections render for everyone (as every existing kind does) but list nothing.
    expect((await page.goto("/codex/fauna"))?.status()).toBe(200);
    for (const name of FAUNA) await expect(page.getByText(name, { exact: true })).toHaveCount(0);
    expect((await page.goto("/codex/tables"))?.status()).toBe(200);
    // The entries themselves are unreachable.
    expect((await page.goto("/codex/entry/aeolian-petrel"))?.status()).toBe(404);
    const find = await page.request.get("/api/find?q=Aeolian");
    expect(find.ok()).toBe(true);
    expect(JSON.stringify(await find.json())).not.toContain("Aeolian Petrel");
  } finally {
    await context.close();
    await deleteTestUser(userId);
  }
});

test("a fauna kind grant shows public fauna and never secret fauna", async ({ browser }) => {
  const { userId, context, page } = await namedPlayer(browser);
  const secretName = `zz-secret-fauna-${randomUUID().slice(0, 8)}`;
  const slug = secretName.toLowerCase();
  try {
    await query(
      `INSERT INTO entries (slug, kind, name, summary, visibility) VALUES ($1, 'fauna', $2, 'hidden', 'secret')`,
      [slug, secretName],
    );
    await query(`INSERT INTO entry_grants (user_id, kind, granted) VALUES ($1, 'fauna', true)`, [userId]);

    expect((await page.goto("/codex/fauna"))?.status()).toBe(200);
    await expect(page.getByText("Aeolian Petrel", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(secretName)).toHaveCount(0);
    expect((await page.goto(`/codex/entry/${slug}`))?.status()).toBe(404);
  } finally {
    await query(`DELETE FROM entries WHERE slug = $1`, [slug]);
    await context.close();
    await deleteTestUser(userId);
  }
});
