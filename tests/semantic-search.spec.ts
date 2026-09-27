import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { embedEntryForTest, closeDbHelpers } from "./db-helpers";
import { createEntryViaUI, deleteEphemeralEntry, testName } from "./helpers";

test.afterAll(async () => {
  await closeDbHelpers();
});

test.describe("semantic search", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("a natural-language query surfaces a semantically related deity even without an exact keyword match", async ({
    page,
  }) => {
    // The pre-generated corpus embeddings (npm run embeddings:generate) cover
    // the existing deities — this queries against that real, already-built
    // index rather than anything created by the test itself.
    await page.goto("/search?q=" + encodeURIComponent("a storm god who rules the sky"));
    const stormGods = page.locator("a", { hasText: /Zeus|Talos|Jupiter/ });
    await expect(stormGods.first()).toBeVisible();
  });

  test("semantic search never surfaces a secret entry to a player, even one it would otherwise match well", async ({
    page,
    browser,
  }) => {
    const distinctiveWord = `Xylocryptid${randomUUID().slice(0, 6)}`;
    const slug = await createEntryViaUI(page, {
      kind: "lore",
      name: testName("semantic-secret"),
      body: `The ${distinctiveWord} is a secret creature known only to the DM, dwelling in forgotten crypts and speaking in riddles no mortal can answer.`,
      visibility: "secret",
    });

    let playerContext: import("@playwright/test").BrowserContext | undefined;
    try {
      await embedEntryForTest(slug);

      playerContext = await browser.newContext({ storageState: "tests/.auth/player.json" });
      const playerPage = await playerContext.newPage();
      await playerPage.goto(
        "/search?q=" + encodeURIComponent("a riddling creature that lives in forgotten crypts"),
      );
      await expect(playerPage.getByText(distinctiveWord)).toHaveCount(0);

      const apiRes = await playerPage.request.get(
        "/api/find?q=" + encodeURIComponent(distinctiveWord),
      );
      const apiBody = await apiRes.json();
      expect(apiBody.results ?? []).toHaveLength(0);
    } finally {
      await playerContext?.close();
      await deleteEphemeralEntry(page, slug).catch(() => {});
    }
  });
});
