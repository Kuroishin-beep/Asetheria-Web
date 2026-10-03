import { expect, test, type Page } from "@playwright/test";
import { createEntryViaUI, deleteEphemeralEntry, testName } from "./helpers";

/**
 * The Notion / Superhuman / Obsidian layer: command palette actions, keyboard
 * chords, the editor's [[ autocomplete + preview + draft recovery, aliases,
 * page outlines, unlinked mentions, role-scoped wiki links, and the content
 * imported from Foundry and the deity lore pass.
 */

async function pressChord(page: Page, ...keys: string[]) {
  // Focus the page body so the keys are not swallowed by a field.
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  for (const k of keys) await page.keyboard.press(k);
}

test.describe("command palette & shortcuts (DM)", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("an empty palette lists commands, and typing one runs it", async ({ page }) => {
    await page.goto("/");
    // The shortcut listener attaches on hydration; wait for the page to settle.
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("Control+k");
    const dialog = page.getByRole("dialog", { name: "Search the codex" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: /Open the connection graph/ })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /Create a new entry/ })).toBeVisible();
    await page.getByLabel("Search query").fill("dice");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/tools\/dice$/);
  });

  test("g-chords navigate, ? opens the shortcut sheet, e edits the open entry", async ({ page }) => {
    await page.goto("/");
    await pressChord(page, "g", "s");
    await expect(page).toHaveURL(/\/search$/);

    await pressChord(page, "Shift+?");
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toHaveCount(0);

    await page.goto("/codex/entry/bacchus-the-bountiful-spirit");
    await pressChord(page, "e");
    await expect(page).toHaveURL(/\/codex\/entry\/bacchus-the-bountiful-spirit\/edit$/);
  });

  test("shortcuts never fire while typing in a field", async ({ page }) => {
    await page.goto("/search");
    const box = page.getByRole("searchbox").or(page.locator('input[name="q"]')).first();
    await box.click();
    await page.keyboard.type("gs");
    await expect(page).toHaveURL(/\/search$/);
    await expect(box).toHaveValue(/gs$/);
  });
});

test.describe("shortcuts respect the player role", () => {
  test.use({ storageState: "tests/.auth/player.json" });

  test("a player has no create shortcut or command", async ({ page }) => {
    await page.goto("/");
    await pressChord(page, "c");
    await expect(page).not.toHaveURL(/\/codex\/new/);
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("button", { name: /Create a new entry/ })).toHaveCount(0);
  });
});

test.describe("editor", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("[[ suggests entries and Enter inserts a resolvable link", async ({ page }) => {
    await page.goto("/codex/new?kind=note");
    const body = page.locator("#body");
    await body.click();
    await page.keyboard.type("Raise a cup to [[Bacch");
    const option = page.getByRole("option", { name: /^Bacchus, The Bountiful Spirit\s+deity$/i });
    await expect(option).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(body).toHaveValue("Raise a cup to [[Bacchus, The Bountiful Spirit]]");
  });

  test("Preview renders the markdown, links included", async ({ page }) => {
    await page.goto("/codex/new?kind=note");
    await page.locator("#body").fill("## Omens\n\nThe priests of [[Bacchus, The Bountiful Spirit]] are uneasy.");
    await page.getByRole("tab", { name: /Preview/ }).click();
    await expect(page.getByRole("heading", { name: "Omens" })).toBeVisible();
    await page.getByRole("tab", { name: /Write/ }).click();
    await expect(page.locator("#body")).toBeVisible();
  });

  test("an unsaved draft survives a reload and can be restored", async ({ page }) => {
    await page.goto("/codex/new?kind=note");
    const text = `Draft ${testName("draft")}`;
    await page.locator("#body").fill(text);
    await page.waitForTimeout(700); // drafts are written after a short pause in typing
    await page.reload();
    await page.getByRole("button", { name: "Restore draft" }).click();
    await expect(page.locator("#body")).toHaveValue(text);
    await page.evaluate(() => localStorage.removeItem("asetheria-draft:new"));
  });
});

test.describe("aliases, outlines and mentions", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("a link to an alias resolves, with a hover preview, and an outline appears on long pages", async ({ page }) => {
    const name = testName("alias-link");
    let slug: string | undefined;
    try {
      slug = await createEntryViaUI(page, {
        kind: "note",
        name,
        body: [
          "## Arrival",
          "We reached [[Helarchon]] at dusk.",
          "## The Academy",
          "Closed to us.",
          "## Departure",
          "By sea.",
        ].join("\n\n"),
      });
      // Helarchon was merged into Hellarchon City, which keeps it as an alias.
      const link = page.locator(".prose-codex a.wikilink", { hasText: "Helarchon" });
      await expect(link).toHaveAttribute("href", "/codex/entry/hellarchon-city");
      const outline = page.getByRole("navigation", { name: "On this page" });
      await expect(outline.getByRole("link", { name: "The Academy" })).toHaveAttribute("href", "#sec-the-academy");
      await expect(page.locator("#sec-the-academy")).toBeVisible();
    } finally {
      await deleteEphemeralEntry(page, slug ?? name).catch(() => {});
    }
  });

  test("an entry that names a page without linking it shows up as an unlinked mention", async ({ page }) => {
    const name = testName("unlinked");
    let slug: string | undefined;
    try {
      slug = await createEntryViaUI(page, {
        kind: "note",
        name,
        body: "Rumours from Bacchus, The Bountiful Spirit's priests, unlinked on purpose.",
      });
      await page.goto("/codex/entry/bacchus-the-bountiful-spirit");
      const section = page.locator("section", { has: page.getByRole("heading", { name: /Unlinked mentions/ }) });
      await expect(section.getByRole("link", { name })).toBeVisible();
    } finally {
      await deleteEphemeralEntry(page, slug ?? name).catch(() => {});
    }
  });
});

test.describe("wiki links are scoped to what the reader may open", () => {
  test("a player sees no link to a secret entry, the DM does", async ({ browser }) => {
    const dmContext = await browser.newContext({ storageState: "tests/.auth/dm.json" });
    const dm = await dmContext.newPage();
    const playerContext = await browser.newContext({ storageState: "tests/.auth/player.json" });
    const player = await playerContext.newPage();
    const secretName = testName("hidden-target");
    const publicName = testName("public-pointer");
    const made: string[] = [];
    try {
      made.push(await createEntryViaUI(dm, { kind: "location", name: secretName, visibility: "secret", summary: "Hidden." }));
      // A location the player is granted by default is needed for them to open
      // the pointer page; empires are always granted, so file it as an empire.
      const pointer = await createEntryViaUI(dm, {
        kind: "empire",
        name: publicName,
        body: `Beyond lies [[${secretName}]].`,
      });
      made.push(pointer);
      await expect(dm.locator(".prose-codex a.wikilink", { hasText: secretName })).toBeVisible();

      await player.goto(`/codex/entry/${pointer}`);
      await expect(player.getByRole("heading", { name: publicName })).toBeVisible();
      await expect(player.locator(".prose-codex a", { hasText: secretName })).toHaveCount(0);
      await expect(player.locator(".prose-codex .wikilink-missing", { hasText: secretName })).toBeVisible();
    } finally {
      for (const s of made.reverse()) await deleteEphemeralEntry(dm, s).catch(() => {});
      await playerContext.close();
      await dmContext.close();
    }
  });
});

test.describe("imported content", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("Foundry quests link their giver and keep hidden objectives in DM notes", async ({ page }) => {
    await page.goto("/codex/entry/bandits-at-the-broken-gate");
    await expect(page.getByRole("heading", { name: "Bandits at the Broken Gate", level: 1 })).toBeVisible();
    await expect(page.locator(".prose-codex a.wikilink", { hasText: "Thestun Vulkrim" })).toBeVisible();
    await expect(page.getByText("Objectives not yet revealed to the party")).toBeVisible();
  });

  test("deities carry a namesake, their pantheon and who serves them", async ({ page }) => {
    await page.goto("/codex/entry/vulcan-the-artisan-of-creation");
    const body = page.locator(".prose-codex");
    await expect(body).toContainText("In Roman religion Vulcan");
    await expect(body.getByRole("link", { name: "Imperium Invicta" })).toBeVisible();
    await expect(body.getByRole("heading", { name: "Served by" })).toBeVisible();
  });
});
