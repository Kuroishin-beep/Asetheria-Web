import { test, expect } from "@playwright/test";
import { testName } from "./helpers";

test.use({ storageState: "tests/.auth/dm.json" });

test.describe("roll tables (DM)", () => {
  test("create a table, roll it, archive it, then restore it", async ({ page }) => {
    const name = testName("table");
    await page.goto("/tools/tables");
    await page.getByRole("button", { name: "+ New table" }).click();

    await page.fill("#t-name", name);
    await page.fill("#t-dice", "1d4");
    await page.selectOption("#t-vis", "public");

    // Default row is 1-1; add three more so 1d4 always lands on a row.
    await page.getByRole("button", { name: "+ Add row" }).click();
    await page.getByRole("button", { name: "+ Add row" }).click();
    await page.getByRole("button", { name: "+ Add row" }).click();

    const mins = [1, 2, 3, 4];
    const results = ["Sword", "Shield", "Potion", "Scroll"];
    for (let i = 0; i < 4; i++) {
      await page.getByLabel(`Row ${i + 1} minimum`).fill(String(mins[i]));
      await page.getByLabel(`Row ${i + 1} maximum`).fill(String(mins[i]));
      await page.getByLabel(`Row ${i + 1} result`).fill(results[i]);
    }

    await page.getByRole("button", { name: "Save table" }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();

    const card = page.locator(".card", { has: page.getByRole("heading", { name }) });

    // Regression test for the accessible-name bug: these icon-only buttons
    // previously relied only on `title`, which the accessible-name
    // algorithm ignores in favor of visible text (the bare emoji).
    await expect(card.getByRole("button", { name: `Edit ${name}` })).toBeVisible();
    await expect(card.getByRole("button", { name: `Archive ${name}` })).toBeVisible();

    await card.getByRole("button", { name: "🎲 Roll" }).click();
    const resultText = await card.locator("span", { hasText: /Sword|Shield|Potion|Scroll/ }).textContent();
    expect(results).toContain(resultText?.trim());

    await card.getByRole("button", { name: `Archive ${name}` }).click();
    await expect(page.getByRole("heading", { name })).toHaveCount(0, { timeout: 5_000 });

    // Regression test for the missing-restore-UI gap: archived tables now
    // surface in a "Archived tables" section with a working restore action.
    const archivedSection = page.getByText(/Archived tables/);
    await expect(archivedSection).toBeVisible();
    await archivedSection.click(); // <details><summary> toggle
    await page.getByRole("button", { name: `Restore ${name}` }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 5_000 });

    // Cleanup: archive again so this ephemeral table doesn't linger in the
    // active list (no hard-delete path exists for roll tables — archived is
    // the closest the app's own UI offers, consistent with PLAN.md's note
    // that this is acceptable only in the disposable local test database).
    await card.getByRole("button", { name: `Archive ${name}` }).click();
  });
});
