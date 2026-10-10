import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { closeDbHelpers, createTestPlayer, deleteTestUser, query } from "./db-helpers";

/**
 * Codex browsing UI: section lists, filters, view toggle, empty and not-found
 * states, the entry page header, and the archive confirmation dialog.
 */

const PASSWORD = "correct horse battery staple 42";
const CARD = 'a[href^="/codex/entry/"] [data-slot="card"]';

test.afterAll(async () => {
  await closeDbHelpers();
});

test.describe("codex browsing (DM)", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("[TC-CODEX-002] a section shows cards with SVG icons, a count, and a New button for the DM", async ({ page }) => {
    await page.goto("/codex/npcs");
    await expect(page.getByRole("heading", { level: 1, name: "NPCs" })).toBeVisible();
    await expect(page.getByRole("link", { name: /^New NPC$/ })).toBeVisible();
    const cards = page.locator(CARD);
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(10);
    await expect(cards.first().locator("svg").first()).toBeVisible();
    expect(await page.locator("main").innerText()).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  test("[TC-CODEX-003] the text filter narrows the list and says how many remain; clearing restores it", async ({ page }) => {
    await page.goto("/codex/npcs");
    await expect(page.locator(CARD).first()).toBeVisible();
    const total = await page.locator(CARD).count();
    const filter = page.getByRole("textbox", { name: /Filter/ });
    await filter.fill("Kaelen");
    await expect(page.getByText(/^\d+ of \d+$/)).toBeVisible();
    const narrowed = await page.locator(CARD).count();
    expect(narrowed).toBeGreaterThan(0);
    expect(narrowed).toBeLessThan(total);

    await filter.fill("zzzz-nothing-matches-this");
    await expect(page.getByText("Nothing matches that filter")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.locator(CARD).first()).toBeVisible();
    await expect(filter).toHaveValue("");
  });

  test("[TC-CODEX-004] tag chips filter and report their pressed state", async ({ page }) => {
    await page.goto("/codex/npcs");
    const chip = page.getByRole("button", { name: /^legion/ });
    await expect(chip).toHaveAttribute("aria-pressed", "false");
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: /^All$/ }).click();
    await expect(chip).toHaveAttribute("aria-pressed", "false");
  });

  test("[TC-CODEX-005] an unknown section and an unknown entry are real 404s with a friendly page and a way back", async ({ page }) => {
    for (const url of ["/codex/not-a-section", "/codex/entry/not-an-entry-xyz"]) {
      const res = await page.goto(url);
      expect(res?.status(), url).toBe(404);
      await expect(page.getByText("This page is not in the codex")).toBeVisible();
      await expect(page.getByRole("link", { name: "Back to the front page" })).toBeVisible();
    }
  });

  test("[TC-CODEX-006] an entry page has a breadcrumb ending in the current page, and no stack-trace text", async ({ page }) => {
    await page.goto("/codex/entry/corinth-city");
    const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(crumbs.locator('[aria-current="page"]')).toHaveText("Corinth City");
    await expect(crumbs.getByRole("link")).not.toHaveCount(0);
    await expect(page.getByText(/at .*\(.*:\d+:\d+\)/)).toHaveCount(0);
  });

  test("[TC-CODEX-007] Archive asks first; Cancel and Escape leave the entry alone", async ({ page }) => {
    await page.goto("/codex/entry/corinth-city");
    const trigger = page.getByRole("button", { name: "Archive", exact: true });
    await trigger.click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Archive Corinth City?");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);

    await trigger.click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();

    const rows = await query(`SELECT archived_at FROM entries WHERE slug = 'corinth-city'`);
    expect(rows[0]).toEqual({ archived_at: null });
  });

  test("[TC-CODEX-008] the front page renders its strips and the Browse tiles", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Browse" })).toBeVisible();
    await expect(page.getByRole("region", { name: /Prologue/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "The Three Empires" })).toBeVisible();
  });
});

test("[TC-CODEX-001] an empty section shows an icon, a title and a hint to a player; no create button", async ({ browser }) => {
  const username = `zz-ui-${randomUUID().slice(0, 8)}`;
  const userId = await createTestPlayer(username, PASSWORD);
  await query(`UPDATE users SET display_name = 'UI Tester' WHERE id = $1`, [userId]);
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    expect((await page.request.post("/api/auth/login", { data: { username, password: PASSWORD } })).ok()).toBe(true);
    await page.goto("/codex/fauna");
    await expect(page.getByText("No fauna yet")).toBeVisible();
    await expect(page.getByText("Nothing here has been revealed to the party.")).toBeVisible();
    await expect(page.getByRole("link", { name: /^New/ })).toHaveCount(0);
  } finally {
    await context.close();
    await deleteTestUser(userId);
  }
});

test.describe("search page", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("[TC-CODEX-009] no results shows a friendly empty state, not bare text", async ({ page }) => {
    await page.goto("/search?q=qxzjvkw");
    await expect(page.getByText("No matches", { exact: true })).toBeVisible();
    await expect(page.getByText(/Try fewer words/)).toBeVisible();
  });

  test("[TC-CODEX-010] an unknown tag shows an empty state with a way to search", async ({ page }) => {
    await page.goto("/search?tag=zz-no-such-tag");
    await expect(page.getByText("Nothing carries that tag")).toBeVisible();
    await expect(page.getByRole("link", { name: "Search the codex" })).toBeVisible();
  });
});
