import fs from "node:fs";
import { tc } from "./case-id";
import path from "node:path";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { Client } from "pg";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { closeDbHelpers, createTestPlayer, deleteTestUser, query } from "./db-helpers";
import { testName } from "./helpers";

/**
 * Phase 13: page templates the DM can edit. A template only decides what the New page starts with:
 * it never changes a page that already exists, the built-in default is one click away, and only
 * the DM can reach any of it.
 */

const ROOT = path.join(__dirname, "..");
const PASSWORD = "correct horse battery staple 42";
const tag = randomUUID().slice(0, 8);
const users: string[] = [];
const TOUCHED = ["npc", "location", "note"];
const DEFAULT_NPC_BODY = "## Appearance\n\n\n\n## Motivation\n\n\n\n## Mannerisms\n\n";

test.use({ storageState: "tests/.auth/dm.json" });

test.beforeEach(async () => {
  await query(`DELETE FROM page_templates WHERE kind = ANY($1::entry_kind[])`, [TOUCHED]);
});

test.afterAll(async () => {
  await query(`DELETE FROM page_templates WHERE kind = ANY($1::entry_kind[])`, [TOUCHED]);
  await query(`DELETE FROM entries WHERE name LIKE 'zz-playwright-tpl-%'`);
  for (const id of users) await deleteTestUser(id);
  await closeDbHelpers();
});

async function openAdmin(page: Page, kind = "npc") {
  await page.goto(`/admin/templates?kind=${kind}`);
  await page.waitForLoadState("networkidle");
}

async function saveTemplate(page: Page, body: string, notes?: string) {
  await page.locator("#template-body").fill(body);
  if (notes !== undefined) await page.locator("#template-notes").fill(notes);
  await page.getByTestId("template-save").click();
}

async function playerSession(browser: Browser) {
  const username = `zz-tpl-${randomUUID().slice(0, 6)}`;
  const id = await createTestPlayer(username, PASSWORD);
  users.push(id);
  // A player with no name is sent to onboarding first; this one is already set up.
  await query(`UPDATE users SET display_name = $2 WHERE id = $1`, [id, `Zz ${username.slice(-4)}`]);
  const context = await browser.newContext();
  const page = await context.newPage();
  const res = await page.request.post("/api/auth/login", { data: { username, password: PASSWORD }, headers: { "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.9.${Math.floor(Math.random() * 250)}` } });
  expect(res.ok()).toBe(true);
  return { context, page };
}

test.describe("migration", () => {
  test("[TC-TMPL-001] the table has its length checks, takes one row per kind, and the migration is idempotent", async () => {
    expect((await query<{ t: string }>(`SELECT to_regclass('page_templates')::text AS t`))[0].t).toBe("page_templates");
    await expect(query(`INSERT INTO page_templates (kind, body) VALUES ('npc', $1)`, ["x".repeat(20001)])).rejects.toThrow(/page_templates_body_length/);
    await expect(query(`INSERT INTO page_templates (kind, dm_notes) VALUES ('npc', $1)`, ["x".repeat(20001)])).rejects.toThrow(/page_templates_notes_length/);
    await query(`INSERT INTO page_templates (kind, body) VALUES ('npc', 'one')`);
    await expect(query(`INSERT INTO page_templates (kind, body) VALUES ('npc', 'two')`)).rejects.toThrow(/duplicate key/);
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      const sql = fs.readFileSync(path.join(ROOT, "scripts", "sql", "templates.sql"), "utf8");
      await client.query(sql);
      await client.query(sql);
    } finally {
      await client.end();
    }
  });

  test("[TC-TMPL-002] the rollback drops only the templates table (run inside a transaction that is rolled back)", async () => {
    expect(process.env.DATABASE_URL ?? "").not.toMatch(/neon\.tech|neon\.build/);
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query("BEGIN");
      const entries = Number((await client.query(`SELECT count(*)::int AS n FROM entries`)).rows[0].n);
      await client.query(fs.readFileSync(path.join(ROOT, "scripts", "sql", "templates-rollback.sql"), "utf8"));
      expect((await client.query(`SELECT to_regclass('page_templates')::text AS t`)).rows[0].t).toBeNull();
      expect(Number((await client.query(`SELECT count(*)::int AS n FROM entries`)).rows[0].n)).toBe(entries);
      expect((await client.query(`SELECT to_regclass('entry_secrets')::text AS t`)).rows[0].t).toBe("entry_secrets");
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
    expect((await query<{ t: string }>(`SELECT to_regclass('page_templates')::text AS t`))[0].t).toBe("page_templates");
  });
});

test.describe("editing a template (DM)", () => {
  test("[TC-TMPL-003] the screen starts from the built-in default, with Save and Reset off until there is something to do", async ({ page }) => {
    await openAdmin(page);
    await expect(page.getByRole("heading", { level: 1, name: "Page templates" })).toBeVisible();
    await expect(page.locator("#template-body")).toHaveValue(DEFAULT_NPC_BODY);
    await expect(page.getByTestId("template-state")).toHaveText("Built-in default");
    await expect(page.getByTestId("template-save")).toBeDisabled();
    await expect(page.getByTestId("template-reset")).toBeDisabled();
  });

  test("[TC-TMPL-004] saving the NPC template changes what New NPC starts with, and nothing else", async ({ page }) => {
    test.slow();
    await openAdmin(page);
    await saveTemplate(page, `## Voice ${tag}\n\n## Wants\n\n`, `## Secret plans ${tag}\n\n`);
    await expect(page.getByTestId("template-state")).toHaveText("Your version");

    await page.goto("/codex/new?kind=npc");
    await expect(page.locator("#body")).toHaveValue(`## Voice ${tag}\n\n## Wants\n\n`);
    await expect(page.locator("#dmNotes")).toHaveValue(`## Secret plans ${tag}\n\n`);

    await page.goto("/codex/new?kind=location");
    await expect(page.locator("#body")).toHaveValue(/## At a glance/);
    await page.goto("/codex/new?kind=note");
    await expect(page.locator("#body")).toHaveValue("");
  });

  test("[TC-TMPL-005] a page written before the change is never altered by saving or resetting a template", async ({ page }) => {
    test.slow();
    const name = testName("tpl-old");
    const [old] = await query<{ id: string }>(`INSERT INTO entries (slug, kind, name, body, dm_notes, visibility, source_path) VALUES ($1, 'npc', $2, $3, 'old notes', 'public', 'test: templates') RETURNING id`, [name, name, DEFAULT_NPC_BODY]);
    const before = await query(`SELECT body, dm_notes, updated_at FROM entries WHERE id = $1`, [old.id]);
    await openAdmin(page);
    await saveTemplate(page, "Something completely different");
    await expect(page.getByTestId("template-state")).toHaveText("Your version");
    await page.getByTestId("template-reset").click();
    await expect(page.getByTestId("template-state")).toHaveText("Built-in default");
    expect(await query(`SELECT body, dm_notes, updated_at FROM entries WHERE id = $1`, [old.id])).toEqual(before);
  });

  test("[TC-TMPL-006] Reset to default brings the built-in text back, for the screen and for New NPC", async ({ page }) => {
    test.slow();
    await openAdmin(page);
    await saveTemplate(page, "Custom text");
    await expect(page.getByTestId("template-reset")).toBeEnabled();
    await page.getByTestId("template-reset").click();
    await expect(page.getByTestId("template-state")).toHaveText("Built-in default");
    await expect(page.locator("#template-body")).toHaveValue(DEFAULT_NPC_BODY);
    expect(await query(`SELECT 1 FROM page_templates WHERE kind = 'npc'`)).toHaveLength(0);
    await page.goto("/codex/new?kind=npc");
    await expect(page.locator("#body")).toHaveValue(DEFAULT_NPC_BODY);
  });

  test("[TC-TMPL-007] a template can be empty on purpose: new pages of that kind then start blank", async ({ page }) => {
    test.slow();
    await openAdmin(page);
    await saveTemplate(page, "", "");
    await expect(page.getByTestId("template-state")).toHaveText("Your version");
    await page.goto("/codex/new?kind=npc");
    await expect(page.locator("#body")).toHaveValue("");
    // With no notes in the template the DM-notes field starts collapsed behind its button.
    await expect(page.getByRole("button", { name: "Add private notes" })).toBeVisible();
  });

  test("[TC-TMPL-008] switching kind shows that kind's own text and state; unsaved edits are not carried over", async ({ page }) => {
    await openAdmin(page);
    await page.locator("#template-body").fill("an unsaved change");
    await page.locator("#template-kind").selectOption("location");
    await expect(page.locator("#template-body")).toHaveValue(/## At a glance/);
    await expect(page.getByTestId("template-state")).toHaveText("Built-in default");
    await page.locator("#template-kind").selectOption("npc");
    await expect(page.locator("#template-body")).toHaveValue(DEFAULT_NPC_BODY);
  });

  test("[TC-TMPL-009] a template may hold a secret block: every new page made from it gets its own block", async ({ page }) => {
    test.slow();
    await openAdmin(page);
    await saveTemplate(page, `Intro\n\n:::secret\nWhat this person really wants ${tag}\n:::\n`);
    await expect(page.getByTestId("template-state")).toHaveText("Your version");
    const ids: string[] = [];
    for (const n of [1, 2]) {
      const name = testName(`tpl-sec${n}`);
      await page.goto("/codex/new?kind=npc");
      await page.waitForLoadState("networkidle");
      await expect(page.locator("#body")).toHaveValue(/:::secret/);
      await page.fill("#name", name);
      await page.getByRole("button", { name: "Create entry" }).click();
      await page.waitForURL(/\/codex\/entry\/[^/]+$/);
      const rows = await query<{ id: string; body: string }>(`SELECT s.id, s.body FROM entry_secrets s JOIN entries e ON e.id = s.entry_id WHERE e.name = $1`, [name]);
      expect(rows).toHaveLength(1);
      expect(rows[0].body).toContain(tag);
      ids.push(rows[0].id);
    }
    expect(new Set(ids).size).toBe(2);
  });
});

test.describe("what is refused", () => {
  test("[TC-TMPL-010] a malformed secret block is refused with the reason, and the saved template is unchanged", async ({ page }) => {
    await openAdmin(page);
    await saveTemplate(page, "Good text");
    await expect(page.getByTestId("template-state")).toHaveText("Your version");
    await saveTemplate(page, "Bad\n:::secret\nnever closed");
    await expect(page.getByTestId("template-error")).toContainText(/never ends/);
    expect((await query<{ body: string }>(`SELECT body FROM page_templates WHERE kind = 'npc'`))[0].body).toBe("Good text");
  });

  test("[TC-TMPL-011] the size limit holds at the boundary: 20,000 characters save, 20,001 are refused for the description and for the notes", async ({ page }) => {
    const put = (body: string, dmNotes = "") => page.request.put("/api/templates/npc", { data: { body, dmNotes } });
    expect((await put("a".repeat(20000))).status()).toBe(200);
    const over = await put("a".repeat(20001));
    expect(over.status()).toBe(400);
    expect((await over.json()).error).toMatch(/limit is 20,000/);
    expect((await put("", "n".repeat(20000))).status()).toBe(200);
    const notesOver = await put("", "n".repeat(20001));
    expect(notesOver.status()).toBe(400);
    expect((await notesOver.json()).error).toMatch(/DM notes/);
    expect((await query<{ n: number }>(`SELECT char_length(dm_notes) AS n FROM page_templates WHERE kind = 'npc'`))[0].n).toBe(20000);
  });

  test("[TC-TMPL-012] the API refuses a bad body (missing field, wrong type, extra key), an unknown kind, and changes nothing", async ({ page }) => {
    for (const data of [{}, { body: "x" }, { dmNotes: "x" }, { body: 1, dmNotes: "" }, { body: "", dmNotes: "", extra: true }]) {
      expect((await page.request.put("/api/templates/npc", { data })).status(), JSON.stringify(data)).toBe(400);
    }
    expect((await page.request.put("/api/templates/not-a-kind", { data: { body: "", dmNotes: "" } })).status()).toBe(404);
    expect((await page.request.delete("/api/templates/not-a-kind")).status()).toBe(404);
    expect((await page.request.put("/api/templates/%27%3B%20DROP%20TABLE%20entries%3B--", { data: { body: "", dmNotes: "" } })).status()).toBe(404);
    expect(await query(`SELECT 1 FROM page_templates`)).toHaveLength(0);
  });
});

test.describe("who can reach it", () => {
  test("[TC-TMPL-013] signed out: 401 on the API; a player: 403 on the API, sent away from the screen, and no Templates link", async ({ browser }) => {
    const anon = await browser.newContext({ storageState: undefined });
    const { context, page } = await playerSession(browser);
    try {
      expect((await anon.request.put("/api/templates/npc", { data: { body: "x", dmNotes: "" } })).status()).toBe(401);
      expect((await anon.request.delete("/api/templates/npc")).status()).toBe(401);
      expect((await page.request.put("/api/templates/npc", { data: { body: "x", dmNotes: "" } })).status()).toBe(403);
      expect((await page.request.delete("/api/templates/npc")).status()).toBe(403);
      expect(await query(`SELECT 1 FROM page_templates`)).toHaveLength(0);

      await page.goto("/admin/templates");
      await expect(page).toHaveURL((u) => u.pathname === "/");
      await expect(page.getByRole("link", { name: "Templates" })).toHaveCount(0);
      await page.goto("/codex/new?kind=npc");
      await expect(page).toHaveURL((u) => u.pathname === "/");
    } finally {
      await context.close();
      await anon.close();
    }
  });

  test("[TC-TMPL-014] the DM finds Templates under Keeper in the sidebar", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Templates", exact: true }).first().click();
    await expect(page).toHaveURL(/\/admin\/templates/);
  });
});

test.describe("accessibility and small screens", () => {
  for (const theme of ["dark", "light"] as const) {
    test(tc("templates.spec.ts", "accessibility and small screens", `the templates screen has no serious axe violations (${theme})`), async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem("asetheria-theme", t), theme);
      await openAdmin(page);
      await page.waitForTimeout(400);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help} -> ${v.nodes[0]?.target.join(" ")}`);
      expect(serious).toEqual([]);
    });
  }

  test("[TC-TMPL-017] at 375px the screen fits without sideways scrolling, and every control has a visible label", async ({ browser }) => {
    const context = await browser.newContext({ storageState: "tests/.auth/dm.json", viewport: { width: 375, height: 800 } });
    const page = await context.newPage();
    try {
      await openAdmin(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      for (const label of ["Kind of page", "Description (shown to players who can read the page)", "DM notes (never shown to players)"]) {
        await expect(page.getByLabel(label)).toBeVisible();
      }
    } finally {
      await context.close();
    }
  });
});
