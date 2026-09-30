import { test, expect, type Page } from "@playwright/test";
import { SECTIONS } from "../src/lib/kinds";
import { deleteEphemeralEntry, fillEntryForm, testName } from "./helpers";

/**
 * Smoke pass over the pages merged in from main (home sections + location
 * tiers, paginated kind pages, bestiary): every one must render for both roles
 * now that its queries go through the RBAC grant filter.
 */
const SLUGS = SECTIONS.map((s) => s.slug);

async function expectRenders(page: Page, path: string) {
  const res = await page.goto(path);
  expect(res?.status(), path).toBeLessThan(400);
  await expect(page.locator("h1").first(), path).toBeVisible();
  await expect(page.getByText(/application error|unhandled runtime error/i)).toHaveCount(0);
}

for (const role of ["dm", "player"] as const) {
  test.describe(`codex pages (${role})`, () => {
    test.use({ storageState: `tests/.auth/${role}.json` });

    test("home renders its Browse sections", async ({ page }) => {
      await expectRenders(page, "/");
      await expect(page.getByRole("heading", { name: "Browse" })).toBeVisible();
    });

    test("every section page renders", async ({ page }) => {
      for (const slug of SLUGS) await expectRenders(page, `/codex/${slug}`);
    });

    test("an out-of-range or junk ?page clamps instead of erroring", async ({ page }) => {
      await expectRenders(page, "/codex/deities?page=999");
      await expectRenders(page, "/codex/deities?page=abc");
    });
  });
}

test.describe("location sections (dm)", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("there is no flat /codex/locations listing, so nothing links to it", async ({ page }) => {
    const res = await page.goto("/codex/locations");
    expect(res?.status()).toBe(404);
    // The new-location form used to cancel back to that 404.
    await page.goto("/codex/new?kind=location");
    const cancel = page.getByRole("link", { name: /cancel/i });
    await expect(cancel).not.toHaveAttribute("href", "/codex/locations");
  });

  test("archiving a location lands on its tier section, not a 404", async ({ page }) => {
    const name = testName("tier-archive");
    let slug: string | undefined;
    try {
      await page.goto("/codex/new?kind=location");
      await fillEntryForm(page, { name });
      await page.fill("#field-tier", "town");
      await page.getByRole("button", { name: "Create entry" }).click();
      await page.waitForURL(/\/codex\/entry\/.+/);
      slug = decodeURIComponent(page.url().split("/codex/entry/")[1]);

      await page.getByRole("button", { name: "🗄 Archive" }).click();
      await page.getByRole("button", { name: "Yes, archive" }).click();
      await page.waitForURL(/\/codex\/towns/);
      await expect(page.locator("h1").first()).toBeVisible();
    } finally {
      await deleteEphemeralEntry(page, slug ?? name).catch(() => {});
    }
  });
});
