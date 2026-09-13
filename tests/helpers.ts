import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Every entry/table this suite creates carries this prefix so it can never
 * collide with, or be mistaken for, real codex content — and so a human
 * scanning the DB later can immediately tell what's test debris versus a
 * real forgotten row.
 */
export const TEST_PREFIX = "zz-playwright-";

export function testName(label: string): string {
  return `${TEST_PREFIX}${label}-${randomUUID().slice(0, 8)}`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type EntryFormInput = {
  name: string;
  kind?: string;
  summary?: string;
  body?: string;
  dmNotes?: string;
  tags?: string;
  visibility?: "public" | "secret" | "revealed";
};

/** Fills the shared EntryForm component. Assumes it's already on screen. */
export async function fillEntryForm(page: Page, input: EntryFormInput) {
  if (input.kind) await page.selectOption("#kind", input.kind);
  await page.fill("#name", input.name);
  if (input.summary !== undefined) await page.fill("#summary", input.summary);
  if (input.tags !== undefined) await page.fill("#tags", input.tags);
  if (input.body !== undefined) await page.fill("#body", input.body);
  if (input.visibility) {
    await page.check(`input[name="visibility"][value="${input.visibility}"]`);
  }
  if (input.dmNotes !== undefined) {
    const addBtn = page.getByRole("button", { name: "+ Add private notes" });
    if (await addBtn.isVisible().catch(() => false)) await addBtn.click();
    await page.fill("#dmNotes", input.dmNotes);
  }
}

/** Creates an entry via the real /codex/new form and returns its slug. */
export async function createEntryViaUI(
  page: Page,
  input: EntryFormInput,
): Promise<string> {
  await page.goto(`/codex/new?kind=${input.kind ?? "note"}`);
  await fillEntryForm(page, input);
  await page.getByRole("button", { name: "Create entry" }).click();
  await page.waitForURL(/\/codex\/entry\/.+/);
  const match = page.url().match(/\/codex\/entry\/([^/?#]+)/);
  if (!match) throw new Error(`Unexpected URL after create: ${page.url()}`);
  return decodeURIComponent(match[1]);
}

/**
 * Tears an ephemeral test entry down completely: blanks every content field
 * (the app's own rule for what counts as safely, permanently removable),
 * archives it, then purges it from /archive — the same guarded path a real
 * DM would use, never a raw DB delete. Safe to call even if the entry was
 * already archived by the test itself.
 */
export async function deleteEphemeralEntry(page: Page, slug: string) {
  let res = await page.goto(`/codex/entry/${slug}/edit`);

  // The entry may already be archived (e.g. a test that itself archives it
  // as part of what it's checking). An archived entry's edit page 404s by
  // design (see PLAN.md bug #9 fix) — the real DM workflow is restore, then
  // edit, so mirror that here rather than assuming /edit always resolves.
  if (res && res.status() === 404) {
    await page.goto("/archive");
    const restoreBtn = page
      .locator("div.card", { hasText: slug })
      .getByRole("button", { name: "↩ Restore" })
      .first();
    if (await restoreBtn.isVisible().catch(() => false)) {
      await restoreBtn.click();
      // restoreEntryAction doesn't navigate — wait for the row itself to
      // leave the archive list as proof the DB write landed, rather than a
      // fixed sleep that can race ahead of it.
      await expect(
        page.locator("div.card", { hasText: slug }),
      ).toHaveCount(0, { timeout: 10_000 }).catch(() => {});
    }
    res = await page.goto(`/codex/entry/${slug}/edit`);
  }

  if (page.url().includes("/login") || !page.url().includes("/edit") || res?.status() === 404) {
    // Already gone or inaccessible — nothing to clean up.
    return;
  }
  await page.fill("#summary", "");
  await page.fill("#body", "");
  await page.fill("#tags", "");
  const dmNotes = page.locator("#dmNotes");
  if (await dmNotes.isVisible().catch(() => false)) await dmNotes.fill("");
  await page.getByRole("button", { name: "Save changes" }).click();
  // NOTE: a broad /\/codex\/entry\/.+/ pattern would also match the *current*
  // /edit URL and resolve instantly without waiting for the real
  // post-save navigation — match the exact non-/edit destination instead.
  await page.waitForURL(new RegExp(`/codex/entry/${escapeRegExp(slug)}$`));

  // Archive it. If it's already archived, archiveEntryAction returns
  // { ok: true } without redirecting, so don't block on a navigation that
  // may never happen — wait for the URL to change away from the specific
  // page we're on now, not a pattern that's already satisfied.
  const archiveBtn = page.getByRole("button", { name: "🗄 Archive" });
  if (await archiveBtn.isVisible().catch(() => false)) {
    const beforeUrl = page.url();
    await archiveBtn.click();
    await page.getByRole("button", { name: "Yes, archive" }).click();
    await page.waitForURL((url) => url.toString() !== beforeUrl, { timeout: 5_000 }).catch(() => {});
  }

  // Purge from the archive. Our naming convention (lowercase, dash-joined)
  // means the entry's name and its slug are identical, so the archive row
  // (which shows the name) can be found by matching the slug text directly.
  await page.goto("/archive");
  const row = page.locator("div.card", { hasText: slug });
  const deleteBtn = row.getByRole("button", { name: "Delete blank" }).first();
  if (await deleteBtn.isVisible().catch(() => false)) {
    await deleteBtn.click();
    await page.getByRole("button", { name: "Confirm delete" }).click();
    // purgeBlankEntryAction runs in a transition with no navigation — wait
    // for the row to actually vanish so the test/context doesn't tear down
    // (and abort the in-flight request) before the delete lands.
    await expect(row).toHaveCount(0, { timeout: 10_000 }).catch(() => {});
  }
}

export async function expectRedirectedToLogin(page: Page, path: string) {
  await page.goto(path);
  await expect(page).toHaveURL(/\/login/);
}
