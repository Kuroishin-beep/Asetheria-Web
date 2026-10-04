import { expect, test } from "@playwright/test";
import { closeDbHelpers, query } from "./db-helpers";

/**
 * The error boundary, exercised for real: the `entries` table is renamed away
 * for the duration of one request so the app's own queries fail, the way a
 * database outage would. The test must always put the table back, so it
 * self-heals first in case an earlier run was killed mid-way.
 */

test.use({ storageState: "tests/.auth/dm.json" });

async function restoreIfNeeded() {
  const offline = await query(`SELECT to_regclass('public.entries_offline') AS t`);
  const online = await query(`SELECT to_regclass('public.entries') AS t`);
  if (offline[0].t && !online[0].t) await query(`ALTER TABLE entries_offline RENAME TO entries`);
}

test.beforeAll(restoreIfNeeded);
test.afterAll(async () => {
  await restoreIfNeeded();
  await closeDbHelpers();
});

test("a failing data layer shows a friendly error with Try again, never raw error text, and Try again recovers", async ({ page }) => {
  await query(`ALTER TABLE entries RENAME TO entries_offline`);
  try {
    await page.goto("/codex/npcs");
    await expect(page.getByRole("heading", { name: "Something went wrong" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();

    // No driver message, table name, or stack trace reaches the page.
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/relation|entries_offline|does not exist|ECONN|Error:|\bat\s+\S+\s+\(/i);
  } finally {
    await query(`ALTER TABLE entries_offline RENAME TO entries`);
  }

  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "NPCs" })).toBeVisible();
});
