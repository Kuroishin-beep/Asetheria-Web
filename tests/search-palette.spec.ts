import { test, expect } from "@playwright/test";

test.use({ storageState: "tests/.auth/dm.json" });

test.describe("command palette", () => {
  test("Ctrl+K opens it, typing filters, Enter navigates", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog", { name: /search the codex/i })).toBeVisible();

    await page.getByPlaceholder(/find a god, city, faction/i).fill("Bacchus");
    await expect(page.getByText(/bacchus/i).first()).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/codex\/entry\/.+/);
  });

  test("Escape closes the palette", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test.describe("full-text search", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("finds entries via /search and via /api/find", async ({ page }) => {
    await page.goto("/search?q=Bacchus");
    await expect(page.getByRole("link", { name: /bacchus/i }).first()).toBeVisible();

    const res = await page.request.get("/api/find?q=Bacchus");
    const body = await res.json();
    expect((body.results ?? []).length).toBeGreaterThan(0);
  });
});
