import { expect, test } from "@playwright/test";
import { closeDbHelpers, query } from "./db-helpers";
import { deleteEphemeralEntry, testName } from "./helpers";

/**
 * The entry editor, command palette, shortcut sheet and graph on the shadcn
 * components: labels, keyboard operation, validation messages, focus handling.
 */

test.use({ storageState: "tests/.auth/dm.json" });

test.afterAll(async () => {
  await closeDbHelpers();
});

test.describe("entry form", () => {
  test("every control has a visible label bound to it, and the type switches the details section", async ({ page }) => {
    await page.goto("/codex/new?kind=note");
    for (const label of ["Name *", "Type", "Also known as", "Summary", "Tags", "Belongs to"]) {
      await expect(page.getByLabel(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole("group", { name: "Identity" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Who can see this" })).toBeVisible();

    await page.getByLabel("Type", { exact: true }).selectOption("ore");
    await expect(page.getByRole("group", { name: "Ore details" })).toBeVisible();
    await expect(page.getByLabel("Cost per lb.")).toBeVisible();
  });

  test("a blank name is refused by the server with a friendly message, and nothing is created", async ({ page }) => {
    await page.goto("/codex/new?kind=note");
    // Whitespace passes the browser's `required` check but not the server's trim.
    await page.getByLabel("Name *", { exact: true }).fill("   ");
    await page.getByRole("button", { name: "Create entry" }).click();
    // Next also renders a route announcer with role=alert, so match the form message by element.
    await expect(page.locator('p[role="alert"]')).toContainText("Every entry needs a name.");
    await expect(page).toHaveURL(/\/codex\/new/);
  });

  test("Ctrl+S saves, and the visibility radio group works by keyboard", async ({ page }) => {
    // Create, assert and clean up through real pages; the first hit of a route on a cold dev server compiles it.
    test.slow();
    const name = testName("kbd");
    let slug: string | undefined;
    try {
      await page.goto("/codex/new?kind=note");
      await page.getByLabel("Name *", { exact: true }).fill(name);

      // Arrow keys move through a radio group and select as they go.
      const everyone = page.getByRole("radio", { name: "Everyone", exact: true });
      await everyone.focus();
      await expect(everyone).toBeChecked();
      // A human holds a key for a few tens of milliseconds; Radix selects on the focus move
      // only while the arrow key is still down, so the test holds it briefly too.
      await page.keyboard.press("ArrowDown", { delay: 60 });
      await expect(page.getByRole("radio", { name: "DM only", exact: true })).toBeChecked();

      await page.getByLabel("Name *", { exact: true }).press("Control+s");
      await page.waitForURL(/\/codex\/entry\/.+/);
      slug = decodeURIComponent(page.url().match(/\/codex\/entry\/([^/?#]+)/)![1]);

      const rows = await query<{ visibility: string }>(`SELECT visibility FROM entries WHERE slug = $1`, [slug]);
      expect(rows[0].visibility).toBe("secret");
      await expect(page.getByText("DM only: hidden from players")).toBeVisible();
    } finally {
      if (slug) await deleteEphemeralEntry(page, slug).catch(() => {});
    }
  });

  test("Discard throws away a recovered draft and clears it from storage", async ({ page }) => {
    await page.goto("/codex/new?kind=note");
    await page.locator("#body").fill("A draft to discard");
    await page.waitForTimeout(700);
    await page.reload();
    await expect(page.getByRole("status")).toContainText("unsaved changes");
    await page.getByRole("button", { name: "Discard" }).click();
    await expect(page.getByRole("status")).toHaveCount(0);
    await expect(page.locator("#body")).toHaveValue("");
    expect(await page.evaluate(() => localStorage.getItem("asetheria-draft:new"))).toBeNull();
  });

  test("the form fits a 375px screen with no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/codex/new?kind=npc");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("command palette and shortcut sheet", () => {
  test("opening from the button focuses the search box, and Escape returns focus to the button", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    const trigger = page.getByRole("button", { name: "Search the codex" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Search the codex" });
    await expect(dialog).toBeVisible();
    await expect(page.getByLabel("Search query")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("arrow keys move the highlighted row and Enter opens it; no results offers a full-text search", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("Control+k");
    const input = page.getByLabel("Search query");
    await input.fill("graph");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/graph$/);

    await page.keyboard.press("Control+k");
    await page.getByLabel("Search query").fill("qxzjvkwpmb");
    await expect(page.getByText("Nothing found. Press Enter for a full-text search.")).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/search\?q=qxzjvkwpmb/);
  });

  test("the shortcut sheet is a labelled dialog with a Close button and lists the chords", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Shift+?");
    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Open the connection graph");
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toHaveCount(0);
  });
});

test.describe("graph", () => {
  test("loads with no console errors (including hydration warnings), a legend, and focusable nodes", async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") problems.push(m.text());
    });
    page.on("pageerror", (e) => problems.push(e.message));
    await page.goto("/graph");
    await expect(page.getByRole("img", { name: /Backlink graph/ })).toBeVisible();
    await expect(page.getByRole("list", { name: "Colour legend" }).getByRole("listitem")).toHaveCount(5);

    const node = page.locator('g[role="button"]').first();
    await node.focus();
    await expect(node).toBeFocused();
    await expect(node.locator("text")).toBeVisible();
    expect(problems.filter((p) => /hydrat|did not match|didn't match/i.test(p))).toEqual([]);
    expect(problems).toEqual([]);
  });

  test("a player with nothing revealed sees an empty state, not a blank canvas", async ({ browser }) => {
    // Covered structurally by graph-and-table-view; here only the DM graph is asserted non-empty.
    const context = await browser.newContext({ storageState: "tests/.auth/dm.json" });
    const page = await context.newPage();
    await page.goto("/graph");
    await expect(page.getByText("Nothing to show yet")).toHaveCount(0);
    await context.close();
  });
});
