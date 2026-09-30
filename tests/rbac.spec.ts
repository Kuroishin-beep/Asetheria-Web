import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  createTestPlayer,
  deleteTestUser,
  getUserDisplayName,
  countGrantsForUser,
  query,
  closeDbHelpers,
} from "./db-helpers";
import { createEntryViaUI, deleteEphemeralEntry, testName } from "./helpers";

test.afterAll(async () => {
  await closeDbHelpers();
});

test.describe("player onboarding + default RBAC grants", () => {
  test("a brand-new player is asked to name themselves, then sees only empires + major cities by default", async ({
    browser,
  }) => {
    const username = `zz-rbac-player-${randomUUID().slice(0, 8)}`;
    const password = "correct horse battery staple";
    const userId = await createTestPlayer(username, password);

    const dmContext = await browser.newContext({ storageState: "tests/.auth/dm.json" });
    const dmPage = await dmContext.newPage();

    let majorCitySlug: string | undefined;
    let ordinaryCitySlug: string | undefined;
    let playerContext: import("@playwright/test").BrowserContext | undefined;

    try {
      // Two public locations, differing only in the `major-city` tag — the
      // one variable this test actually exercises.
      majorCitySlug = await createEntryViaUI(dmPage, {
        kind: "location",
        name: testName("major-city"),
        body: "A default-visible city.",
        tags: "major-city",
        visibility: "public",
      });
      ordinaryCitySlug = await createEntryViaUI(dmPage, {
        kind: "location",
        name: testName("ordinary-town"),
        body: "Not tagged major-city — must stay hidden by default.",
        visibility: "public",
      });

      playerContext = await browser.newContext();
      const playerPage = await playerContext.newPage();

      const loginRes = await playerPage.request.post("/api/auth/login", {
        data: { username, password },
      });
      expect(loginRes.ok()).toBeTruthy();
      const loginBody = await loginRes.json();
      expect(loginBody.needsName).toBe(true);

      // Cookie set by the API call belongs to this context's cookie jar
      // already (Playwright's page.request shares the browser context).
      await playerPage.goto("/");
      await expect(playerPage).toHaveURL("/onboarding");

      await playerPage.fill("#displayName", "Kestra");
      await playerPage.getByRole("button", { name: "Enter the codex" }).click();
      await playerPage.waitForURL("/");

      expect(await getUserDisplayName(userId)).toBe("Kestra");
      // `empire` kind grant + at least the one major-city entry grant.
      expect(await countGrantsForUser(userId)).toBeGreaterThanOrEqual(2);

      await playerPage.goto(`/codex/entry/${majorCitySlug}`);
      await expect(playerPage.getByRole("heading", { level: 1 })).toBeVisible();

      const res = await playerPage.goto(`/codex/entry/${ordinaryCitySlug}`);
      // Not granted by default, even though it's `public` — the app 404s
      // rather than redirecting, matching how it treats an unreadable slug.
      expect(res?.status()).toBe(404);
    } finally {
      if (majorCitySlug) await deleteEphemeralEntry(dmPage, majorCitySlug).catch(() => {});
      if (ordinaryCitySlug) await deleteEphemeralEntry(dmPage, ordinaryCitySlug).catch(() => {});
      await playerContext?.close();
      await dmContext.close();
      await deleteTestUser(userId);
    }
  });
});

test.describe("secret visibility always overrides a grant", () => {
  test("explicitly granting a secret entry to a player still hides it", async ({ browser }) => {
    const username = `zz-rbac-secret-${randomUUID().slice(0, 8)}`;
    const password = "another fine password";
    const userId = await createTestPlayer(username, password);

    const dmContext = await browser.newContext({ storageState: "tests/.auth/dm.json" });
    const dmPage = await dmContext.newPage();
    let playerContext: import("@playwright/test").BrowserContext | undefined;
    let slug: string | undefined;

    try {
      slug = await createEntryViaUI(dmPage, {
        kind: "lore",
        name: testName("secret-lore"),
        body: "The DM's eyes only.",
        visibility: "secret",
      });

      const entryRows = await query<{ id: string }>(
        `SELECT id FROM entries WHERE slug = $1`,
        [slug],
      );
      const entryId = entryRows[0].id;

      // The strongest possible grant a GM could accidentally create: a
      // direct, explicit "yes, show this one" on a secret entry.
      await query(
        `INSERT INTO entry_grants (user_id, entry_id, granted) VALUES ($1, $2, true)`,
        [userId, entryId],
      );

      playerContext = await browser.newContext();
      const playerPage = await playerContext.newPage();
      const loginRes = await playerPage.request.post("/api/auth/login", {
        data: { username, password },
      });
      expect(loginRes.ok()).toBeTruthy();

      // Clear onboarding out of the way first — this test is about the
      // secret/grant interaction, not the welcome flow (covered above).
      await playerPage.goto("/onboarding");
      await playerPage.fill("#displayName", "Test Rogue");
      await playerPage.getByRole("button", { name: "Enter the codex" }).click();
      await playerPage.waitForURL("/");

      const res = await playerPage.goto(`/codex/entry/${slug}`);
      expect(res?.status()).toBe(404);
    } finally {
      if (slug) await deleteEphemeralEntry(dmPage, slug).catch(() => {});
      await playerContext?.close();
      await dmContext.close();
      await deleteTestUser(userId);
    }
  });
});
