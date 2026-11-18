import { expect, test } from "@playwright/test";

/**
 * The codex books: two static pages in public/books. The players' guide is for anyone signed in; the DM codex
 * (secrets, DM notes, the bestiary) is for the DM alone, and is a plain 404 to everyone else.
 */

const GUIDE = "/books/players-guide.html";
const DM_BOOK = "/books/dm-codex.html";

test.describe("codex books: signed out", () => {
  test("[TC-BOOK-001] neither book is served to a stranger: both send them to the welcome page", async ({ page }) => {
    for (const path of [GUIDE, DM_BOOK]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/welcome/);
    }
  });
});

test.describe("codex books: player", () => {
  test.use({ storageState: "tests/.auth/player.json" });

  test("[TC-BOOK-002] a player can read the players' guide, and it holds none of the DM's secrets", async ({ page }) => {
    const res = await page.goto(GUIDE);
    expect(res?.status()).toBe(200);
    await expect(page).toHaveTitle(/Asetheria/);
    const text = await page.locator("body").innerText();
    for (const secret of ["reanimated", "The Fool", "Adapted from"]) expect(text, secret).not.toContain(secret);
  });

  test("[TC-BOOK-003] a player asking for the DM codex gets a plain 404", async ({ request }) => {
    const res = await request.get(DM_BOOK, { maxRedirects: 0 });
    expect(res.status()).toBe(404);
    expect(await res.text()).not.toContain("Asetheria");
  });

  test("[TC-BOOK-004] a player's sidebar links the guide and not the DM codex", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Players' Guide", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "DM Codex", exact: true })).toHaveCount(0);
  });
});

test.describe("codex books: DM", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("[TC-BOOK-005] the DM can open the DM codex from the sidebar, and it is never cached by shared caches", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    const link = page.getByRole("link", { name: "DM Codex", exact: true });
    await expect(link).toHaveAttribute("href", DM_BOOK);
    const res = await page.goto(DM_BOOK);
    expect(res?.status()).toBe(200);
    expect(res?.headers()["cache-control"]).toContain("no-store");
    await expect(page).toHaveTitle(/Asetheria Codex Expansion/);
  });
});
