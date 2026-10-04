import { expect, test } from "@playwright/test";
import { deleteEphemeralEntry, testName } from "./helpers";

/**
 * The dice roller and the Backup & Import page on the shadcn components.
 */

test.use({ storageState: "tests/.auth/dm.json" });

test.describe("dice roller", () => {
  test("a typed expression rolls, shows the expression and a total in range, and is logged", async ({ page }) => {
    await page.goto("/tools/dice");
    await expect(page.getByText("Nothing rolled yet")).toBeVisible();

    await page.getByLabel("Dice expression").fill("2d6+3");
    await page.getByRole("button", { name: "Roll", exact: true }).click();
    const first = page.getByRole("listitem").filter({ hasText: "2d6+3" }).first();
    await expect(first).toBeVisible();
    const total = Number((await first.locator(".font-display").first().innerText()).trim());
    expect(total).toBeGreaterThanOrEqual(5);
    expect(total).toBeLessThanOrEqual(15);
    await expect(page.getByText("Nothing rolled yet")).toHaveCount(0);
  });

  test("a preset rolls immediately and puts its expression in the box", async ({ page }) => {
    await page.goto("/tools/dice");
    await page.getByRole("button", { name: "4d6kh3", exact: true }).click();
    await expect(page.getByLabel("Dice expression")).toHaveValue("4d6kh3");
    await expect(page.getByRole("listitem").filter({ hasText: "4d6kh3" }).first()).toBeVisible();
  });

  test("an unreadable expression shows a friendly message and logs nothing", async ({ page }) => {
    await page.goto("/tools/dice");
    await page.getByLabel("Dice expression").fill("banana");
    await page.getByRole("button", { name: "Roll", exact: true }).click();
    await expect(page.locator('p[role="alert"]')).toContainText('Cannot read "banana"');
    await expect(page.getByText("Nothing rolled yet")).toBeVisible();
  });

  test("boundary: the biggest legal pool rolls and an oversized one is refused", async ({ page }) => {
    await page.goto("/tools/dice");
    await page.getByLabel("Dice expression").fill("500d6");
    await page.getByRole("button", { name: "Roll", exact: true }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "500d6" }).first()).toBeVisible();

    await page.getByLabel("Dice expression").fill("501d6");
    await page.getByRole("button", { name: "Roll", exact: true }).click();
    await expect(page.locator('p[role="alert"]')).toContainText("Roll between 1 and 500 dice at a time.");
  });

  test("the log survives a reload and Clear empties it", async ({ page }) => {
    await page.goto("/tools/dice");
    await page.getByRole("button", { name: "1d8", exact: true }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "1d8" }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole("listitem").filter({ hasText: "1d8" }).first()).toBeVisible();

    await page.getByRole("button", { name: "Clear" }).click();
    await expect(page.getByText("Nothing rolled yet")).toBeVisible();
  });

  test("the notation reference opens and lists the keep-highest form", async ({ page }) => {
    await page.goto("/tools/dice");
    await page.getByText("Notation reference").click();
    await expect(page.getByText("roll four, keep the highest three")).toBeVisible();
  });
});

test.describe("backup and import page", () => {
  test("shows the live counts and both download links", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { level: 1, name: "Backup & Import" })).toBeVisible();
    await expect(page.getByText("Entries", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Download JSON backup" })).toHaveAttribute("href", "/api/export?format=json");
    await expect(page.getByRole("link", { name: "Download as Markdown" })).toHaveAttribute("href", "/api/export?format=markdown");
  });

  test("restoring with no file chosen says so", async ({ page }) => {
    await page.goto("/admin");
    await page.getByRole("button", { name: "Restore backup" }).click();
    await expect(page.locator('p[role="alert"]')).toHaveText("Choose a backup file first.");
  });

  test("a file that is not JSON, and JSON that is not a backup, are each refused with a clear message", async ({ page }) => {
    await page.goto("/admin");
    const input = page.getByLabel("Backup file");

    await input.setInputFiles({ name: "notes.json", mimeType: "application/json", buffer: Buffer.from("this is not json") });
    await page.getByRole("button", { name: "Restore backup" }).click();
    await expect(page.locator('p[role="alert"]')).toHaveText("That file couldn't be read as JSON.");

    await input.setInputFiles({ name: "wrong.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ hello: "world" })) });
    await page.getByRole("button", { name: "Restore backup" }).click();
    await expect(page.locator('p[role="alert"]')).toHaveText("That isn't a valid Asetheria backup.".replace("That isn't", "That file isn't"));
  });

  test("a valid backup is restored additively and reports what changed", async ({ page }) => {
    const name = testName("ui-import");
    const slug = name.toLowerCase();
    try {
      await page.goto("/admin");
      const backup = { format: "asetheria-codex", entries: [{ slug, name, kind: "note", body: "Imported by the UI test." }] };
      await page.getByLabel("Backup file").setInputFiles({
        name: "backup.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(backup)),
      });
      await page.getByRole("button", { name: "Restore backup" }).click();
      await expect(page.getByRole("status")).toContainText("1 added, 0 updated");

      const res = await page.request.get(`/codex/entry/${slug}`);
      expect(res.status()).toBe(200);
    } finally {
      await deleteEphemeralEntry(page, slug).catch(() => {});
    }
  });
});
