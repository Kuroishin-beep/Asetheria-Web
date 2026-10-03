import { expect, test } from "@playwright/test";

/**
 * The application shell: top bar, sidebar navigation, mobile drawer,
 * skip link, role-aware sections and sign-out.
 */

test.describe("app shell (DM)", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("desktop: sidebar lists sections with SVG icons and marks the current page", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/codex/npcs");
    const nav = page.getByRole("navigation", { name: "Codex sections" });
    await expect(nav).toBeVisible();

    const current = nav.locator('a[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toContainText("NPCs");

    // Every nav item draws an icon as an SVG, never an emoji glyph.
    const links = nav.getByRole("link");
    const count = await links.count();
    expect(count).toBeGreaterThan(20);
    for (let i = 0; i < count; i++) {
      await expect(links.nth(i).locator("svg")).toHaveCount(1);
    }
    expect(await nav.innerText()).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  test("desktop: DM sees the Keeper section and the New button", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Archive", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Backup & Import", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Players & Access", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /^New/ })).toBeVisible();
  });

  test("mobile 375px: sidebar is hidden, the menu button opens a drawer, Escape closes it and returns focus", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    const menuButton = page.getByRole("button", { name: "Toggle navigation menu" });
    await expect(menuButton).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Codex sections" })).toHaveCount(0);

    await menuButton.click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("navigation", { name: "Codex sections" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(menuButton).toBeFocused();
  });

  test("mobile: choosing a section navigates and closes the drawer", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page.getByRole("button", { name: "Toggle navigation menu" }).click();
    await page.getByRole("dialog").getByRole("link", { name: /^NPCs/ }).click();
    await expect(page).toHaveURL(/\/codex\/npcs$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("the skip link is the first tab stop and moves focus to the main region", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main")).toBeFocused();
  });

  test("no horizontal page scroll at 375, 768 and 1280px", async ({ page }) => {
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `overflow at ${width}px`).toBeLessThanOrEqual(0);
    }
  });

  test("sign out returns to the welcome page and protects the codex", async ({ browser }) => {
    // Own session: signing out must not invalidate the shared saved DM cookie.
    const context = await browser.newContext();
    const page = await context.newPage();
    const res = await page.request.post("/api/auth/login", {
      data: { username: process.env.DM_USERNAME ?? "playwright-dm", password: process.env.DM_PASSWORD },
    });
    expect(res.ok()).toBe(true);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: /^Sign out/ }).click();
    await expect(page).toHaveURL(/\/welcome/);
    await page.goto("/codex/npcs");
    await expect(page).toHaveURL(/\/welcome/);
    await context.close();
  });
});

test.describe("app shell (player)", () => {
  test.use({ storageState: "tests/.auth/player.json" });

  test("a player has no Keeper section and no New button", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Codex sections" })).toBeVisible();
    await expect(page.getByText("Keeper", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Players & Access" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^New/ })).toHaveCount(0);
    await expect(page.getByTitle("Read-only access")).toBeVisible();
  });
});
