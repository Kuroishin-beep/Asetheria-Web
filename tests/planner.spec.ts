import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Browser } from "@playwright/test";
import { parseRollTable } from "../src/lib/roll-table";
import { closeDbHelpers, createTestPlayer, deleteTestUser, query } from "./db-helpers";

/**
 * Phase 8d (ENH-07d): the campaign planner. Start a session, build an encounter
 * from creatures the DM can read, and reveal chosen entries to chosen players
 * after the session. R6-style rule throughout: nothing here may widen what a
 * player can see beyond exactly what the DM selected.
 */

const PASSWORD = "correct horse battery staple 42";
const tag = randomUUID().slice(0, 8);
const SRC = "test: planner";
const TYPE = `zztype${tag}`;
const slugOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const users: string[] = [];
const createdSessionSlugs: string[] = [];
const ids: Record<string, string> = {};

async function entry(name: string, kind: string, extra: { visibility?: string; fields?: Record<string, string>; archived?: boolean } = {}) {
  const rows = await query<{ id: string }>(
    `INSERT INTO entries (slug, kind, name, summary, fields, visibility, archived_at, source_path)
     VALUES ($1, $2, $3, 'A planner fixture.', $4::jsonb, $5, $6, $7) RETURNING id`,
    [slugOf(name), kind, name, JSON.stringify(extra.fields ?? {}), extra.visibility ?? "public", extra.archived ? new Date() : null, SRC],
  );
  ids[name] = rows[0].id;
  return rows[0].id;
}

async function newPlayer(): Promise<{ id: string; username: string }> {
  const username = `zz-pl-${randomUUID().slice(0, 8)}`;
  const id = await createTestPlayer(username, PASSWORD);
  users.push(id);
  await query(`UPDATE users SET display_name = $2 WHERE id = $1`, [id, `Zz ${username.slice(-4)}`]);
  return { id, username };
}

async function login(browser: Browser, username: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  expect((await page.request.post("/api/auth/login", { data: { username, password: PASSWORD } })).ok()).toBe(true);
  return { context, page };
}

async function startSession(request: APIRequestContext) {
  const res = await request.post("/api/planner/session");
  expect(res.status()).toBe(201);
  const body = (await res.json()) as { slug: string; number: number };
  createdSessionSlugs.push(body.slug);
  return body;
}

const BEAST_A = `Zz Beast A ${tag}`;
const BEAST_B = `Zz Beast B ${tag}`;
const BEAST_ARCHIVED = `Zz Beast Archived ${tag}`;
const BEAST_SECRET = `Zz Beast Secret ${tag}`;

test.beforeAll(async () => {
  await entry(BEAST_A, "creature", { fields: { cr: "1/2", type: `${TYPE} beast`, habitat: "forest" } });
  await entry(BEAST_B, "creature", { fields: { cr: "3", type: `${TYPE} beast`, habitat: "desert" } });
  await entry(BEAST_ARCHIVED, "creature", { fields: { cr: "1", type: `${TYPE} beast` }, archived: true });
  await entry(BEAST_SECRET, "creature", { fields: { cr: "1", type: `${TYPE} beast` }, visibility: "secret" });
});

test.afterAll(async () => {
  for (const slug of createdSessionSlugs) await query(`DELETE FROM entries WHERE slug = $1 AND kind = 'session'`, [slug]);
  await query(`DELETE FROM entry_grants WHERE entry_id IN (SELECT id FROM entries WHERE source_path = $1)`, [SRC]);
  await query(`DELETE FROM entries WHERE source_path = $1`, [SRC]);
  for (const id of users) await deleteTestUser(id);
  await closeDbHelpers();
});

test.describe("start a session", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("creates the next numbered session, secret, with today's date and the prep checklist", async ({ request }) => {
    const before = (await query<{ n: string | null }>(`SELECT max((fields->>'sessionNumber')::int)::text AS n FROM entries WHERE kind = 'session' AND fields->>'sessionNumber' ~ '^[0-9]+$'`))[0].n;
    const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const t0 = day(new Date());
    const { slug, number } = await startSession(request);
    const t1 = day(new Date());
    expect(number).toBe(Number(before ?? 0) + 1);
    expect(slug).toBe(`session-${number}`);

    const [row] = await query<{ kind: string; name: string; visibility: string; fields: Record<string, string>; body: string; dm_notes: string; tags: string[] }>(
      `SELECT kind, name, visibility, fields, body, dm_notes, tags FROM entries WHERE slug = $1`,
      [slug],
    );
    expect(row.kind).toBe("session");
    expect(row.name).toBe(`Session ${number}`);
    expect(row.visibility).toBe("secret");
    expect(row.fields.sessionNumber).toBe(String(number));
    expect([t0, t1]).toContain(row.fields.playDate);
    expect(row.body).toContain("## Prep checklist");
    expect((row.body.match(/^- \[ \]/gm) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(row.dm_notes.length).toBeGreaterThan(0);
    expect(row.tags).toContain("session");

    const revisions = await query<{ action: string }>(`SELECT r.action FROM revisions r JOIN entries e ON e.id = r.entry_id WHERE e.slug = $1`, [slug]);
    expect(revisions.map((r) => r.action)).toEqual(["create"]);
  });

  test("six simultaneous starts all succeed with six different, consecutive numbers (no duplicates)", async ({ request }) => {
    const results = await Promise.all(Array.from({ length: 6 }, () => request.post("/api/planner/session")));
    for (const r of results) expect(r.status()).toBe(201);
    const bodies = (await Promise.all(results.map((r) => r.json()))) as { slug: string; number: number }[];
    for (const b of bodies) createdSessionSlugs.push(b.slug);
    const numbers = bodies.map((b) => b.number).sort((a, b) => a - b);
    expect(new Set(numbers).size).toBe(6);
    expect(numbers[5] - numbers[0]).toBe(5);
    const dupes = await query(`SELECT slug FROM entries WHERE kind = 'session' AND archived_at IS NULL GROUP BY slug HAVING count(*) > 1`);
    expect(dupes).toHaveLength(0);
  });

  test("an archived session's number is never reused", async ({ request }) => {
    const first = await startSession(request);
    await query(`UPDATE entries SET archived_at = now() WHERE slug = $1`, [first.slug]);
    const second = await startSession(request);
    expect(second.number).toBeGreaterThan(first.number);
  });

  test("the planner page's button starts a session and opens it", async ({ page }) => {
    await page.goto("/planner");
    await expect(page.getByRole("heading", { level: 1, name: "Planner" })).toBeVisible();
    const button = page.getByTestId("start-session");
    await expect(async () => {
      await button.click();
      await expect(page).toHaveURL(/\/codex\/entry\/session-\d+$/, { timeout: 4000 });
    }).toPass({ timeout: 20000 });
    createdSessionSlugs.push(new URL(page.url()).pathname.split("/").pop() as string);
    await expect(page.getByRole("heading", { level: 1, name: /^Session \d+$/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Prep checklist" })).toBeVisible();
  });

  test("the command palette has a Start a new session command that creates it and navigates there", async ({ page }) => {
    await page.goto("/");
    await expect(async () => {
      await page.keyboard.press("Control+k");
      await expect(page.getByRole("textbox", { name: "Search query" })).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15000 });
    await page.getByRole("textbox", { name: "Search query" }).fill("start a new session");
    await page.getByRole("button", { name: /Start a new session/ }).first().click();
    await expect(page).toHaveURL(/\/codex\/entry\/session-\d+$/);
    createdSessionSlugs.push(new URL(page.url()).pathname.split("/").pop() as string);
  });
});

test.describe("who may use the planner", () => {
  test("signed-out callers get 401 on every planner endpoint", async ({ request }) => {
    const headers = { cookie: "" };
    expect((await request.post("/api/planner/session", { headers })).status()).toBe(401);
    expect((await request.post("/api/planner/encounter", { headers, data: { count: 1 } })).status()).toBe(401);
    expect((await request.post("/api/planner/reveal", { headers, data: { playerIds: [randomUUID()], entryIds: [randomUUID()] } })).status()).toBe(401);
  });

  test("a player gets 403 on every planner endpoint and cannot open the page", async ({ browser }) => {
    const p = await newPlayer();
    const { context, page } = await login(browser, p.username);
    try {
      expect((await page.request.post("/api/planner/session")).status()).toBe(403);
      expect((await page.request.post("/api/planner/encounter", { data: { count: 1 } })).status()).toBe(403);
      expect((await page.request.post("/api/planner/reveal", { data: { playerIds: [p.id], entryIds: [ids[BEAST_A]] } })).status()).toBe(403);
      await page.goto("/planner");
      await expect(page).not.toHaveURL(/planner/);
      const grants = await query<{ n: string }>(`SELECT count(*)::text AS n FROM entry_grants WHERE user_id = $1`, [p.id]);
      expect(grants[0].n).toBe("0");
    } finally {
      await context.close();
    }
  });
});

test.describe("encounter builder", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  const roll = (request: APIRequestContext, data: Record<string, unknown>) => request.post("/api/planner/encounter", { data });

  test("only creatures the DM can read are ever returned: archived ones never, secret ones yes", async ({ request }) => {
    const seen = new Set<string>();
    let pool = -1;
    for (let i = 0; i < 40; i++) {
      const res = await roll(request, { count: 8, type: TYPE });
      expect(res.status()).toBe(200);
      const body = (await res.json()) as { creatures: { name: string }[]; pool: number };
      pool = body.pool;
      for (const c of body.creatures) seen.add(c.name);
    }
    expect(pool).toBe(3);
    expect(seen.has(BEAST_ARCHIVED)).toBe(false);
    expect([...seen].sort()).toEqual([BEAST_A, BEAST_B, BEAST_SECRET].sort());
  });

  test("a single pick is random over the pool and never repeats within one roll", async ({ request }) => {
    const hits = new Map<string, number>();
    for (let i = 0; i < 60; i++) {
      const body = (await (await roll(request, { count: 1, type: TYPE })).json()) as { creatures: { name: string }[] };
      expect(body.creatures).toHaveLength(1);
      hits.set(body.creatures[0].name, (hits.get(body.creatures[0].name) ?? 0) + 1);
    }
    expect(hits.size).toBe(3);
    const multi = (await (await roll(request, { count: 3, type: TYPE })).json()) as { creatures: { name: string }[] };
    expect(new Set(multi.creatures.map((c) => c.name)).size).toBe(3);
  });

  test("the highest-CR filter understands fractions and excludes tougher creatures", async ({ request }) => {
    const at = async (crMax: string) => ((await (await roll(request, { count: 8, type: TYPE, crMax })).json()) as { creatures: { name: string }[] }).creatures.map((c) => c.name).sort();
    expect(await at("1/2")).toEqual([BEAST_A]);
    expect(await at("1")).toEqual([BEAST_A, BEAST_SECRET].sort());
    expect(await at("3")).toEqual([BEAST_A, BEAST_B, BEAST_SECRET].sort());
    expect(await at("0")).toEqual([]);
  });

  test("habitat and type filters narrow the pool, and nothing matching gives an empty, friendly result", async ({ request }) => {
    const desert = (await (await roll(request, { count: 8, type: TYPE, habitat: "desert" })).json()) as { creatures: { name: string }[]; pool: number };
    expect(desert.creatures.map((c) => c.name)).toEqual([BEAST_B]);
    const none = (await (await roll(request, { count: 3, type: `no-such-type-${tag}` })).json()) as { creatures: unknown[]; pool: number };
    expect(none).toMatchObject({ creatures: [], pool: 0 });
  });

  test("rolling a table returns a roll inside its dice span and exactly that row's text", async ({ request }) => {
    const [t] = await query<{ body: string; dice: string }>(`SELECT body, fields->>'dice' AS dice FROM entries WHERE slug = 'forage-in-the-desert'`);
    const rows = parseRollTable(t.body).rows;
    const seen = new Set<number>();
    for (let i = 0; i < 25; i++) {
      const body = (await (await roll(request, { count: 1, tableSlug: "forage-in-the-desert" })).json()) as { table: { roll: number; result: string; dice: string } };
      expect(body.table.dice).toBe("1d8");
      expect(body.table.roll).toBeGreaterThanOrEqual(1);
      expect(body.table.roll).toBeLessThanOrEqual(8);
      expect(body.table.result).toBe(rows.find((r) => body.table.roll >= r.min && body.table.roll <= r.max)?.result);
      seen.add(body.table.roll);
    }
    expect(seen.size).toBeGreaterThan(3);
  });

  test("bad requests are refused: count out of range, bad CR, junk slug, a page that is not a table, a table that does not exist", async ({ request }) => {
    for (const bad of [{ count: 0 }, { count: 9 }, { count: 1.5 }, { count: "3" }, { count: 1, crMax: "x".repeat(11) }, { count: 1, tableSlug: "../etc/passwd" }, { count: 1, type: "x".repeat(41) }]) {
      expect((await roll(request, bad)).status(), JSON.stringify(bad)).toBe(400);
    }
    expect((await roll(request, { count: 1, crMax: "abc" })).status()).toBe(400);
    expect((await roll(request, { count: 1, tableSlug: "malachite" })).status()).toBe(400);
    expect((await roll(request, { count: 1, tableSlug: "no-such-table-here" })).status()).toBe(404);
    expect((await request.post("/api/planner/encounter", { data: "{not json", headers: { "content-type": "application/json" } })).status()).toBe(400);
  });

  test("the builder page rolls and shows linked creatures and the table result", async ({ page }) => {
    await page.goto("/planner");
    await page.getByLabel("Type contains").fill(TYPE);
    await page.getByLabel("Also roll a table").selectOption("forage-in-the-desert");
    await expect(async () => {
      await page.getByTestId("roll-encounter").click();
      await expect(page.getByTestId("encounter-result")).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 20000 });
    await expect(page.getByTestId("encounter-result").getByRole("link").first()).toBeVisible();
    await expect(page.getByTestId("table-roll")).toContainText("Forage in the Desert");
  });
});

test.describe("reveal after the session", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  const reveal = (request: APIRequestContext, data: unknown) => request.post("/api/planner/reveal", { data });

  test("creates grants for exactly the chosen player and entry pairs and nothing else (database assertion)", async ({ request }) => {
    const a = await newPlayer();
    const b = await newPlayer();
    const c = await newPlayer();
    const e1 = await entry(`Zz Reveal One ${tag}`, "note");
    const e2 = await entry(`Zz Reveal Two ${tag}`, "note");
    const sec = await entry(`Zz Reveal Secret ${tag}`, "note", { visibility: "secret" });
    const bystander = await entry(`Zz Reveal Bystander ${tag}`, "note");

    const allGrants = () =>
      query<{ user_id: string; kind: string | null; entry_id: string | null; granted: boolean }>(
        `SELECT user_id, kind, entry_id, granted FROM entry_grants WHERE user_id = ANY($1::uuid[]) ORDER BY user_id, entry_id`,
        [[a.id, b.id, c.id]],
      );
    expect(await allGrants()).toHaveLength(0);

    const res = await reveal(request, { playerIds: [a.id, b.id], entryIds: [e1, e2, sec] });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { players: number; entries: number; granted: number; skippedSecret: { id: string }[]; missingEntries: number };
    expect(body).toMatchObject({ players: 2, entries: 2, granted: 4, missingEntries: 0 });
    expect(body.skippedSecret.map((s) => s.id)).toEqual([sec]);

    const rows = await allGrants();
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.granted && r.kind === null)).toBe(true);
    const pairs = rows.map((r) => `${r.user_id}:${r.entry_id}`).sort();
    expect(pairs).toEqual([`${a.id}:${e1}`, `${a.id}:${e2}`, `${b.id}:${e1}`, `${b.id}:${e2}`].sort());
    expect(rows.some((r) => r.user_id === c.id)).toBe(false);
    expect(rows.some((r) => r.entry_id === sec || r.entry_id === bystander)).toBe(false);

    // Visibility is untouched.
    const vis = await query<{ id: string; visibility: string }>(`SELECT id, visibility FROM entries WHERE id = ANY($1::uuid[])`, [[e1, e2, sec, bystander]]);
    expect(Object.fromEntries(vis.map((v) => [v.id, v.visibility]))).toEqual({ [e1]: "public", [e2]: "public", [sec]: "secret", [bystander]: "public" });

    // Running it again changes nothing.
    expect((await reveal(request, { playerIds: [a.id, b.id], entryIds: [e1, e2] })).status()).toBe(200);
    expect(await allGrants()).toHaveLength(4);
  });

  test("a previous denial is turned into a grant, and duplicates in the request make no duplicate rows", async ({ request }) => {
    const p = await newPlayer();
    const e = await entry(`Zz Reveal Denied ${tag}`, "note");
    await query(`INSERT INTO entry_grants (user_id, entry_id, granted) VALUES ($1, $2, false)`, [p.id, e]);
    const res = await reveal(request, { playerIds: [p.id, p.id], entryIds: [e, e, e] });
    expect(res.status()).toBe(200);
    const rows = await query<{ granted: boolean }>(`SELECT granted FROM entry_grants WHERE user_id = $1 AND entry_id = $2`, [p.id, e]);
    expect(rows).toEqual([{ granted: true }]);
  });

  test("a DM id, an unknown player and an unknown or archived entry are reported, never granted", async ({ request }) => {
    const p = await newPlayer();
    const live = await entry(`Zz Reveal Live ${tag}`, "note");
    const gone = await entry(`Zz Reveal Archived ${tag}`, "note", { archived: true });
    const dmId = (await query<{ id: string }>(`SELECT id FROM users WHERE role = 'dm' LIMIT 1`))[0].id;
    const res = await reveal(request, { playerIds: [p.id, dmId, randomUUID()], entryIds: [live, gone, randomUUID()] });
    const body = (await res.json()) as { players: number; entries: number; granted: number; missingEntries: number; unknownPlayers: number };
    expect(body).toMatchObject({ players: 1, entries: 1, granted: 1, missingEntries: 2, unknownPlayers: 2 });
    expect((await query(`SELECT 1 FROM entry_grants WHERE user_id = $1`, [dmId]))).toHaveLength(0);
    expect((await query(`SELECT 1 FROM entry_grants WHERE entry_id = $1`, [gone]))).toHaveLength(0);
  });

  test("invalid requests are refused and write nothing", async ({ request }) => {
    const p = await newPlayer();
    const e = await entry(`Zz Reveal Invalid ${tag}`, "note");
    for (const bad of [
      {},
      { playerIds: [], entryIds: [e] },
      { playerIds: [p.id], entryIds: [] },
      { playerIds: ["x"], entryIds: [e] },
      { playerIds: [p.id], entryIds: ["not-a-uuid"] },
      { playerIds: [p.id], entryIds: Array.from({ length: 501 }, () => randomUUID()) },
      { playerIds: Array.from({ length: 101 }, () => randomUUID()), entryIds: [e] },
      { playerIds: p.id, entryIds: e },
    ]) {
      expect((await reveal(request, bad)).status(), JSON.stringify(bad).slice(0, 80)).toBe(400);
    }
    expect((await query(`SELECT 1 FROM entry_grants WHERE user_id = $1`, [p.id]))).toHaveLength(0);
  });

  test("the reveal form chooses players and entries, sends exactly those, and says what it skipped", async ({ page }) => {
    const p = await newPlayer();
    const open = await entry(`Zz Form Open ${tag}`, "note");
    const hidden = await entry(`Zz Form Hidden ${tag}`, "note", { visibility: "secret" });
    await page.goto("/planner");
    await expect(page.getByTestId("reveal")).toBeDisabled();

    await page.getByLabel(`Zz ${p.username.slice(-4)}`).check();
    for (const name of [`Zz Form Open ${tag}`, `Zz Form Hidden ${tag}`]) {
      await page.getByLabel("What they learned").fill(name);
      await page.getByRole("button", { name: new RegExp(name) }).first().click();
    }
    await expect(page.getByRole("list", { name: "Entries to reveal" }).getByRole("listitem")).toHaveCount(2);
    await page.getByTestId("reveal").click();
    await expect(page.getByTestId("reveal-result")).toContainText("Revealed 1 entry to 1 player");
    await expect(page.getByTestId("reveal-result")).toContainText("Still secret");
    const rows = await query<{ entry_id: string }>(`SELECT entry_id FROM entry_grants WHERE user_id = $1`, [p.id]);
    expect(rows.map((r) => r.entry_id)).toEqual([open]);
    expect(rows.some((r) => r.entry_id === hidden)).toBe(false);
  });
});

test.describe("what a player sees after a reveal", () => {
  async function revealVia(browser: Browser, playerId: string, entryIds: string[]) {
    const context = await browser.newContext({ storageState: "tests/.auth/dm.json" });
    try {
      const res = await context.request.post("/api/planner/reveal", { data: { playerIds: [playerId], entryIds } });
      expect(res.status()).toBe(200);
    } finally {
      await context.close();
    }
  }

  test("the entry opens at once (404 before, 200 after) and the front page lists it under New for you, newest first", async ({ browser }) => {
    const p = await newPlayer();
    const first = await entry(`Zz Learned First ${tag}`, "note");
    const second = await entry(`Zz Learned Second ${tag}`, "note");
    const { context, page } = await login(browser, p.username);
    try {
      expect((await page.goto(`/codex/entry/${slugOf(`Zz Learned First ${tag}`)}`))?.status()).toBe(404);
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "New for you" })).toHaveCount(0);

      await revealVia(browser, p.id, [first]);
      expect((await page.goto(`/codex/entry/${slugOf(`Zz Learned First ${tag}`)}`))?.status()).toBe(200);
      await revealVia(browser, p.id, [second]);

      await page.goto("/");
      const section = page.locator("section", { has: page.getByRole("heading", { name: "New for you" }) });
      const names = await section.getByRole("link").allTextContents();
      const joined = names.join(" | ");
      expect(joined.indexOf(`Zz Learned Second ${tag}`)).toBeGreaterThanOrEqual(0);
      expect(joined.indexOf(`Zz Learned Second ${tag}`)).toBeLessThan(joined.indexOf(`Zz Learned First ${tag}`));
    } finally {
      await context.close();
    }
  });

  test("a revealed page that is later hidden again or archived drops off the list", async ({ browser }) => {
    const p = await newPlayer();
    const a = await entry(`Zz Fade A ${tag}`, "note");
    const b = await entry(`Zz Fade B ${tag}`, "note");
    await revealVia(browser, p.id, [a, b]);
    const { context, page } = await login(browser, p.username);
    try {
      await page.goto("/");
      await expect(page.getByRole("link", { name: new RegExp(`Zz Fade A ${tag}`) }).first()).toBeVisible();
      await query(`UPDATE entries SET visibility = 'secret' WHERE id = $1`, [a]);
      await query(`UPDATE entries SET archived_at = now() WHERE id = $1`, [b]);
      await page.goto("/");
      expect(await page.content()).not.toContain(`Zz Fade A ${tag}`);
      expect(await page.content()).not.toContain(`Zz Fade B ${tag}`);
    } finally {
      await context.close();
    }
  });

  test("only the player who was chosen sees it, and the list is capped at 8", async ({ browser }) => {
    const chosen = await newPlayer();
    const other = await newPlayer();
    const many: string[] = [];
    for (let i = 0; i < 10; i++) many.push(await entry(`Zz Many ${i} ${tag}`, "note"));
    await revealVia(browser, chosen.id, many);

    const a = await login(browser, chosen.username);
    const b = await login(browser, other.username);
    try {
      await a.page.goto("/");
      const section = a.page.locator("section", { has: a.page.getByRole("heading", { name: "New for you" }) });
      expect(await section.getByRole("link", { name: new RegExp(`Zz Many \\d+ ${tag}`) }).count()).toBe(8);
      await b.page.goto("/");
      expect(await b.page.content()).not.toContain(`Zz Many`);
      expect((await b.page.goto(`/codex/entry/${slugOf(`Zz Many 0 ${tag}`)}`))?.status()).toBe(404);
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });

  test("the DM never gets a New for you list", async ({ browser }) => {
    const context = await browser.newContext({ storageState: "tests/.auth/dm.json" });
    const page = await context.newPage();
    try {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "New for you" })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});

test.describe("small screens", () => {
  test.use({ storageState: "tests/.auth/dm.json", viewport: { width: 375, height: 800 } });

  test("at 375px the planner has no horizontal page scroll", async ({ page }) => {
    await page.goto("/planner");
    await expect(page.getByRole("heading", { level: 1, name: "Planner" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
