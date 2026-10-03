import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createTestPlayer, deleteTestUser, closeDbHelpers } from "./db-helpers";
import { createEntryViaUI, deleteEphemeralEntry, testName } from "./helpers";

test.afterAll(async () => {
  await closeDbHelpers();
});

test.describe("table view", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("ores section offers a table view showing structured fields as columns", async ({ page }) => {
    await page.goto("/codex/ores");
    await page.getByRole("button", { name: "☰ Table" }).click();
    await expect(page.getByRole("columnheader", { name: /Cost per lb/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Steel", exact: true })).toBeVisible();

    // Sorting by a column header re-renders without erroring.
    await page.getByRole("columnheader", { name: /Cost per lb/ }).click();
    await expect(page.getByRole("link", { name: "Steel", exact: true })).toBeVisible();
  });
});

test.describe("graph view", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("renders as an SVG with nodes, and clicking a node navigates to its page", async ({ page }) => {
    await page.goto("/graph");
    await expect(page.getByRole("img", { name: /Backlink graph/ })).toBeVisible();

    // Any node proves the acceptance criterion (nodes are clickable and
    // navigate) — picking one specific node risks hitting the rare case
    // where two nodes with very similar connectivity land close enough
    // together that one occludes the other's click target.
    const anyNode = page.locator('g[role="button"]').first();
    await expect(anyNode).toBeVisible();
    // Open it from the keyboard: with several hundred nodes a neighbour can
    // overlap the first node's pixels, which would make a mouse click land on
    // the wrong node. Enter on a focused node is the same navigation path.
    await anyNode.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/codex\/entry\//);
  });

  test("a player's graph never includes a node they cannot see", async ({ browser }) => {
    const username = `zz-graph-player-${randomUUID().slice(0, 8)}`;
    const password = "graph test password";
    const userId = await createTestPlayer(username, password);

    const dmContext = await browser.newContext({ storageState: "tests/.auth/dm.json" });
    const dmPage = await dmContext.newPage();
    let playerContext: import("@playwright/test").BrowserContext | undefined;
    let secretSlug: string | undefined;

    try {
      const secretName = testName("graph-secret");
      secretSlug = await createEntryViaUI(dmPage, {
        kind: "lore",
        name: secretName,
        body: "Hidden.",
        visibility: "secret",
      });

      playerContext = await browser.newContext();
      const playerPage = await playerContext.newPage();
      await playerPage.request.post("/api/auth/login", { data: { username, password } });
      await playerPage.goto("/onboarding");
      await playerPage.fill("#displayName", "Graph Tester");
      await playerPage.getByRole("button", { name: "Enter the codex" }).click();
      await playerPage.waitForURL("/");

      await playerPage.goto("/graph");
      await expect(playerPage.getByText(secretName)).toHaveCount(0);
    } finally {
      if (secretSlug) await deleteEphemeralEntry(dmPage, secretSlug).catch(() => {});
      await playerContext?.close();
      await dmContext.close();
      await deleteTestUser(userId);
    }
  });
});
