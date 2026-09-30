import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createTestPlayer, deleteTestUser, query, closeDbHelpers } from "./db-helpers";
import { createEntryViaUI, deleteEphemeralEntry, testName } from "./helpers";

test.afterAll(async () => {
  await closeDbHelpers();
});

test.describe("RBAC control panel (GM)", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("a non-GM cannot reach /admin/rbac or call its API directly", async ({ browser }) => {
    const playerContext = await browser.newContext({ storageState: "tests/.auth/player.json" });
    const playerPage = await playerContext.newPage();

    await playerPage.goto("/admin/rbac");
    await expect(playerPage).toHaveURL("/");

    const res = await playerPage.request.post("/api/rbac", {
      data: { action: "toggleKind", playerId: randomUUID(), kind: "location", granted: true },
    });
    expect(res.status()).toBe(403);

    await playerContext.close();
  });

  test("toggling a kind off hides it immediately, and per-entry approve/reject overrides the kind toggle", async ({
    page,
    browser,
  }) => {
    const username = `zz-rbac-panel-${randomUUID().slice(0, 8)}`;
    const password = "panel test password";
    const userId = await createTestPlayer(username, password);

    let slugA: string | undefined;
    let slugB: string | undefined;
    let playerContext: import("@playwright/test").BrowserContext | undefined;

    try {
      slugA = await createEntryViaUI(page, {
        kind: "location",
        name: testName("panel-town-a"),
        body: "Town A.",
        visibility: "public",
      });
      slugB = await createEntryViaUI(page, {
        kind: "location",
        name: testName("panel-town-b"),
        body: "Town B.",
        visibility: "public",
      });

      // Onboard the player so it has a name and passes the /onboarding gate.
      playerContext = await browser.newContext();
      const playerPage = await playerContext.newPage();
      await playerPage.request.post("/api/auth/login", { data: { username, password } });
      await playerPage.goto("/onboarding");
      await playerPage.fill("#displayName", "Panel Tester");
      await playerPage.getByRole("button", { name: "Enter the codex" }).click();
      await playerPage.waitForURL("/");

      // Neither town visible yet — no grant at all.
      expect((await playerPage.goto(`/codex/entry/${slugA}`))?.status()).toBe(404);

      // GM turns on the whole "location" kind for this player.
      await page.goto(`/admin/rbac?player=${userId}`);
      await page
        .locator("li.card", { hasText: "Locations" })
        .getByRole("button", { name: "Hidden from player" })
        .click();
      await expect(
        page.locator("li.card", { hasText: "Locations" }).getByRole("button", { name: /Visible to player/ }),
      ).toBeVisible();

      await playerPage.goto(`/codex/entry/${slugA}`);
      expect((await playerPage.goto(`/codex/entry/${slugA}`))?.status()).toBe(200);
      expect((await playerPage.goto(`/codex/entry/${slugB}`))?.status()).toBe(200);

      // GM explicitly rejects Town B for this player, overriding the kind-level grant.
      await page.goto(`/admin/rbac?player=${userId}`);
      await page
        .locator("li.card", { hasText: "Locations" })
        .getByRole("button", { name: /entries…/ })
        .click();
      await page.getByLabel(`Select ${(await entryName(page, slugB!))}`).check();
      await page.getByRole("button", { name: "Reject selected" }).click();
      await expect(page.getByText("denied")).toBeVisible();

      expect((await playerPage.goto(`/codex/entry/${slugA}`))?.status()).toBe(200);
      expect((await playerPage.goto(`/codex/entry/${slugB}`))?.status()).toBe(404);
    } finally {
      if (slugA) await deleteEphemeralEntry(page, slugA).catch(() => {});
      if (slugB) await deleteEphemeralEntry(page, slugB).catch(() => {});
      await playerContext?.close();
      await deleteTestUser(userId);
    }
  });
});

async function entryName(page: import("@playwright/test").Page, slug: string): Promise<string> {
  const rows = await query<{ name: string }>(`SELECT name FROM entries WHERE slug = $1`, [slug]);
  return rows[0].name;
}
