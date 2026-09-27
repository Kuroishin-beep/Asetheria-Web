import { test, expect } from "@playwright/test";

test.describe("Foundry VTT compendium import", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("an imported character is browsable with race/role and readable biography text", async ({
    page,
  }) => {
    await page.goto("/codex/entry/thorfinn-hugrakkur");
    await expect(
      page.getByRole("heading", { name: "Thorfinn Hugrakkur", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("Mountain Dwarf").first()).toBeVisible();
    await expect(page.getByText("Barbarian", { exact: false }).first()).toBeVisible();
    // Biography HTML was stripped, not escaped-and-shown-literally.
    await expect(page.getByText("<p>", { exact: false })).toHaveCount(0);
    await expect(page.getByText("clan Hugrakkur", { exact: false })).toBeVisible();
  });
});
