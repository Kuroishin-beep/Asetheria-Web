import { test, expect } from "@playwright/test";

test.describe("homebrew content import (metals + flora)", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("new metals are browsable with their cost/AC stats, and existing ore lore is untouched", async ({
    page,
  }) => {
    await page.goto("/codex/entry/steel");
    await expect(page.getByRole("heading", { name: "Steel", level: 1 })).toBeVisible();
    await expect(page.getByText("4 gp")).toBeVisible();

    // The setting's own hand-written Cold Iron page must still show its
    // original lore, not be replaced by the reference-table description.
    await page.goto("/codex/entry/cold-iron");
    await expect(
      page.getByText("Disrupts magical effects on contact", { exact: false }),
    ).toBeVisible();
    // ...but now also carries the new structured stat (absent before Phase 1).
    await expect(page.getByText("Armor Class")).toBeVisible();
  });

  test("herb entries and the d20 field guide roll table are present", async ({ page }) => {
    await page.goto("/codex/entry/woundwort");
    await expect(page.getByRole("heading", { name: "Woundwort", level: 1 })).toBeVisible();

    await page.goto("/tools/tables");
    await expect(page.getByText("The Herbalist's Field Guide (d20)")).toBeVisible();
  });

  test("planar metals from the external GM Binder scan are present, and the officially-sourced plants page was not imported", async ({
    page,
  }) => {
    await page.goto("/codex/entry/aximium");
    await expect(page.getByRole("heading", { name: "Aximium", level: 1 })).toBeVisible();
    await expect(page.getByText("The Abyss", { exact: false }).first()).toBeVisible();

    // The house rule synthesized from the herbalism-kit GM Binder page.
    await page.goto("/codex/entry/foraging-and-herbalism-checks");
    await expect(
      page.getByRole("heading", { name: "Foraging & Herbalism Checks", level: 1 }),
    ).toBeVisible();

    // The "5e Official Plants Lists" page (verbatim WotC sourcebook content)
    // was deliberately not imported — no entry should exist for it.
    const res = await page.goto("/codex/entry/dancing-monkey-fruit");
    expect(res?.status()).toBe(404);
  });
});
