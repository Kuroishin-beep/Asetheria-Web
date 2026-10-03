import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createEntryViaUI, deleteEphemeralEntry, testName } from "./helpers";

/**
 * A single lowercase token no real codex entry will ever contain. No "zz"
 * prefix: every test entry's *name* starts with "zz-playwright-", and the
 * embedding model scores two zz-gibberish strings as similar enough to clear
 * the semantic-search floor — which would look like a leak and is not one.
 */
function uniqueWord(label: string): string {
  return `${label}${randomUUID().replace(/[^a-f]/g, "").slice(0, 10)}`;
}

test.describe("search safety", () => {
  test("a player cannot find a public entry by words only in its DM notes", async ({
    browser,
  }) => {
    const dmContext = await browser.newContext({ storageState: "tests/.auth/dm.json" });
    const dmPage = await dmContext.newPage();
    const playerContext = await browser.newContext({
      storageState: "tests/.auth/player.json",
    });
    const playerPage = await playerContext.newPage();
    // Name and secret word share no stem, so semantic search on the name
    // cannot be mistaken for a leak of the notes.
    const name = testName("harbour-ledger");
    const secretWord = uniqueWord("qv");
    let slug: string | undefined;
    try {
      slug = await createEntryViaUI(dmPage, {
        kind: "note",
        name,
        summary: "A perfectly ordinary public entry.",
        body: "Nothing to see here.",
        dmNotes: `The innkeeper is secretly ${secretWord}.`,
        visibility: "public",
      });

      // The DM's search still reaches DM notes...
      await dmPage.goto(`/search?q=${secretWord}`);
      await expect(dmPage.getByRole("link", { name })).toBeVisible();

      // ...but the player gets no hit at all, not just a redacted snippet.
      await playerPage.goto(`/search?q=${secretWord}`);
      await expect(playerPage.getByRole("link", { name })).toHaveCount(0);
      await expect(playerPage.getByText(secretWord)).toHaveCount(0);
    } finally {
      await deleteEphemeralEntry(dmPage, slug ?? name).catch(() => {});
      await playerContext.close();
      await dmContext.close();
    }
  });
});

test.describe("search snippets", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("HTML in an entry body is escaped, highlighting survives", async ({ page }) => {
    const name = testName("snippet-xss");
    const word = uniqueWord("snip");
    // ts_headline drops well-formed tags from fragment snippets, but an
    // unterminated one survives verbatim, and a browser would still parse it
    // as an <img> element if the snippet were inserted unescaped.
    const payload = `<img src=x id=${word} onerror=window.__snippetXss=1//`;
    let slug: string | undefined;
    try {
      slug = await createEntryViaUI(page, {
        kind: "note",
        name,
        body: `the ${word} ${payload} was here`,
        visibility: "public",
      });

      await page.goto(`/search?q=${word}`);
      await expect(page.getByRole("link", { name })).toBeVisible();

      // Rendered as text, never as an element.
      await expect(page.locator(`img#${word}`)).toHaveCount(0);
      await expect(page.getByText("<img src=x", { exact: false })).toBeVisible();
      const fired = await page.evaluate(
        () => (window as { __snippetXss?: number }).__snippetXss,
      );
      expect(fired).toBeUndefined();
      // Highlighting still works.
      await expect(page.locator("mark", { hasText: word }).first()).toBeVisible();
    } finally {
      await deleteEphemeralEntry(page, slug ?? name).catch(() => {});
    }
  });
});
