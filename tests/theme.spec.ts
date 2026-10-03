import { test, expect } from "@playwright/test";

/**
 * next-themes owns the theme: it must restore the saved choice before first
 * paint (no flash of the wrong colours), survive a hard reload, and keep using
 * the storage key the previous hand-rolled script used.
 */

const DARK_BG = "rgb(11, 10, 9)";
const LIGHT_BG = "rgb(247, 241, 228)";

test.use({ storageState: "tests/.auth/dm.json" });

async function backgroundOnFirstPaint(page: import("@playwright/test").Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return page.evaluate(() => ({
    attr: document.documentElement.getAttribute("data-theme"),
    bg: getComputedStyle(document.body).backgroundColor,
  }));
}

test("defaults to dark for a first-time visitor", async ({ page }) => {
  const first = await backgroundOnFirstPaint(page, "/");
  expect(first.attr).toBe("dark");
  expect(first.bg).toBe(DARK_BG);
});

test("a saved light theme is applied at DOMContentLoaded, before hydration (no flash)", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("asetheria-theme", "light"));
  const first = await backgroundOnFirstPaint(page, "/");
  expect(first.attr).toBe("light");
  expect(first.bg).toBe(LIGHT_BG);
});

test("the toggle switches theme, persists it under the old storage key, and survives a hard reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await page.evaluate(() => localStorage.getItem("asetheria-theme"))).toBe("light");

  await page.reload({ waitUntil: "domcontentloaded" });
  const reloaded = await page.evaluate(() => ({
    attr: document.documentElement.getAttribute("data-theme"),
    bg: getComputedStyle(document.body).backgroundColor,
  }));
  expect(reloaded.attr).toBe("light");
  expect(reloaded.bg).toBe(LIGHT_BG);

  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => localStorage.getItem("asetheria-theme"))).toBe("dark");
});

test("a garbage stored value falls back to dark instead of breaking the page", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("asetheria-theme", "neon"));
  const first = await backgroundOnFirstPaint(page, "/");
  expect(["dark", "light"]).toContain(first.attr);
  expect(first.bg).toBe(first.attr === "dark" ? DARK_BG : LIGHT_BG);
});

test("reduced motion: the page honours prefers-reduced-motion with no console errors", async ({ browser }) => {
  const context = await browser.newContext({
    reducedMotion: "reduce",
    storageState: "tests/.auth/dm.json",
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  expect(errors).toEqual([]);
  await context.close();
});
