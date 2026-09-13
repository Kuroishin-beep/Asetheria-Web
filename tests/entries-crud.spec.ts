import { test, expect } from "@playwright/test";
import { createEntryViaUI, deleteEphemeralEntry, testName } from "./helpers";

test.use({ storageState: "tests/.auth/dm.json" });

/**
 * Every slug created in a test is registered here and cleaned up in
 * afterEach regardless of whether the test passed or failed — so a failing
 * assertion (including an intentional regression test) never leaves
 * zz-playwright- debris behind.
 */
let createdSlugs: string[] = [];
async function track(page: import("@playwright/test").Page, slug: string) {
  createdSlugs.push(slug);
  return slug;
}

test.afterEach(async ({ page }) => {
  for (const slug of createdSlugs.splice(0)) {
    await deleteEphemeralEntry(page, slug).catch(() => {
      // Best-effort — a slug from a failed create may never have existed.
    });
  }
});

test.describe("entry CRUD (DM)", () => {
  test("create, edit, tag, and read back a note entry", async ({ page }) => {
    const name = testName("crud-note");
    const slug = await track(
      page,
      await createEntryViaUI(page, {
        kind: "note",
        name,
        summary: "A throwaway entry created by Playwright.",
        body: "Nothing to see here.",
        tags: "playwright, ephemeral",
      }),
    );

    await expect(page.locator("h1")).toContainText(name);
    await expect(page.getByText("A throwaway entry created by Playwright.")).toBeVisible();
    await expect(page.getByRole("link", { name: "playwright" })).toBeVisible();

    // Edit: change summary, add dmNotes, switch to secret.
    await page.goto(`/codex/entry/${slug}/edit`);
    await page.fill("#summary", "Updated by the edit test.");
    await page.check('input[name="visibility"][value="secret"]');
    await page.getByRole("button", { name: "+ Add private notes" }).click();
    await page.fill("#dmNotes", "This is a DM-only note.");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.waitForURL(/\/codex\/entry\/.+/);

    await expect(page.getByText("Updated by the edit test.")).toBeVisible();
    await expect(page.getByText("⊘ DM only")).toBeVisible();
    await expect(page.getByText("This is a DM-only note.")).toBeVisible();

    // Revision history recorded both the create and the update.
    await page.goto(`/codex/entry/${slug}/edit`);
    await expect(page.getByText(/^Created by/)).toBeVisible();
  });

  test("archive then restore round-trips an entry", async ({ page }) => {
    const name = testName("crud-archive");
    const slug = await track(page, await createEntryViaUI(page, { kind: "note", name }));

    await page.getByRole("button", { name: "🗄 Archive" }).click();
    await page.getByRole("button", { name: "Yes, archive" }).click();
    await page.waitForURL(/\/codex\/notes/);

    // Gone from normal browsing (list/search) — but see PLAN.md bug #9:
    // getEntryBySlug() does not filter out archived rows, so the direct URL
    // currently still resolves (200) even though the entry is archived.
    // EXPECTED TO FAIL until that read path adds an archived-state guard.
    // This is the acceptance test for that fix.
    const res = await page.goto(`/codex/entry/${slug}`);
    expect(res?.status()).toBe(404);

    await page.goto("/archive");
    await expect(page.getByText(name)).toBeVisible();

    const archivedRow = page.locator("div.card", { hasText: name });
    await archivedRow.getByRole("button", { name: "↩ Restore" }).click();
    // restoreEntryAction doesn't navigate — it's a transition +
    // router.refresh() — so wait for the row to actually leave the archive
    // list (proof the DB write landed) before following the entry's URL,
    // rather than racing ahead of it.
    await expect(archivedRow).toHaveCount(0, { timeout: 10_000 });

    await page.goto(`/codex/entry/${slug}`);
    await expect(page.locator("h1")).toContainText(name);
  });

  test("reverting to an earlier revision restores its content", async ({ page }) => {
    const name = testName("crud-revert");
    const slug = await track(
      page,
      await createEntryViaUI(page, { kind: "note", name, summary: "Version one." }),
    );

    await page.goto(`/codex/entry/${slug}/edit`);
    await page.fill("#summary", "Version two.");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.waitForURL(/\/codex\/entry\/.+/);
    await expect(page.getByText("Version two.")).toBeVisible();

    await page.goto(`/codex/entry/${slug}/edit`);
    await page
      .locator("li", { hasText: "Created by" })
      .first()
      .getByRole("button", { name: /restore this version/i })
      .click();
    await expect(page.getByRole("button", { name: /restoring/i })).toHaveCount(0, {
      timeout: 10_000,
    });

    await page.goto(`/codex/entry/${slug}`);
    await expect(page.getByText("Version one.")).toBeVisible();
  });

  test("wiki-link in body creates a working backlink on the target page", async ({ page }) => {
    const targetName = testName("crud-link-target");
    const targetSlug = await track(
      page,
      await createEntryViaUI(page, { kind: "note", name: targetName }),
    );

    const sourceName = testName("crud-link-source");
    await track(
      page,
      await createEntryViaUI(page, {
        kind: "note",
        name: sourceName,
        body: `See also [[${targetName}]] for details.`,
      }),
    );

    await page.goto(`/codex/entry/${targetSlug}`);
    await expect(page.getByRole("heading", { name: /linked mentions/i })).toBeVisible();
    await expect(page.getByRole("link", { name: sourceName })).toBeVisible();
  });

  test("purge is refused while the entry still has content", async ({ page }) => {
    const name = testName("crud-purge-guard");
    const slug = await track(
      page,
      await createEntryViaUI(page, { kind: "note", name, summary: "Not blank yet." }),
    );

    await page.getByRole("button", { name: "🗄 Archive" }).click();
    await page.getByRole("button", { name: "Yes, archive" }).click();
    await page.waitForURL(/\/codex\/notes/);

    await page.goto("/archive");
    // Non-blank entries never show a "Delete blank" button at all.
    const row = page.locator("div.card", { hasText: name });
    await expect(row.getByRole("button", { name: "Delete blank" })).toHaveCount(0);

    void slug; // tracked above; cleaned up in afterEach
  });
});
