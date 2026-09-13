import { test, expect } from "@playwright/test";

const VIEWPORTS = [
  { name: "mobile-375", width: 375, height: 812 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1280", width: 1280, height: 900 },
];

test.describe("login page responsiveness + theming", () => {
  for (const vp of VIEWPORTS) {
    test(`renders without horizontal overflow at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/login");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflow).toBe(false);
      await expect(page.getByRole("button", { name: "Enter" })).toBeVisible();
    });
  }

  test("dark theme is the default and persists across reload", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("keyboard-only pass reaches username, password, show/hide, and submit in order", async ({
    page,
  }) => {
    await page.goto("/login");
    // The username field carries `autofocus`, so it's already focused on
    // load — the first Tab is expected to move focus onward, not onto it.
    await expect(page.locator("#username")).toBeFocused();
    await page.keyboard.type("someone");
    await page.keyboard.press("Tab");
    await expect(page.locator("#password")).toBeFocused();
    // Submit stays disabled (and out of the tab order) until both fields
    // have a value, so give it one before checking the rest of the order.
    await page.keyboard.type("whatever12345");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: /show password/i })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Enter" })).toBeFocused();
  });
});
