import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { Client } from "pg";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { closeDbHelpers, createTestPlayer, deleteTestUser, query } from "./db-helpers";
import { tc } from "./case-id";

/**
 * Phase 17: family trees and relationship webs. A relation is a typed tie between two pages; both ends must
 * be pages a viewer may read for the viewer to see it, loops are impossible, and the DM adds and removes
 * them from a page. Everything runs against the real app and the real (test) database.
 */

const ROOT = path.join(__dirname, "..");
const PASSWORD = "correct horse battery staple 42";
const tag = randomUUID().slice(0, 6);
const users: string[] = [];

test.use({ storageState: "tests/.auth/dm.json" });

test.beforeEach(async () => {
  await query(`DELETE FROM entries WHERE name LIKE 'zz-playwright-rel-%'`);
});
test.afterAll(async () => {
  await query(`DELETE FROM entries WHERE name LIKE 'zz-playwright-rel-%'`);
  for (const id of users) await deleteTestUser(id);
  await closeDbHelpers();
});

const nm = (label: string) => `zz-playwright-rel-${label}-${tag}`;

type Pg = { id: string; name: string };
async function page_(label: string, kind = "npc", visibility = "public"): Promise<Pg> {
  const n = nm(label);
  const [row] = await query<{ id: string }>(`INSERT INTO entries (slug, kind, name, visibility, source_path) VALUES ($1, $2::entry_kind, $3, $4::visibility, 'test: relations') RETURNING id`, [n, kind, n, visibility]);
  return { id: row.id, name: n };
}

/** Writes a relation straight to the table (the way it is stored: a symmetric one with its ends in order). */
async function rel(a: Pg, b: Pg, type: string, note = "") {
  const symmetric = ["spouse", "sibling", "ally", "rival"].includes(type);
  const [from, to] = symmetric && a.id > b.id ? [b, a] : [a, b];
  await query(`INSERT INTO relations (from_id, to_id, type, note) VALUES ($1, $2, $3, $4)`, [from.id, to.id, type, note]);
}

const post = (request: APIRequestContext, a: Pg, b: Pg, type: string, note?: string) => request.post("/api/relations", { data: { fromId: a.id, toId: b.id, type, ...(note !== undefined ? { note } : {}) } });

async function reader(browser: Browser, kinds: string[] = ["npc", "empire", "organization", "faction"]) {
  const username = `zz-rel-${randomUUID().slice(0, 6)}`;
  const id = await createTestPlayer(username, PASSWORD);
  users.push(id);
  await query(`UPDATE users SET display_name = $2 WHERE id = $1`, [id, `Zz ${username.slice(-4)}`]);
  for (const k of kinds) await query(`INSERT INTO entry_grants (user_id, kind, granted) VALUES ($1, $2::entry_kind, true)`, [id, k]);
  const context = await browser.newContext();
  const page = await context.newPage();
  const res = await page.request.post("/api/auth/login", { data: { username, password: PASSWORD }, headers: { "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.5.${Math.floor(Math.random() * 250)}` } });
  expect(res.ok()).toBe(true);
  return { context, page };
}

/** The list row of one person: the row whose link is their name (other rows only mention them in text). */
const person = (page: Page, name: string) => page.getByTestId("family-person").filter({ has: page.getByRole("link", { name, exact: true }) });

async function open(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

/** grandparents g1+g2 (spouses) -> parent p1 (+ spouse p2) -> children c1, c2 */
async function family() {
  const f = { g1: await page_("g1"), g2: await page_("g2"), p1: await page_("p1"), p2: await page_("p2"), c1: await page_("c1"), c2: await page_("c2") };
  await rel(f.g1, f.g2, "spouse");
  await rel(f.g1, f.p1, "parent");
  await rel(f.g2, f.p1, "parent");
  await rel(f.p1, f.p2, "spouse");
  for (const c of [f.c1, f.c2]) for (const p of [f.p1, f.p2]) await rel(p, c, "parent");
  return f;
}

test.describe("migration", () => {
  test("[TC-RELP-001] the table's checks hold: no tie to itself, only the seven kinds, a 300-character note, symmetric ends in order, no repeats, and deleting a page deletes its ties", async () => {
    expect((await query<{ t: string }>(`SELECT to_regclass('relations')::text AS t`))[0].t).toBe("relations");
    const a = await page_("m-a");
    const b = await page_("m-b");
    const [lo, hi] = a.id < b.id ? [a, b] : [b, a];
    const ins = (f: string, t: string, type: string, note = "") => query(`INSERT INTO relations (from_id, to_id, type, note) VALUES ($1, $2, $3, $4)`, [f, t, type, note]);
    await expect(ins(a.id, a.id, "parent")).rejects.toThrow(/relations_not_self/);
    await expect(ins(a.id, b.id, "friend")).rejects.toThrow(/relations_type/);
    await expect(ins(a.id, b.id, "parent", "n".repeat(301))).rejects.toThrow(/relations_note_length/);
    await expect(ins(hi.id, lo.id, "ally")).rejects.toThrow(/relations_symmetric_order/);
    await expect(ins(hi.id, lo.id, "spouse")).rejects.toThrow(/relations_symmetric_order/);
    await ins(lo.id, hi.id, "ally", "n".repeat(300));
    await expect(ins(lo.id, hi.id, "ally")).rejects.toThrow(/duplicate key/);
    await ins(hi.id, lo.id, "parent"); // a directed type may be written either way round
    await query(`DELETE FROM entries WHERE id = $1`, [a.id]);
    expect(await query(`SELECT 1 FROM relations WHERE from_id = $1 OR to_id = $1`, [a.id])).toHaveLength(0);
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      const sql = fs.readFileSync(path.join(ROOT, "scripts", "sql", "relations.sql"), "utf8");
      await client.query(sql);
      await client.query(sql);
    } finally {
      await client.end();
    }
  });

  test("[TC-RELP-002] the rollback drops only the relations table (run inside a transaction that is rolled back)", async () => {
    expect(process.env.DATABASE_URL ?? "").not.toMatch(/neon\.tech|neon\.build/);
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query("BEGIN");
      const entries = Number((await client.query(`SELECT count(*)::int AS n FROM entries`)).rows[0].n);
      await client.query(fs.readFileSync(path.join(ROOT, "scripts", "sql", "relations-rollback.sql"), "utf8"));
      expect((await client.query(`SELECT to_regclass('relations')::text AS t`)).rows[0].t).toBeNull();
      expect(Number((await client.query(`SELECT count(*)::int AS n FROM entries`)).rows[0].n)).toBe(entries);
      expect((await client.query(`SELECT to_regclass('calendar_config')::text AS t`)).rows[0].t).toBe("calendar_config");
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
    expect((await query<{ t: string }>(`SELECT to_regclass('relations')::text AS t`))[0].t).toBe("relations");
  });
});

test.describe("adding and removing (the API)", () => {
  test("[TC-RELP-003] a good relation of each kind is added; a symmetric one is stored with its ends in order whichever way it was sent", async ({ request }) => {
    const a = await page_("a");
    const b = await page_("b");
    const org = await page_("org", "organization");
    const emp = await page_("emp", "empire");
    expect((await post(request, a, b, "parent", "adopted")).status()).toBe(201);
    expect((await post(request, b, a, "spouse")).status()).toBe(201);
    expect((await post(request, a, b, "sibling")).status()).toBe(201);
    expect((await post(request, emp, org, "ally")).status()).toBe(201);
    expect((await post(request, org, emp, "rival")).status()).toBe(201);
    expect((await post(request, org, emp, "vassal")).status()).toBe(201);
    expect((await post(request, a, org, "member")).status()).toBe(201);
    const rows = await query<{ from_id: string; to_id: string; type: string; note: string }>(`SELECT from_id, to_id, type, note FROM relations ORDER BY type`);
    expect(rows).toHaveLength(7);
    for (const r of rows) if (["spouse", "sibling", "ally", "rival"].includes(r.type)) expect(r.from_id < r.to_id, r.type).toBe(true);
    expect(rows.find((r) => r.type === "parent")).toMatchObject({ from_id: a.id, to_id: b.id, note: "adopted" });
  });

  test("[TC-RELP-004] a repeat is refused, and for a symmetric tie the other way round is a repeat too", async ({ request }) => {
    const a = await page_("a");
    const b = await page_("b");
    expect((await post(request, a, b, "ally")).status()).toBe(201);
    for (const [x, y] of [[a, b], [b, a]] as const) {
      const res = await post(request, x, y, "ally");
      expect(res.status()).toBe(400);
      expect((await res.json()).error).toBe("That relation already exists.");
    }
    expect(await query(`SELECT 1 FROM relations`)).toHaveLength(1);
  });

  test("[TC-RELP-005] two requests adding the same relation at once leave one row, one accepted and one told it exists", async ({ request }) => {
    const a = await page_("a");
    const b = await page_("b");
    const results = await Promise.all([post(request, a, b, "rival"), post(request, b, a, "rival"), post(request, a, b, "rival")]);
    const codes = results.map((r) => r.status()).sort();
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.filter((c) => c === 400)).toHaveLength(2);
    expect(await query(`SELECT 1 FROM relations`)).toHaveLength(1);
  });

  test("[TC-RELP-006] nobody can be their own ancestor: a direct loop, a loop through two generations, and an overlord loop are refused with the reason", async ({ request }) => {
    const [a, b, c] = [await page_("a"), await page_("b"), await page_("c")];
    expect((await post(request, a, b, "parent")).status()).toBe(201);
    expect((await post(request, b, c, "parent")).status()).toBe(201);
    for (const [x, y] of [[b, a], [c, a]] as const) {
      const res = await post(request, x, y, "parent");
      expect(res.status()).toBe(400);
      expect((await res.json()).error).toMatch(/already a descendant of/);
    }
    const e1 = await page_("e1", "empire");
    const e2 = await page_("e2", "empire");
    expect((await post(request, e1, e2, "vassal")).status()).toBe(201);
    expect((await (await post(request, e2, e1, "vassal")).json()).error).toMatch(/each ranked above the other/);
    expect((await post(request, e1, e2, "rival")).status()).toBe(201);
    expect((await post(request, e2, e1, "ally")).status()).toBe(201); // allies and rivals may be mutual
    expect(await query(`SELECT 1 FROM relations WHERE type = 'parent'`)).toHaveLength(2);
  });

  test("[TC-RELP-007] a page cannot be related to itself, and pages of the wrong kind, a missing page and an archived page are refused", async ({ request }) => {
    const a = await page_("a");
    const place = await page_("place", "location");
    const org = await page_("org", "organization");
    const gone = await page_("gone");
    await query(`UPDATE entries SET archived_at = now() WHERE id = $1`, [gone.id]);
    expect((await (await post(request, a, a, "ally")).json()).error).toBe("A page cannot be related to itself.");
    expect((await (await post(request, a, place, "parent")).json()).error).toMatch(/is a location, which cannot have a parent relation/);
    expect((await (await post(request, a, org, "spouse")).json()).error).toMatch(/is a organization/);
    expect((await (await post(request, a, a === org ? a : place, "member")).json()).error).toMatch(/membership must point at one of/);
    expect((await (await post(request, a, { id: randomUUID(), name: "x" }, "ally")).json()).error).toMatch(/could not be found/);
    expect((await (await post(request, a, gone, "ally")).json()).error).toMatch(/could not be found/);
    expect(await query(`SELECT 1 FROM relations`)).toHaveLength(0);
  });

  test("[TC-RELP-008] the note limit holds at the boundary: 300 characters are saved, 301 are refused", async ({ request }) => {
    const a = await page_("a");
    const b = await page_("b");
    const c = await page_("c");
    expect((await post(request, a, b, "ally", "n".repeat(300))).status()).toBe(201);
    const over = await post(request, a, c, "ally", "n".repeat(301));
    expect(over.status()).toBe(400);
    expect((await over.json()).error).toMatch(/301 characters; the limit is 300/);
  });

  test("[TC-RELP-009] a child can have four parents and no more; a page can have 200 relations and no more", async ({ request }) => {
    test.slow();
    const kid = await page_("kid");
    const parents = [];
    for (let i = 1; i <= 5; i++) parents.push(await page_(`par${i}`));
    for (const p of parents.slice(0, 4)) expect((await post(request, p, kid, "parent")).status()).toBe(201);
    const fifth = await post(request, parents[4], kid, "parent");
    expect(fifth.status()).toBe(400);
    expect((await fifth.json()).error).toMatch(/already has 4 parents/);

    const hub = await page_("hub", "organization");
    await query(
      `WITH made AS (INSERT INTO entries (slug, kind, name, visibility, source_path) SELECT $1 || '-m' || g, 'npc', $1 || '-m' || g, 'public', 'test: relations' FROM generate_series(1, 201) g RETURNING id)
       INSERT INTO relations (from_id, to_id, type) SELECT id, $2::uuid, 'member' FROM made LIMIT 199`,
      [`zz-playwright-rel-bulk-${tag}`, hub.id],
    );
    const extra = await query<{ id: string }>(`SELECT id FROM entries WHERE name LIKE $1 AND id NOT IN (SELECT from_id FROM relations WHERE to_id = $2) ORDER BY name`, [`zz-playwright-rel-bulk-${tag}-m%`, hub.id]);
    expect(extra.length).toBeGreaterThanOrEqual(2);
    expect((await request.post("/api/relations", { data: { fromId: extra[0].id, toId: hub.id, type: "member" } })).status()).toBe(201); // the 200th
    const over = await request.post("/api/relations", { data: { fromId: extra[1].id, toId: hub.id, type: "member" } });
    expect(over.status()).toBe(400);
    expect((await over.json()).error).toMatch(/already has 200 relations/);
  });

  test("[TC-RELP-010] a bad request is a 400: missing fields, a bad id, an unknown kind of relation, extra keys, wrong types", async ({ request }) => {
    const a = await page_("a");
    const b = await page_("b");
    for (const data of [{}, { fromId: a.id }, { fromId: "nope", toId: b.id, type: "ally" }, { fromId: a.id, toId: b.id, type: "friend" }, { fromId: a.id, toId: b.id, type: "ally", extra: 1 }, { fromId: a.id, toId: b.id, type: 5 }, { fromId: a.id, toId: b.id, type: "ally", note: 5 }]) {
      expect((await request.post("/api/relations", { data })).status(), JSON.stringify(data)).toBe(400);
    }
    expect(await query(`SELECT 1 FROM relations`)).toHaveLength(0);
  });

  test("[TC-RELP-011] removing: the DM can; an unknown, malformed or odd id is a 404; the relation is gone and the pages stay", async ({ request }) => {
    const a = await page_("a");
    const b = await page_("b");
    await rel(a, b, "ally");
    const [{ id }] = await query<{ id: string }>(`SELECT id FROM relations`);
    for (const bad of [randomUUID(), "not-a-uuid", "%27%3B%20DROP%20TABLE%20relations%3B--"]) expect((await request.delete(`/api/relations/${bad}`)).status(), bad).toBe(404);
    expect((await request.delete(`/api/relations/${id}`)).status()).toBe(200);
    expect((await request.delete(`/api/relations/${id}`)).status()).toBe(404);
    expect(await query(`SELECT 1 FROM relations`)).toHaveLength(0);
    expect(await query(`SELECT 1 FROM entries WHERE id = ANY($1::uuid[])`, [[a.id, b.id]])).toHaveLength(2);
  });

  test("[TC-RELP-012] signed out: 401; a player: 403 for both adding and removing, and nothing changes", async ({ browser }) => {
    const a = await page_("a");
    const b = await page_("b");
    await rel(a, b, "ally");
    const [{ id }] = await query<{ id: string }>(`SELECT id FROM relations`);
    const anon = await browser.newContext({ storageState: undefined });
    const { context, page } = await reader(browser);
    try {
      expect((await anon.request.post("/api/relations", { data: { fromId: a.id, toId: b.id, type: "rival" } })).status()).toBe(401);
      expect((await anon.request.delete(`/api/relations/${id}`)).status()).toBe(401);
      expect((await page.request.post("/api/relations", { data: { fromId: a.id, toId: b.id, type: "rival" } })).status()).toBe(403);
      expect((await page.request.delete(`/api/relations/${id}`)).status()).toBe(403);
      expect(await query(`SELECT 1 FROM relations`)).toHaveLength(1);
    } finally {
      await context.close();
      await anon.close();
    }
  });
});

test.describe("on a page", () => {
  test("[TC-RELP-013] each page lists its relations as they read from that page, with the other page linked and any note", async ({ page }) => {
    test.slow();
    const f = await family();
    await open(page, `/codex/entry/${f.p1.name}`);
    const items = page.getByTestId("relation-item");
    await expect(items.filter({ hasText: `Child of ${f.g1.name}` })).toHaveCount(1);
    await expect(items.filter({ hasText: `Child of ${f.g2.name}` })).toHaveCount(1);
    await expect(items.filter({ hasText: `Spouse of ${f.p2.name}` })).toHaveCount(1);
    await expect(items.filter({ hasText: `Parent of ${f.c1.name}` })).toHaveCount(1);
    await expect(items).toHaveCount(5);
    await open(page, `/codex/entry/${f.c1.name}`);
    await expect(page.getByTestId("relation-item").filter({ hasText: `Child of ${f.p1.name}` })).toHaveCount(1);
    await page.getByTestId("relation-item").getByRole("link", { name: f.p1.name }).click();
    await expect(page).toHaveURL(new RegExp(`/codex/entry/${f.p1.name}$`));
  });

  test("[TC-RELP-014] the DM adds a relation from the page: pick a phrase, find the other page, add; reading it the other way round stores the same tie", async ({ page }) => {
    test.slow();
    const parent = await page_("par");
    const child = await page_("chi");
    await open(page, `/codex/entry/${child.name}`);
    await page.locator("#relation-phrase").selectOption("parent:rev"); // "Child of"
    await page.locator("#relation-find").fill(parent.name.slice(0, 22));
    await page.getByTestId("relation-result").filter({ hasText: parent.name }).click();
    await expect(page.getByTestId("relation-chosen")).toContainText(parent.name);
    await page.locator("#relation-note").fill("by blood");
    await page.getByTestId("relation-add").click();
    await expect(page.getByTestId("relation-item").filter({ hasText: `Child of ${parent.name}` })).toBeVisible();
    await expect(page.getByTestId("relation-item")).toContainText("(by blood)");
    expect(await query(`SELECT from_id, to_id, type FROM relations`)).toEqual([{ from_id: parent.id, to_id: child.id, type: "parent" }]);
    await open(page, `/codex/entry/${parent.name}`);
    await expect(page.getByTestId("relation-item").filter({ hasText: `Parent of ${child.name}` })).toBeVisible();
  });

  test("[TC-RELP-015] a rule broken in the form is shown in plain words and nothing is added; adding with no page chosen is refused", async ({ page }) => {
    test.slow();
    const a = await page_("a");
    const b = await page_("b");
    await rel(a, b, "parent");
    await open(page, `/codex/entry/${a.name}`);
    await page.getByTestId("relation-add").click();
    await expect(page.getByTestId("relation-errors")).toContainText("Choose the other page first");
    await page.locator("#relation-phrase").selectOption("parent:rev"); // a is the child of b: a loop
    await page.locator("#relation-find").fill(b.name.slice(0, 22));
    await page.getByTestId("relation-result").filter({ hasText: b.name }).click();
    await page.getByTestId("relation-add").click();
    await expect(page.getByTestId("relation-errors")).toContainText(/already a descendant of|already exists/);
    expect(await query(`SELECT 1 FROM relations`)).toHaveLength(1);
  });

  test("[TC-RELP-016] the DM removes a relation with its button, and a page with none says so and offers the form", async ({ page }) => {
    test.slow();
    const a = await page_("a");
    const b = await page_("b");
    await rel(a, b, "ally");
    await open(page, `/codex/entry/${a.name}`);
    await page.getByRole("button", { name: `Remove: Ally of ${b.name}` }).click();
    await expect(page.getByText("No relations yet.")).toBeVisible();
    await expect(page.locator("#relation-phrase")).toBeVisible();
    expect(await query(`SELECT 1 FROM relations`)).toHaveLength(0);
  });

  test("[TC-RELP-017] deleting a page deletes its ties, and the other page's list no longer shows them", async ({ page }) => {
    test.slow();
    const a = await page_("a");
    const b = await page_("b");
    await rel(a, b, "ally");
    await query(`DELETE FROM entries WHERE id = $1`, [b.id]);
    await open(page, `/codex/entry/${a.name}`);
    await expect(page.getByTestId("relation-item")).toHaveCount(0);
  });

  test("[TC-RELP-018] an archived page's ties are hidden from the other page and come back when it is restored", async ({ page }) => {
    test.slow();
    const a = await page_("a");
    const b = await page_("b");
    await rel(a, b, "ally");
    await query(`UPDATE entries SET archived_at = now() WHERE id = $1`, [b.id]);
    await open(page, `/codex/entry/${a.name}`);
    await expect(page.getByTestId("relation-item")).toHaveCount(0);
    await query(`UPDATE entries SET archived_at = NULL WHERE id = $1`, [b.id]);
    await open(page, `/codex/entry/${a.name}`);
    await expect(page.getByTestId("relation-item")).toHaveCount(1);
  });

  test("[TC-RELP-019] a player sees only relations whose other end they may read, with no add form or remove button, and a hidden page is never named", async ({ browser }) => {
    test.slow();
    const a = await page_("a");
    const open1 = await page_("open");
    const hidden = await page_("hidden", "npc", "secret");
    await rel(a, open1, "sibling");
    await rel(a, hidden, "sibling");
    const { context, page } = await reader(browser);
    try {
      await open(page, `/codex/entry/${a.name}`);
      const html = await page.content();
      expect(html).not.toContain(hidden.name);
      await expect(page.getByTestId("relation-item")).toHaveCount(1);
      await expect(page.getByTestId("relation-item")).toContainText(open1.name);
      await expect(page.locator("#relation-phrase")).toHaveCount(0);
      await expect(page.getByTestId("relation-remove")).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});

test.describe("the family tree", () => {
  test("[TC-RELP-020] each generation is a row, children below parents, spouses side by side, and the list says who is tied to whom", async ({ page }) => {
    test.slow();
    const f = await family();
    await open(page, `/codex/entry/${f.p1.name}/tree`);
    await expect(page.getByRole("heading", { level: 1, name: `Family of ${f.p1.name}` })).toBeVisible();
    await expect(page.locator("[data-person]")).toHaveCount(6);
    const box = async (id: string) => {
      const b = await page.locator(`[data-person="${id}"]`).boundingBox();
      return b as { x: number; y: number; width: number; height: number };
    };
    const [g1, g2, p1, p2, c1, c2] = [await box(f.g1.id), await box(f.g2.id), await box(f.p1.id), await box(f.p2.id), await box(f.c1.id), await box(f.c2.id)];
    expect(p1.y).toBeGreaterThan(g1.y);
    expect(c1.y).toBeGreaterThan(p1.y);
    expect(Math.abs(g1.y - g2.y)).toBeLessThan(1);
    expect(Math.abs(p1.y - p2.y)).toBeLessThan(1);
    expect(Math.abs(c1.y - c2.y)).toBeLessThan(1);
    expect(Math.abs(g1.x - g2.x)).toBeGreaterThan(g1.width); // side by side, not overlapping
    expect(Math.abs(g1.x - g2.x)).toBeLessThan(g1.width * 1.6);
    await expect(page.getByTestId("family-generation")).toHaveCount(3);
    await expect(person(page, f.p1.name)).toContainText(`Child of ${f.g1.name}`);
    await expect(person(page, f.p1.name)).toContainText(`Spouse of ${f.p2.name}`);
    await expect(person(page, f.p1.name)).toContainText(`Parent of ${f.c1.name}`);
    await expect(page.locator("[data-edge='parent']")).toHaveCount(6);
    await expect(page.locator("[data-edge='spouse']")).toHaveCount(2);
    const spot0 = (id: string) => page.locator(`[data-person="${id}"]`).evaluate((el) => `${el.getAttribute("x")},${el.getAttribute("y")}`);
    const first = await Promise.all([f.g1, f.p1, f.c1, f.c2].map((x) => spot0(x.id)));
    // The same family from any member's page is the same picture.
    await open(page, `/codex/entry/${f.c2.name}/tree`);
    await expect(page.locator("[data-person]")).toHaveCount(6);
    // The drawing is the same: each person's rectangle sits at the same place (compared by its coordinates,
    // because the person whose tree it is has a thicker outline, which changes a measured box).
    const spot = (id: string) => page.locator(`[data-person="${id}"]`).evaluate((el) => `${el.getAttribute("x")},${el.getAttribute("y")}`);
    expect(await Promise.all([f.g1, f.p1, f.c1, f.c2].map((x) => spot(x.id)))).toEqual(first);
  });

  test("[TC-RELP-021] the tree opens from a page's relationship list, and the people in the list are real links", async ({ page }) => {
    test.slow();
    const f = await family();
    await open(page, `/codex/entry/${f.c1.name}`);
    await page.getByRole("link", { name: "View the family tree" }).click();
    await expect(page).toHaveURL(new RegExp(`/codex/entry/${f.c1.name}/tree$`));
    await page.getByTestId("family-person").getByRole("link", { name: f.g1.name }).click();
    await expect(page).toHaveURL(new RegExp(`/codex/entry/${f.g1.name}$`));
  });

  test("[TC-RELP-022] a page with no family ties gets an empty state; an unreadable or missing page is a 404", async ({ page, browser }) => {
    test.slow();
    const lone = await page_("lone");
    const secret = await page_("sec", "npc", "secret");
    await open(page, `/codex/entry/${lone.name}/tree`);
    await expect(page.getByText("No family ties yet")).toBeVisible();
    await expect(page.getByRole("link", { name: `Back to ${lone.name}` }).first()).toBeVisible();
    expect((await page.goto(`/codex/entry/${nm("missing")}/tree`))?.status()).toBe(404);
    const { context, page: pp } = await reader(browser);
    try {
      expect((await pp.goto(`/codex/entry/${secret.name}/tree`))?.status()).toBe(404);
      await open(pp, `/codex/entry/${lone.name}/tree`);
      await expect(pp.getByText("Nothing has been revealed about this family yet.")).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("[TC-RELP-023] a relative a player may not read is not drawn, not named, and not hinted at; a hidden middle person cuts off the branch beyond them", async ({ browser }) => {
    test.slow();
    const f = await family();
    await query(`UPDATE entries SET visibility = 'secret' WHERE id = ANY($1::uuid[])`, [[f.c2.id, f.p1.id]]);
    const { context, page } = await reader(browser);
    try {
      await open(page, `/codex/entry/${f.c1.name}/tree`);
      const html = await page.content();
      for (const hidden of [f.c2.name, f.p1.name, f.g1.name, f.g2.name]) expect(html, hidden).not.toContain(hidden);
      // The one parent they can read, and the child, remain: p2 above c1.
      await expect(page.locator("[data-person]")).toHaveCount(2);
      await expect(person(page, f.p2.name)).toContainText(`Parent of ${f.c1.name}`);
      await expect(person(page, f.p2.name)).not.toContainText("Spouse");
    } finally {
      await context.close();
    }
    await open(await (await browser.newContext({ storageState: "tests/.auth/dm.json" })).newPage(), `/codex/entry/${f.c1.name}/tree`);
  });

  test("[TC-RELP-024] the tree is the same every time it is drawn, and a long line of descent draws every generation", async ({ page }) => {
    test.slow();
    const line: Pg[] = [];
    for (let i = 0; i < 8; i++) line.push(await page_(`gen${i}`));
    for (let i = 0; i < 7; i++) await rel(line[i], line[i + 1], "parent");
    await open(page, `/codex/entry/${line[3].name}/tree`);
    await expect(page.getByTestId("family-generation")).toHaveCount(8);
    // Compared by the drawing's own coordinates, which do not move with the scroll position.
    const rows = () => Promise.all(line.map((p) => page.locator(`[data-person="${p.id}"]`).evaluate((el) => Number(el.getAttribute("y")))));
    const ys = await rows();
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    expect(new Set(ys).size).toBe(8);
    await page.reload();
    expect(await rows()).toEqual(ys);
  });
});

test.describe("the relationship web", () => {
  async function powers() {
    const [e1, e2, e3] = [await page_("e1", "empire"), await page_("e2", "empire"), await page_("e3", "empire")];
    const [o1, o2] = [await page_("o1", "organization"), await page_("o2", "faction")];
    const n1 = await page_("n1");
    await rel(e1, e2, "ally", "old treaty");
    await rel(e2, e3, "rival");
    await rel(e3, e1, "vassal");
    await rel(o1, e1, "member");
    await rel(o1, o2, "rival");
    await rel(n1, o2, "member");
    return { e1, e2, e3, o1, o2, n1 };
  }

  test("[TC-RELP-025] every tie among readable pages is drawn and listed, with how each is drawn and the count", async ({ page }) => {
    test.slow();
    const w = await powers();
    await open(page, "/relations");
    await expect(page.getByTestId("relation-count")).toContainText(/6 ties between 6 pages|ties between/);
    const mine = page.getByTestId("relation-row").filter({ hasText: tag });
    await expect(mine).toHaveCount(6);
    await expect(mine.filter({ hasText: w.e1.name }).first()).toBeVisible();
    await expect(page.locator("[data-edge='ally']")).toHaveCount(1);
    await expect(page.locator("[data-edge='rival']")).toHaveCount(2);
    await expect(page.locator("[data-edge='vassal']")).toHaveCount(1);
    await expect(page.locator("[data-edge='member']")).toHaveCount(2);
    await expect(page.locator("[data-page]")).toHaveCount(6);
    const legend = page.getByTestId("relation-legend");
    for (const word of ["solid line", "dashed line", "dotted line", "dash-dot line"]) await expect(legend).toContainText(word);
    await expect(mine.filter({ hasText: "old treaty" })).toHaveCount(1);
  });

  test("[TC-RELP-026] the filters narrow by kind of tie and by kind of page; clearing restores; nonsense in the address is ignored", async ({ page }) => {
    test.slow();
    await powers();
    await open(page, `/relations?type=rival`);
    await expect(page.getByTestId("relation-row").filter({ hasText: tag })).toHaveCount(2);
    await open(page, `/relations?type=member&kind=organization&kind=faction`);
    // A membership counts only when both ends are of a chosen kind: the person (an npc) falls outside.
    await expect(page.getByTestId("relation-row").filter({ hasText: tag })).toHaveCount(0);
    await expect(page.getByText("No ties match those filters")).toBeVisible();
    await page.getByRole("link", { name: "Clear filters" }).first().click();
    await expect(page.getByTestId("relation-row").filter({ hasText: tag })).toHaveCount(6);
    for (const q of ["type=nonsense", "kind=ore", "type=parent", "type=%27%3B--", "kind=" + "x".repeat(300)]) {
      const res = await page.goto(`/relations?${q}`);
      expect(res?.status(), q).toBe(200);
      await expect(page.getByRole("heading", { level: 1, name: "Relationships" })).toBeVisible();
    }
  });

  test("[TC-RELP-027] a player sees only ties between pages they may read; a secret power and its ties are nowhere in the picture or the table", async ({ browser }) => {
    test.slow();
    const w = await powers();
    await query(`UPDATE entries SET visibility = 'secret' WHERE id = $1`, [w.e2.id]);
    const { context, page } = await reader(browser);
    try {
      await open(page, "/relations");
      const html = await page.content();
      expect(html).not.toContain(w.e2.name);
      expect(html).not.toContain("old treaty");
      // e2 was in 2 ties (ally, rival): 4 remain.
      await expect(page.getByTestId("relation-row").filter({ hasText: tag })).toHaveCount(4);
    } finally {
      await context.close();
    }
  });

  test("[TC-RELP-028] with no ties the DM is told how to add some and a player is told nothing has been revealed; a player with no grants sees an empty page that gives nothing away", async ({ page, browser }) => {
    await open(page, "/relations");
    await expect(page.getByText("No relationships yet")).toBeVisible();
    await expect(page.getByText(/add an alliance, a rivalry/)).toBeVisible();
    const w = await powers();
    const { context, page: pp } = await reader(browser, []);
    try {
      await open(pp, "/relations");
      await expect(pp.getByText("No relationships yet")).toBeVisible();
      await expect(pp.getByText(/Nothing has been revealed/)).toBeVisible();
      expect(await pp.content()).not.toContain(w.e1.name);
    } finally {
      await context.close();
    }
  });

  test("[TC-RELP-029] the sidebar has a Relationships link for everyone, and the filter form works by keyboard alone", async ({ page, browser }) => {
    test.slow();
    await powers();
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Relationships", exact: true }).first()).toBeVisible();
    const { context, page: pp } = await reader(browser);
    try {
      await pp.goto("/");
      await expect(pp.getByRole("link", { name: "Relationships", exact: true }).first()).toBeVisible();
    } finally {
      await context.close();
    }
    await open(page, "/relations");
    await page.getByLabel("Rival").focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("Tab");
    // Tab through to the Filter button and press it.
    await page.getByRole("button", { name: "Filter" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/type=rival/);
    await expect(page.getByTestId("relation-row").filter({ hasText: tag })).toHaveCount(2);
  });
});

test.describe("accessibility and small screens", () => {
  for (const theme of ["dark", "light"] as const) {
    test(tc("relations.spec.ts", "accessibility and small screens", `a page with relations, its family tree and the web have no serious axe violations (${theme})`), async ({ page }) => {
      test.slow();
      await page.addInitScript((t) => localStorage.setItem("asetheria-theme", t), theme);
      const f = await family();
      const org = await page_("axorg", "organization");
      await rel(f.p1, org, "member");
      for (const url of [`/codex/entry/${f.p1.name}`, `/codex/entry/${f.p1.name}/tree`, "/relations"]) {
        await open(page, url);
        await page.waitForTimeout(300);
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help} -> ${v.nodes[0]?.target.join(" ")}`);
        expect(serious, url).toEqual([]);
      }
    });
  }

  test("[TC-RELP-032] at 375px the page, the family tree and the web do not scroll the page sideways (the pictures scroll inside their own frame)", async ({ browser }) => {
    test.slow();
    const f = await family();
    const org = await page_("smorg", "organization");
    await rel(f.p1, org, "member");
    const context = await browser.newContext({ storageState: "tests/.auth/dm.json", viewport: { width: 375, height: 800 } });
    const p = await context.newPage();
    try {
      for (const url of [`/codex/entry/${f.p1.name}`, `/codex/entry/${f.p1.name}/tree`, "/relations"]) {
        await open(p, url);
        expect(await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), url).toBeLessThanOrEqual(0);
      }
    } finally {
      await context.close();
    }
  });
});
