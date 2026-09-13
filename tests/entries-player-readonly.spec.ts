import { test, expect } from "@playwright/test";
import { createEntryViaUI, deleteEphemeralEntry, testName } from "./helpers";

test.describe("player role is strictly read-only", () => {
  test.use({ storageState: "tests/.auth/player.json" });

  test("no write affordances appear anywhere in the shell", async ({ page }) => {
    await page.goto("/");
    // `exact: true` matters here: other tests' ephemeral entries can be
    // named things like "zz-playwright-crud-archive-<uuid>", whose dashboard
    // card link would otherwise substring-match "Archive" and look like the
    // DM-only sidebar link. Scoping to the exact nav label avoids that.
    await expect(page.getByRole("link", { name: /^New/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Archive", exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Backup & Import", exact: true }),
    ).toHaveCount(0);
  });

  test("/codex/new redirects a player away", async ({ page }) => {
    await page.goto("/codex/new");
    await expect(page).toHaveURL("/");
  });

  test("/admin redirects a player away", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL("/");
  });

  test("/archive redirects a player away", async ({ page }) => {
    await page.goto("/archive");
    await expect(page).toHaveURL("/");
  });

  test("/api/export is forbidden for a player", async ({ page }) => {
    const res = await page.request.get("/api/export");
    expect(res.status()).toBe(403);
  });

  test("a secret entry is invisible in list, search, and by direct URL", async ({
    browser,
  }) => {
    // Create the secret entry as DM in one context...
    const dmContext = await browser.newContext({ storageState: "tests/.auth/dm.json" });
    const dmPage = await dmContext.newPage();
    const name = testName("secret-hide");
    let playerContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;
    try {
      const slug = await createEntryViaUI(dmPage, {
        kind: "note",
        name,
        summary: "Players must never see this.",
        visibility: "secret",
      });

      // ...then confirm the player can't reach it any of the usual ways.
      playerContext = await browser.newContext({ storageState: "tests/.auth/player.json" });
      const playerPage = await playerContext.newPage();

      const direct = await playerPage.goto(`/codex/entry/${slug}`);
      expect(direct?.status()).toBe(404);

      await playerPage.goto("/codex/notes");
      await expect(playerPage.getByText(name)).toHaveCount(0);

      const searchRes = await playerPage.request.get(
        `/api/find?q=${encodeURIComponent(name)}`,
      );
      const searchBody = await searchRes.json();
      expect(searchBody.results ?? []).toHaveLength(0);

      await deleteEphemeralEntry(dmPage, slug);
    } finally {
      await playerContext?.close();
      await deleteEphemeralEntry(dmPage, name).catch(() => {});
      await dmContext.close();
    }
  });
});
