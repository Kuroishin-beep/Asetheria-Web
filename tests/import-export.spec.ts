import { test, expect } from "@playwright/test";
import { deleteEphemeralEntry, testName } from "./helpers";

test.describe("export access control", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("DM gets a well-formed JSON backup", async ({ page }) => {
    const res = await page.request.get("/api/export?format=json");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.format).toBe("asetheria-codex");
    expect(Array.isArray(body.entries)).toBe(true);
    expect(body.counts.entries).toBe(body.entries.length);
  });

  test("DM gets a readable Markdown export", async ({ page }) => {
    const res = await page.request.get("/api/export?format=markdown");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/markdown");
  });
});

test.describe("export is DM-only", () => {
  test.use({ storageState: "tests/.auth/player.json" });

  test("player export request is forbidden", async ({ page }) => {
    const res = await page.request.get("/api/export?format=json");
    expect(res.status()).toBe(403);
  });
});

test.describe("import", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("import is additive: existing entry count never decreases", async ({ page }) => {
    const name = testName("import-additive");
    try {
      const before = await (await page.request.get("/api/export?format=json")).json();
      const beforeCount = before.counts.entries;

      const res = await page.request.post("/api/import", {
        data: {
          format: "asetheria-codex",
          entries: [{ name, kind: "note", summary: "Imported by Playwright." }],
        },
      });
      expect(res.ok()).toBe(true);
      const outcome = await res.json();
      expect(outcome.created).toBe(1);

      const after = await (await page.request.get("/api/export?format=json")).json();
      expect(after.counts.entries).toBe(beforeCount + 1);

      // Re-importing the identical row updates rather than duplicates.
      const res2 = await page.request.post("/api/import", {
        data: {
          format: "asetheria-codex",
          entries: [{ name, kind: "note", summary: "Imported again, should update." }],
        },
      });
      const outcome2 = await res2.json();
      expect(outcome2.updated).toBe(1);
      expect(outcome2.created).toBe(0);

      const afterSecond = await (await page.request.get("/api/export?format=json")).json();
      expect(afterSecond.counts.entries).toBe(beforeCount + 1);
    } finally {
      // Cleanup via the UI's own guarded purge path, even if an assertion
      // above failed.
      await deleteEphemeralEntry(page, name);
    }
  });

  test("BUG REGRESSION: importing an entry with a [[wiki link]] should build a backlink", async ({
    page,
  }) => {
    const targetName = testName("import-link-target");
    const sourceName = testName("import-link-source");
    try {
      const createTarget = await page.request.post("/api/import", {
        data: {
          format: "asetheria-codex",
          entries: [{ name: targetName, kind: "note" }],
        },
      });
      expect(createTarget.ok()).toBe(true);

      const createSource = await page.request.post("/api/import", {
        data: {
          format: "asetheria-codex",
          entries: [
            {
              name: sourceName,
              kind: "note",
              body: `References [[${targetName}]] directly.`,
            },
          ],
        },
      });
      expect(createSource.ok()).toBe(true);

      await page.goto(`/codex/entry/${targetName}`);
      // This was EXPECTED TO FAIL until src/app/api/import/route.ts called
      // rebuildLinksForEntry() the way createEntryAction/updateEntryAction
      // do (see PLAN.md bug #1, now fixed) — kept as the regression test.
      await expect(
        page.getByRole("heading", { name: /linked mentions/i }),
      ).toBeVisible({ timeout: 5_000 });
      await expect(page.getByRole("link", { name: sourceName })).toBeVisible();
    } finally {
      await deleteEphemeralEntry(page, sourceName);
      await deleteEphemeralEntry(page, targetName);
    }
  });
});
