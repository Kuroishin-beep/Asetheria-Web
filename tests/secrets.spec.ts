import fs from "node:fs";
import { tc } from "./case-id";
import path from "node:path";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { Client } from "pg";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { closeDbHelpers, createTestPlayer, deleteTestUser, query } from "./db-helpers";
import { createEntryViaUI, testName } from "./helpers";

/**
 * Phase 12: inline secret blocks. The text of a block lives in its own table and the page body keeps only a
 * marker, so nothing a player can reach (HTML, search, the palette, data routes, vectors) ever holds it.
 * Everything runs against the real app and the real (test) database.
 */

const ROOT = path.join(__dirname, "..");
const PASSWORD = "correct horse battery staple 42";
const tag = randomUUID().slice(0, 8);
const CANARY = `zzcanary${tag}`;
const SECRET_TEXT = `The baker is a spy for Hellenoria ${CANARY}`;
const users: string[] = [];

const block = (text = SECRET_TEXT) => `Public intro.\n\n:::secret\n${text}\n:::\n\nPublic outro.`;
const fromNewAddress = () => ({ "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });

test.use({ storageState: "tests/.auth/dm.json" });

test.afterAll(async () => {
  await query(`DELETE FROM entries WHERE name LIKE 'zz-playwright-secret-%' OR name LIKE 'zz-secret-%'`);
  for (const id of users) await deleteTestUser(id);
  await closeDbHelpers();
});

type Page12 = { name: string; slug: string; id: string };

/** Creates a page through the real editor, as the DM, and returns where it landed. */
async function makePage(page: Page, body: string, extra: { visibility?: "public" | "secret" | "revealed" } = {}): Promise<Page12> {
  const name = testName("secret");
  const slug = await createEntryViaUI(page, { name, kind: "note", body, ...extra });
  const [row] = await query<{ id: string }>(`SELECT id FROM entries WHERE slug = $1`, [slug]);
  return { name, slug, id: row.id };
}

/**
 * Opens a page's editor and waits until it is interactive. Text typed into an edit page before it has
 * hydrated is placed in front of the old text (existing editor behaviour, nothing to do with secret blocks).
 */
async function openEditor(page: Page, slug: string) {
  await page.goto(`/codex/entry/${slug}/edit`);
  await page.waitForLoadState("networkidle");
}

/** Clicks Save on the edit page and waits until the page has left the editor (the URL of the editor also matches /codex/entry/). */
async function saveEdit(page: Page) {
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL((url) => /^\/codex\/entry\/[^/]+$/.test(url.pathname));
}

async function secretRows(entryId: string) {
  return query<{ id: string; body: string }>(`SELECT id, body FROM entry_secrets WHERE entry_id = $1 ORDER BY created_at`, [entryId]);
}

async function newPlayer(label = "p") {
  const username = `zz-secret-${label}-${randomUUID().slice(0, 6)}`;
  const id = await createTestPlayer(username, PASSWORD);
  users.push(id);
  const display = `Zz ${label}${randomUUID().slice(0, 3)}`;
  await query(`UPDATE users SET display_name = $2 WHERE id = $1`, [id, display]);
  await query(`INSERT INTO entry_grants (user_id, kind, granted) VALUES ($1, 'note', true)`, [id]);
  return { id, username, display };
}

async function login(browser: Browser, username: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const res = await page.request.post("/api/auth/login", { data: { username, password: PASSWORD }, headers: fromNewAddress() });
  expect(res.ok()).toBe(true);
  return { context, page };
}

async function reveal(page: Page, secretId: string, playerIds: string[]) {
  return page.request.post(`/api/secrets/${secretId}/reveal`, { data: { playerIds } });
}

test.describe("migration", () => {
  test("[TC-SECR-001] both tables exist with their checks and cascades, and the migration is idempotent", async ({ page }) => {
    expect((await query<{ t: string }>(`SELECT to_regclass('entry_secrets')::text AS t`))[0].t).toBe("entry_secrets");
    expect((await query<{ t: string }>(`SELECT to_regclass('secret_reveals')::text AS t`))[0].t).toBe("secret_reveals");
    const p = await makePage(page, "plain page for the migration check");
    const player = await newPlayer("mig");
    await expect(query(`INSERT INTO entry_secrets (entry_id, body) VALUES ($1, '')`, [p.id])).rejects.toThrow(/entry_secrets_body_length/);
    await expect(query(`INSERT INTO entry_secrets (entry_id, body) VALUES ($1, $2)`, [p.id, "x".repeat(20001)])).rejects.toThrow(/entry_secrets_body_length/);
    const [s] = await query<{ id: string }>(`INSERT INTO entry_secrets (entry_id, body) VALUES ($1, 'ok') RETURNING id`, [p.id]);
    await query(`INSERT INTO secret_reveals (secret_id, user_id) VALUES ($1, $2)`, [s.id, player.id]);
    await expect(query(`INSERT INTO secret_reveals (secret_id, user_id) VALUES ($1, $2)`, [s.id, player.id])).rejects.toThrow(/duplicate key/);

    // Deleting the player removes the reveal; deleting the page removes the block and what is left of its reveals.
    await deleteTestUser(player.id);
    users.splice(users.indexOf(player.id), 1);
    expect(await query(`SELECT 1 FROM secret_reveals WHERE secret_id = $1`, [s.id])).toHaveLength(0);
    await query(`DELETE FROM entries WHERE id = $1`, [p.id]);
    expect(await query(`SELECT 1 FROM entry_secrets WHERE id = $1`, [s.id])).toHaveLength(0);

    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      const sql = fs.readFileSync(path.join(ROOT, "scripts", "sql", "secrets.sql"), "utf8");
      await client.query(sql);
      await client.query(sql);
    } finally {
      await client.end();
    }
  });

  test("[TC-SECR-002] the rollback drops only the two secret tables (run inside a transaction that is rolled back)", async () => {
    expect(process.env.DATABASE_URL ?? "").not.toMatch(/neon\.tech|neon\.build/);
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query("BEGIN");
      const entries = Number((await client.query(`SELECT count(*)::int AS n FROM entries`)).rows[0].n);
      await client.query(fs.readFileSync(path.join(ROOT, "scripts", "sql", "secrets-rollback.sql"), "utf8"));
      expect((await client.query(`SELECT to_regclass('entry_secrets')::text AS t`)).rows[0].t).toBeNull();
      expect((await client.query(`SELECT to_regclass('secret_reveals')::text AS t`)).rows[0].t).toBeNull();
      expect(Number((await client.query(`SELECT count(*)::int AS n FROM entries`)).rows[0].n)).toBe(entries);
      expect((await client.query(`SELECT to_regclass('characters')::text AS t`)).rows[0].t).toBe("characters");
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
    expect((await query<{ t: string }>(`SELECT to_regclass('entry_secrets')::text AS t`))[0].t).toBe("entry_secrets");
  });
});

test.describe("saving and editing (DM)", () => {
  test("[TC-SECR-003] saving moves the block into its own table: the page body keeps a marker, and the secret is in no column of the page row or either search vector", async ({ page }) => {
    test.slow();
    const p = await makePage(page, block());
    const [row] = await query<{ body: string; whole: string; sv: string; psv: string }>(
      `SELECT body, to_jsonb(e)::text AS whole, search_vector::text AS sv, player_search_vector::text AS psv FROM entries e WHERE id = $1`,
      [p.id],
    );
    expect(row.body).toContain("Public intro.");
    expect(row.body).toContain("Public outro.");
    expect(row.body).toMatch(/\{\{§[0-9a-f-]{36}\}\}/);
    for (const [label, text] of Object.entries({ body: row.body, wholeRow: row.whole, dmVector: row.sv, playerVector: row.psv })) {
      expect(text.toLowerCase().includes(CANARY.toLowerCase()), `${label} must not hold the secret`).toBe(false);
      expect(text.toLowerCase().includes("baker"), `${label} must not hold the secret words`).toBe(false);
    }
    const rows = await secretRows(p.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toBe(SECRET_TEXT);
    expect(row.body).toContain(rows[0].id);
  });

  test("[TC-SECR-004] the DM sees the passage in a labelled box with a reveal control, between the text around it", async ({ page }) => {
    test.slow();
    const p = await makePage(page, block());
    await page.goto(`/codex/entry/${p.slug}`);
    const box = page.locator("[data-secret-block]");
    await expect(box).toHaveCount(1);
    await expect(box).toContainText(SECRET_TEXT);
    await expect(box.getByRole("heading", { name: "Secret, hidden from players" })).toBeVisible();
    await expect(box.getByTestId("reveal-status")).toHaveText("Not revealed to anyone");
    const html = await page.locator("article").innerHTML();
    expect(html.indexOf("Public intro.")).toBeLessThan(html.indexOf(CANARY));
    expect(html.indexOf(CANARY)).toBeLessThan(html.indexOf("Public outro."));
  });

  test("[TC-SECR-005] the editor shows the inline form again, and an edit keeps the block's id and text", async ({ page }) => {
    test.slow();
    const p = await makePage(page, block());
    const [before] = await secretRows(p.id);
    await openEditor(page, p.slug);
    const value = await page.locator("#body").inputValue();
    expect(value).toContain(`:::secret ${before.id}`);
    expect(value).toContain(SECRET_TEXT);
    await page.locator("#body").fill(value.replace("Public intro.", "A new intro."));
    await saveEdit(page);
    const after = await secretRows(p.id);
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(before.id);
    expect(after[0].body).toBe(SECRET_TEXT);
    await expect(page.locator("article")).toContainText("A new intro.");
  });

  test("[TC-SECR-006] the Insert secret block button adds an empty fence for the DM to fill in, and the preview shows it as hidden from players", async ({ page }) => {
    await page.goto("/codex/new?kind=note");
    await page.fill("#body", "Some text");
    await page.getByTestId("insert-secret").click();
    await expect(page.locator("#body")).toHaveValue(/Some text\n\n:::secret\n\n:::\n/);
    await page.fill("#body", "Some text\n\n:::secret\nHidden bit\n:::\n");
    await page.getByRole("tab", { name: "Preview" }).click();
    await expect(page.getByText("Secret, hidden from players").first()).toBeVisible();
    await expect(page.locator("aside").getByText("Hidden bit")).toBeVisible();
  });

  test("[TC-SECR-007] removing a block in the editor deletes it and the reveals it had", async ({ page, browser }) => {
    test.slow();
    const player = await newPlayer("rm");
    const p = await makePage(page, block());
    const [s] = await secretRows(p.id);
    expect((await reveal(page, s.id, [player.id])).ok()).toBe(true);
    expect(await query(`SELECT 1 FROM secret_reveals WHERE secret_id = $1`, [s.id])).toHaveLength(1);

    await openEditor(page, p.slug);
    await page.locator("#body").fill("Just the public text now.");
    await saveEdit(page);
    expect(await secretRows(p.id)).toHaveLength(0);
    expect(await query(`SELECT 1 FROM secret_reveals WHERE secret_id = $1`, [s.id])).toHaveLength(0);
    const [row] = await query<{ body: string }>(`SELECT body FROM entries WHERE id = $1`, [p.id]);
    expect(row.body).not.toMatch(/\{\{§/);
    const { context, page: pp } = await login(browser, player.username);
    try {
      const res = await pp.goto(`/codex/entry/${p.slug}`);
      expect(res?.status()).toBe(200);
      expect(await pp.content()).not.toContain(CANARY);
    } finally {
      await context.close();
    }
  });

  test("[TC-SECR-008] restoring an earlier version brings a removed block back", async ({ page }) => {
    test.slow();
    const p = await makePage(page, block());
    await openEditor(page, p.slug);
    await page.locator("#body").fill("The block is gone.");
    await saveEdit(page);
    expect(await secretRows(p.id)).toHaveLength(0);

    await openEditor(page, p.slug);
    // The oldest snapshot is the one that still had the block.
    await page.getByRole("button", { name: "Restore this version" }).last().click();
    await expect.poll(async () => (await secretRows(p.id)).length, { timeout: 15000 }).toBe(1);
    expect((await secretRows(p.id))[0].body).toBe(SECRET_TEXT);
    await page.goto(`/codex/entry/${p.slug}`);
    await expect(page.locator("[data-secret-block]")).toContainText(CANARY);
  });

  test("[TC-SECR-009] a block id copied from another page cannot take over that page's reveals: it is given a new id", async ({ page, browser }) => {
    test.slow();
    const player = await newPlayer("hij");
    const a = await makePage(page, block());
    const [sa] = await secretRows(a.id);
    expect((await reveal(page, sa.id, [player.id])).ok()).toBe(true);

    const b = await makePage(page, "Page B");
    await openEditor(page, b.slug);
    await page.locator("#body").fill(`Page B\n\n:::secret ${sa.id}\nB's own passage zzbonly${tag}\n:::`);
    await saveEdit(page);

    const [sb] = await secretRows(b.id);
    expect(sb.id).not.toBe(sa.id);
    expect((await secretRows(a.id))[0]).toMatchObject({ id: sa.id, body: SECRET_TEXT });
    expect(await query(`SELECT 1 FROM secret_reveals WHERE secret_id = $1`, [sb.id])).toHaveLength(0);

    const { context, page: pp } = await login(browser, player.username);
    try {
      await pp.goto(`/codex/entry/${b.slug}`);
      expect(await pp.content()).not.toContain(`zzbonly${tag}`);
    } finally {
      await context.close();
    }
  });

  test("[TC-SECR-010] a marker whose block does not exist renders as nothing, for the DM and for a player", async ({ page, browser }) => {
    test.slow();
    const player = await newPlayer("orph");
    const name = testName("secret-orphan");
    const ghost = randomUUID();
    await query(`INSERT INTO entries (slug, kind, name, body, visibility, source_path) VALUES ($1, 'note', $2, $3, 'public', 'test: secrets')`, [name, name, `Before\n\n{{§${ghost}}}\n\nAfter`]);
    await page.goto(`/codex/entry/${name}`);
    await expect(page.locator("[data-secret-block]")).toHaveCount(0);
    await expect(page.locator("article")).toContainText("Before");
    expect(await page.content()).not.toContain(ghost);
    const { context, page: pp } = await login(browser, player.username);
    try {
      await pp.goto(`/codex/entry/${name}`);
      await expect(pp.locator("article")).toContainText("After");
      expect(await pp.content()).not.toContain(ghost);
    } finally {
      await context.close();
    }
  });

  test("[TC-SECR-011] a link written inside a secret block is not indexed: no link row, no backlink for anyone", async ({ page }) => {
    test.slow();
    const target = await makePage(page, "The link target.");
    const p = await makePage(page, `Plain.\n\n:::secret\nSecretly see [[${target.name}]] ${CANARY}\n:::`);
    expect(await query(`SELECT 1 FROM links WHERE source_id = $1`, [p.id])).toHaveLength(0);
    await page.goto(`/codex/entry/${target.slug}`);
    await expect(page.locator("aside, article").filter({ hasText: p.name })).toHaveCount(0);
  });
});

test.describe("what is refused", () => {
  const refuse = async (page: Page, body: string, message: RegExp) => {
    const name = testName("secret-bad");
    await page.goto("/codex/new?kind=note");
    await page.fill("#name", name);
    await page.fill("#body", body);
    await page.getByRole("button", { name: "Create entry" }).click();
    await expect(page.locator('p[role="alert"]')).toContainText(message);
    await expect(page).toHaveURL(/\/codex\/new/);
    expect(await query(`SELECT 1 FROM entries WHERE name = $1`, [name])).toHaveLength(0);
  };

  test("[TC-SECR-012] an unterminated block, a nested block, an empty block, a stray end and a malformed opening line are each refused with the reason, and nothing is saved", async ({ page }) => {
    test.slow();
    await refuse(page, "Intro\n:::secret\nnever closed", /never ends/);
    await refuse(page, ":::secret\none\n:::secret\ntwo\n:::\n:::", /nested/);
    await refuse(page, ":::secret\n:::", /empty/);
    await refuse(page, "text\n:::\nmore", /none was opened/);
    await refuse(page, ":::secret now\ntext\n:::", /line of its own/);
  });

  test("[TC-SECR-013] a failed save does not change the stored page or its blocks", async ({ page }) => {
    test.slow();
    const p = await makePage(page, block());
    const [before] = await secretRows(p.id);
    await openEditor(page, p.slug);
    await page.locator("#body").fill("Changed\n:::secret\nnever closed");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.locator('p[role="alert"]')).toContainText(/never ends/);
    expect((await secretRows(p.id))[0]).toMatchObject({ id: before.id, body: SECRET_TEXT });
    const [row] = await query<{ body: string }>(`SELECT body FROM entries WHERE id = $1`, [p.id]);
    expect(row.body).toContain("Public intro.");
  });

  test("[TC-SECR-014] the size limits hold at the boundary: a 20,000-character block saves, 20,001 is refused; 50 blocks save, 51 are refused", async ({ page }) => {
    test.slow();
    const big = (n: number) => `:::secret\n${"a".repeat(n)}\n:::`;
    const p = await makePage(page, big(20000));
    expect((await secretRows(p.id))[0].body).toHaveLength(20000);
    await refuse(page, big(20001), /limit/);
    const many = (n: number) => Array.from({ length: n }, (_, i) => `:::secret\npassage ${i}\n:::`).join("\n\n");
    const q = await makePage(page, many(50));
    expect(await secretRows(q.id)).toHaveLength(50);
    await refuse(page, many(51), /at most 50/);
  });
});

test.describe("what a player can and cannot reach", () => {
  test("[TC-SECR-015] the secret and its marker appear in no page, search or data route a player can reach", async ({ page, browser }) => {
    test.slow();
    const player = await newPlayer("canary");
    const p = await makePage(page, block());
    const [s] = await secretRows(p.id);
    const { context, page: pp } = await login(browser, player.username);
    try {
      const get = async (url: string) => {
        const res = await pp.request.get(url);
        return { url, status: res.status(), text: await res.text() };
      };
      const results = await Promise.all([
        get(`/codex/entry/${p.slug}`),
        get(`/codex/notes`),
        get(`/search?q=${CANARY}`),
        get(`/search?q=${encodeURIComponent("baker spy Hellenoria")}`),
        get(`/api/find?q=${CANARY}`),
        get(`/api/find?q=${encodeURIComponent("baker")}`),
        get(`/graph`),
        get(`/`),
        get(`/map`),
        get(`/planner`),
        get(`/api/export`),
        get(`/api/export?format=markdown`),
      ]);
      // A search page echoes the words that were searched for, so for those the check is on the secret sentence.
      const echoesQuery = new Set([2, 3]);
      results.forEach((r, i) => {
        expect(r.text.includes(SECRET_TEXT), `${r.url} must not contain the secret sentence`).toBe(false);
        if (!echoesQuery.has(i)) expect(r.text.includes(CANARY), `${r.url} must not contain the secret`).toBe(false);
        expect(r.text.includes(s.id), `${r.url} must not contain the block id`).toBe(false);
      });
      expect(results[0].status).toBe(200);
      expect(results[0].text).toContain("Public intro.");
      expect(results[0].text).toContain("Public outro.");
      // A search for the secret's words does not find the page, by name or by snippet.
      for (const i of [2, 3, 4, 5]) expect(results[i].text.includes(p.name), `${results[i].url} must not find the page by its secret`).toBe(false);
      expect(results[10].status).toBe(403);
      expect(results[11].status).toBe(403);
    } finally {
      await context.close();
    }
  });

  test("[TC-SECR-016] the DM's search finds the page by its secret text; a player's search does not", async ({ page, browser }) => {
    test.slow();
    const player = await newPlayer("srch");
    const p = await makePage(page, block());
    await page.goto(`/search?q=${CANARY}`);
    await expect(page.getByRole("main")).toContainText(p.name);
    const { context, page: pp } = await login(browser, player.username);
    try {
      await pp.goto(`/search?q=${CANARY}`);
      await expect(pp.getByRole("main")).not.toContainText(p.name);
    } finally {
      await context.close();
    }
  });

  test("[TC-SECR-017] a grant on the page does not reveal its blocks, and revealing a block never opens a secret page", async ({ page, browser }) => {
    test.slow();
    const player = await newPlayer("grant");
    const p = await makePage(page, block());
    const [s] = await secretRows(p.id);
    await query(`INSERT INTO entry_grants (user_id, entry_id, granted) VALUES ($1, $2, true)`, [player.id, p.id]);
    const { context, page: pp } = await login(browser, player.username);
    try {
      await pp.goto(`/codex/entry/${p.slug}`);
      expect(await pp.content()).not.toContain(CANARY);

      // The page becomes a secret; the block is revealed to the player; the page still does not open.
      await query(`UPDATE entries SET visibility = 'secret' WHERE id = $1`, [p.id]);
      expect((await reveal(page, s.id, [player.id])).ok()).toBe(true);
      const res = await pp.goto(`/codex/entry/${p.slug}`);
      expect(res?.status()).toBe(404);
      expect(await pp.content()).not.toContain(CANARY);
      expect(await (await pp.request.get(`/api/find?q=${CANARY}`)).text()).not.toContain(CANARY);
    } finally {
      await context.close();
    }
  });
});

test.describe("revealing", () => {
  test("[TC-SECR-018] a block revealed to one player shows for that player at once and for no one else; choosing nobody hides it again", async ({ page, browser }) => {
    test.slow();
    const a = await newPlayer("a");
    const b = await newPlayer("b");
    const p = await makePage(page, block());
    const [s] = await secretRows(p.id);
    const A = await login(browser, a.username);
    const B = await login(browser, b.username);
    try {
      const sees = async (who: { page: Page }) => {
        await who.page.goto(`/codex/entry/${p.slug}`);
        return (await who.page.content()).includes(CANARY);
      };
      expect(await sees(A)).toBe(false);
      const res = await reveal(page, s.id, [a.id]);
      expect(res.status()).toBe(200);
      expect(await res.json()).toMatchObject({ revealedTo: [{ id: a.id, name: a.display }], ignored: [] });

      expect(await sees(A)).toBe(true);
      await expect(A.page.locator("[data-secret-block]")).toContainText(CANARY);
      await expect(A.page.getByRole("heading", { name: "Revealed to you" })).toBeVisible();
      expect(await sees(B)).toBe(false);
      await expect(A.page.getByTestId("reveal-status")).toHaveCount(0); // no DM controls for a player

      // The DM's page says who can see it.
      await page.goto(`/codex/entry/${p.slug}`);
      await expect(page.getByTestId("reveal-status")).toHaveText(`Revealed to ${a.display}`);

      // Exact set: revealing to B alone takes it away from A.
      expect((await reveal(page, s.id, [b.id])).status()).toBe(200);
      expect(await sees(A)).toBe(false);
      expect(await sees(B)).toBe(true);

      // Choosing nobody hides it from everyone; repeating a request changes nothing.
      expect((await reveal(page, s.id, [])).status()).toBe(200);
      expect((await reveal(page, s.id, [])).status()).toBe(200);
      expect(await sees(B)).toBe(false);
      expect(await query(`SELECT 1 FROM secret_reveals WHERE secret_id = $1`, [s.id])).toHaveLength(0);
    } finally {
      await A.context.close();
      await B.context.close();
    }
  });

  test("[TC-SECR-019] the reveal control works with the mouse and the keyboard, and says who it is revealed to", async ({ page, browser }) => {
    test.slow();
    const a = await newPlayer("ui");
    const p = await makePage(page, block());
    const [s] = await secretRows(p.id);
    await page.goto(`/codex/entry/${p.slug}`);
    const toggle = page.getByRole("button", { name: "Choose who sees this" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.focus();
    await page.keyboard.press("Enter");
    const group = page.getByRole("group", { name: "Choose who this passage is revealed to" });
    await expect(group).toBeVisible();
    await group.getByLabel(a.display).check();
    await page.getByTestId("reveal-save").click();
    await expect(page.getByTestId("reveal-status")).toHaveText(`Revealed to ${a.display}`);
    expect(await query<{ user_id: string }>(`SELECT user_id FROM secret_reveals WHERE secret_id = $1`, [s.id])).toEqual([{ user_id: a.id }]);

    // Undo it with "No one".
    await page.getByRole("button", { name: "Choose who sees this" }).click();
    await page.getByRole("button", { name: "No one" }).click();
    await page.getByTestId("reveal-save").click();
    await expect(page.getByTestId("reveal-status")).toHaveText("Not revealed to anyone");
    expect(await query(`SELECT 1 FROM secret_reveals WHERE secret_id = $1`, [s.id])).toHaveLength(0);
  });

  test("[TC-SECR-020] the reveal API: 401 signed out, 403 for a player, 404 for an unknown or malformed id, 400 for a bad body; the DM and unknown players are ignored and reported", async ({ page, browser, request }) => {
    test.slow();
    const player = await newPlayer("api");
    const p = await makePage(page, block());
    const [s] = await secretRows(p.id);
    const anon = await browser.newContext({ storageState: undefined });
    const { context, page: pp } = await login(browser, player.username);
    try {
      expect((await anon.request.post(`/api/secrets/${s.id}/reveal`, { data: { playerIds: [] } })).status()).toBe(401);
      expect((await pp.request.post(`/api/secrets/${s.id}/reveal`, { data: { playerIds: [player.id] } })).status()).toBe(403);
      expect(await query(`SELECT 1 FROM secret_reveals WHERE secret_id = $1`, [s.id])).toHaveLength(0);

      expect((await reveal(page, randomUUID(), [])).status()).toBe(404);
      expect((await reveal(page, "not-a-uuid", [])).status()).toBe(404);
      expect((await reveal(page, "' OR 1=1 --", [])).status()).toBe(404);
      for (const data of [{}, { playerIds: "x" }, { playerIds: ["nope"] }, { playerIds: Array.from({ length: 101 }, () => randomUUID()) }, { playerIds: [], extra: 1 }]) {
        expect((await page.request.post(`/api/secrets/${s.id}/reveal`, { data })).status(), JSON.stringify(data).slice(0, 40)).toBe(400);
      }

      const [dm] = await query<{ id: string }>(`SELECT id FROM users WHERE role = 'dm' LIMIT 1`);
      const ghost = randomUUID();
      const res = await reveal(page, s.id, [player.id, dm.id, ghost, player.id]);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.revealedTo).toEqual([{ id: player.id, name: player.display }]);
      expect(body.ignored.sort()).toEqual([dm.id, ghost].sort());
      expect(await query(`SELECT 1 FROM secret_reveals WHERE secret_id = $1`, [s.id])).toHaveLength(1);
      void request;
    } finally {
      await context.close();
      await anon.close();
    }
  });
});

test.describe("backup and restore", () => {
  test("[TC-SECR-021] the DM's export holds the block in its inline form (with its id), and importing it brings the block back without reveals", async ({ page, browser }) => {
    test.slow();
    const player = await newPlayer("exp");
    const p = await makePage(page, block());
    const [s] = await secretRows(p.id);
    expect((await reveal(page, s.id, [player.id])).ok()).toBe(true);

    const res = await page.request.get("/api/export");
    expect(res.status()).toBe(200);
    const payload = (await res.json()) as { entries: { slug: string; body: string }[] };
    const mine = payload.entries.find((e) => e.slug === p.slug);
    expect(mine?.body).toContain(`:::secret ${s.id}`);
    expect(mine?.body).toContain(SECRET_TEXT);
    expect(mine?.body).not.toMatch(/\{\{§/);

    // Remove the page, then restore it from the backup alone.
    await query(`DELETE FROM entries WHERE id = $1`, [p.id]);
    const full = { ...mine!, name: p.name, kind: "note", visibility: "public" };
    const imp = await page.request.post("/api/import", { data: { format: "asetheria-codex", entries: [full] } });
    expect(imp.status()).toBe(200);
    expect(await imp.json()).toMatchObject({ ok: true, created: 1, skipped: 0, rejected: [] });
    const [again] = await query<{ id: string }>(`SELECT id FROM entries WHERE slug = $1`, [p.slug]);
    const rows = await secretRows(again.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: s.id, body: SECRET_TEXT });
    expect(await query(`SELECT 1 FROM secret_reveals WHERE secret_id = $1`, [s.id])).toHaveLength(0);

    // The restored page still hides the text from a player.
    const { context, page: pp } = await login(browser, player.username);
    try {
      await pp.goto(`/codex/entry/${p.slug}`);
      expect(await pp.content()).not.toContain(CANARY);
    } finally {
      await context.close();
    }
  });

  test("[TC-SECR-022] the markdown export holds the passage for the DM, and a player is refused", async ({ page }) => {
    test.slow();
    const p = await makePage(page, block());
    const text = await (await page.request.get("/api/export?format=markdown")).text();
    expect(text).toContain(CANARY);
    expect(text).toContain(p.name);
  });

  test("[TC-SECR-023] importing a page with a malformed block skips it with the reason and still imports the others", async ({ page }) => {
    const bad = `zz-secret-imp-bad-${tag}`;
    const good = `zz-secret-imp-good-${tag}`;
    const imp = await page.request.post("/api/import", {
      data: { format: "asetheria-codex", entries: [{ name: bad, body: "Intro\n:::secret\nnever closed" }, { name: good, body: "fine" }] },
    });
    expect(imp.status()).toBe(200);
    const body = await imp.json();
    expect(body).toMatchObject({ ok: true, created: 1, skipped: 1 });
    expect(body.rejected[0]).toMatchObject({ name: bad });
    expect(body.rejected[0].error).toMatch(/never ends/);
    expect(await query(`SELECT 1 FROM entries WHERE name = $1`, [bad])).toHaveLength(0);
    expect(await query(`SELECT 1 FROM entries WHERE name = $1`, [good])).toHaveLength(1);
  });
});

test.describe("accessibility and small screens", () => {
  for (const theme of ["dark", "light"] as const) {
    test(tc("secrets.spec.ts", "accessibility and small screens", `a page with a secret block, with the reveal panel open, has no serious axe violations (${theme})`), async ({ page }) => {
      test.slow();
      await page.addInitScript((t) => localStorage.setItem("asetheria-theme", t), theme);
      await newPlayer(`ax${theme[0]}`);
      const p = await makePage(page, block());
      await page.goto(`/codex/entry/${p.slug}`);
      await page.getByRole("button", { name: "Choose who sees this" }).click();
      await page.waitForTimeout(400);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help} -> ${v.nodes[0]?.target.join(" ")}`);
      expect(serious).toEqual([]);
    });
  }

  test("[TC-SECR-026] at 375px the secret block and its control fit without sideways scrolling", async ({ browser }) => {
    test.slow();
    const context = await browser.newContext({ storageState: "tests/.auth/dm.json", viewport: { width: 375, height: 800 } });
    const page = await context.newPage();
    try {
      await newPlayer("sm");
      const p = await makePage(page, block());
      await page.goto(`/codex/entry/${p.slug}`);
      await page.getByRole("button", { name: "Choose who sees this" }).click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    } finally {
      await context.close();
    }
  });
});
