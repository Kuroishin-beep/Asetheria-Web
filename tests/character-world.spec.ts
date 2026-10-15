import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { Client } from "pg";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { closeDbHelpers, createTestPlayer, deleteTestUser, query } from "./db-helpers";
import { tc } from "./case-id";

/**
 * Phase 19: characters linked to the world. A player can share a character with the party (a short, read-only
 * roster), keeps a private journal for it, and sets a home; citizenship, worship and home link to the codex pages
 * the viewer may read. Everything runs against the real app and the real (test) database.
 */

const ROOT = path.join(__dirname, "..");
const PASSWORD = "correct horse battery staple 42";
const tag = randomUUID().slice(0, 6);
const users: string[] = [];

const scores = (str: number, dex: number, con: number, int: number, wis: number, cha: number) => ({ str, dex, con, int, wis, cha });
const VALID = {
  schemaVersion: 1,
  name: "Zz Cw Hero",
  playerName: "Tester",
  concept: "A careful soldier",
  race: { raceId: "human" },
  classId: "fighter",
  level: 1,
  backgroundName: "Soldier",
  backgroundSkills: ["survival", "history"],
  classSkills: ["athletics", "perception"],
  method: "point-buy",
  pointBuy: { extraRoll: 1, scores: scores(15, 13, 14, 8, 12, 10) },
  hp: { mode: "rolled", levelRolls: [] },
  equipment: "Longsword, shield",
  citizenship: "imperium-invicta",
  worship: "",
  traits: "",
  ideals: "",
  bonds: "",
  flaws: "",
  appearance: "",
  backstory: "",
};

test.use({ storageState: "tests/.auth/dm.json" });

test.beforeEach(async () => {
  await query(`DELETE FROM entries WHERE slug LIKE 'zz-playwright-cw-%'`);
});
test.afterAll(async () => {
  await query(`DELETE FROM entries WHERE slug LIKE 'zz-playwright-cw-%'`);
  for (const id of users) await deleteTestUser(id);
  await closeDbHelpers();
});

type Pg = { id: string; name: string; slug: string };

async function makePage(label: string, kind = "location", visibility = "public", name?: string): Promise<Pg> {
  const slug = `zz-playwright-cw-${label}-${tag}`;
  const n = name ?? slug;
  const [row] = await query<{ id: string }>(`INSERT INTO entries (slug, kind, name, summary, visibility, source_path) VALUES ($1, $2::entry_kind, $3, $4, $5::visibility, 'test: character world') RETURNING id`, [slug, kind, n, `About ${label}`, visibility]);
  return { id: row.id, name: n, slug };
}

async function newPlayer(kinds: string[] = ["location", "empire", "deity"]) {
  const username = `zz-cw-${randomUUID().slice(0, 8)}`;
  const id = await createTestPlayer(username, PASSWORD);
  users.push(id);
  await query(`UPDATE users SET display_name = $2 WHERE id = $1`, [id, `Zz ${username.slice(-4)}`]);
  for (const k of kinds) await query(`INSERT INTO entry_grants (user_id, kind, granted) VALUES ($1, $2::entry_kind, true)`, [id, k]);
  return { id, username };
}

async function session(browser: Browser, username: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const res = await page.request.post("/api/auth/login", { data: { username, password: PASSWORD }, headers: { "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.5.${Math.floor(Math.random() * 250)}` } });
  expect(res.ok()).toBe(true);
  return { context, page };
}

/** A signed-in player with one saved character; returns what is needed to act as them. */
async function playerWithCharacter(browser: Browser, over: Record<string, unknown> = {}, kinds?: string[]) {
  const p = await newPlayer(kinds);
  const s = await session(browser, p.username);
  const res = await s.page.request.post("/api/characters", { data: { ...VALID, ...over } });
  expect(res.status(), await res.text()).toBe(201);
  const character = (await res.json()).character as { id: string; name: string };
  return { ...p, ...s, characterId: character.id, name: character.name };
}

const dbChar = async (id: string) => (await query<{ shared: boolean; home_entry_id: string | null; archived_at: Date | null }>(`SELECT shared, home_entry_id, archived_at FROM characters WHERE id = $1`, [id]))[0];
const journalOf = (id: string) => query<{ id: string; title: string; body: string }>(`SELECT id, title, body FROM character_journal WHERE character_id = $1 ORDER BY created_at, id`, [id]);

test.describe("migration", () => {
  test("[TC-CWLD-001] the new columns and the journal table hold their checks and cascades, and the migration is idempotent", async ({ browser }) => {
    const p = await playerWithCharacter(browser);
    const place = await makePage("mig");
    try {
      expect(await dbChar(p.characterId)).toMatchObject({ shared: false, home_entry_id: null });
      const add = (title: string, body: string) => query(`INSERT INTO character_journal (character_id, title, body) VALUES ($1, $2, $3)`, [p.characterId, title, body]);
      await add("t".repeat(120), "x".repeat(4000));
      await expect(add("t".repeat(121), "ok")).rejects.toThrow(/character_journal_title_length/);
      await expect(add("", "")).rejects.toThrow(/character_journal_body_length/);
      await expect(add("", "x".repeat(4001))).rejects.toThrow(/character_journal_body_length/);
      await query(`UPDATE characters SET home_entry_id = $2 WHERE id = $1`, [p.characterId, place.id]);
      await query(`DELETE FROM entries WHERE id = $1`, [place.id]);
      expect((await dbChar(p.characterId)).home_entry_id).toBeNull(); // the character stays, its home is cleared
      await query(`DELETE FROM characters WHERE id = $1`, [p.characterId]);
      expect(await journalOf(p.characterId)).toHaveLength(0); // the journal goes with its character
      const client = new Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      try {
        const sql = fs.readFileSync(path.join(ROOT, "scripts", "sql", "character-world.sql"), "utf8");
        await client.query(sql);
        await client.query(sql);
      } finally {
        await client.end();
      }
    } finally {
      await p.context.close();
    }
  });

  test("[TC-CWLD-002] the rollback drops the journal and the two columns and leaves characters, entries and users (run inside a transaction that is rolled back)", async () => {
    expect(process.env.DATABASE_URL ?? "").not.toMatch(/neon\.tech|neon\.build/);
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query("BEGIN");
      const count = async (t: string) => Number((await client.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n);
      const [chars, ents, usrs] = [await count("characters"), await count("entries"), await count("users")];
      await client.query(fs.readFileSync(path.join(ROOT, "scripts", "sql", "character-world-rollback.sql"), "utf8"));
      expect((await client.query(`SELECT to_regclass('character_journal')::text AS t`)).rows[0].t).toBeNull();
      expect((await client.query(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'characters' AND column_name IN ('shared', 'home_entry_id')`)).rows[0].n).toBe(0);
      expect([await count("characters"), await count("entries"), await count("users")]).toEqual([chars, ents, usrs]);
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
    expect((await query<{ t: string }>(`SELECT to_regclass('character_journal')::text AS t`))[0].t).toBe("character_journal");
  });
});

test.describe("sharing and home (the API)", () => {
  test("[TC-CWLD-003] the owner shares a character and takes it back; the roster follows", async ({ browser }) => {
    const p = await playerWithCharacter(browser, { name: `Zz Cw Share ${tag}` });
    try {
      const roster = async () => ((await (await p.page.request.get("/api/characters?scope=party")).json()).members as { name: string }[]).map((m) => m.name);
      expect(await roster()).not.toContain(p.name);
      expect((await p.page.request.patch(`/api/characters/${p.characterId}`, { data: { shared: true } })).status()).toBe(200);
      expect((await dbChar(p.characterId)).shared).toBe(true);
      expect(await roster()).toContain(p.name);
      expect((await p.page.request.patch(`/api/characters/${p.characterId}`, { data: { shared: false } })).status()).toBe(200);
      expect(await roster()).not.toContain(p.name);
    } finally {
      await p.context.close();
    }
  });

  test("[TC-CWLD-004] a bad change is refused with the reason: other keys, wrong types, an empty change, and nothing is changed", async ({ browser }) => {
    const p = await playerWithCharacter(browser);
    try {
      for (const bad of [{}, { shared: "yes" }, { shared: null }, { homeSlug: 5 }, { homeSlug: "" }, { name: "Renamed" }, { userId: randomUUID() }, { shared: true, extra: 1 }]) {
        const res = await p.page.request.patch(`/api/characters/${p.characterId}`, { data: bad });
        expect(res.status(), JSON.stringify(bad)).toBe(400);
        expect((await res.json()).problems.length).toBeGreaterThan(0);
      }
      const res = await p.page.request.patch(`/api/characters/${p.characterId}`, { data: "not json", headers: { "content-type": "text/plain" } });
      expect(res.status()).toBe(400);
      expect(await dbChar(p.characterId)).toMatchObject({ shared: false, home_entry_id: null });
    } finally {
      await p.context.close();
    }
  });

  test("[TC-CWLD-005] a character that is not yours is not found; so is a malformed id; signed out is 401; the DM may not change it (403)", async ({ browser, request }) => {
    const owner = await playerWithCharacter(browser);
    const other = await playerWithCharacter(browser);
    const anon = await browser.newContext({ storageState: undefined });
    try {
      expect((await other.page.request.patch(`/api/characters/${owner.characterId}`, { data: { shared: true } })).status()).toBe(404);
      expect((await other.page.request.patch(`/api/characters/not-a-uuid`, { data: { shared: true } })).status()).toBe(404);
      expect((await other.page.request.patch(`/api/characters/${randomUUID()}`, { data: { shared: true } })).status()).toBe(404);
      expect((await anon.request.patch(`/api/characters/${owner.characterId}`, { data: { shared: true } })).status()).toBe(401);
      expect((await request.patch(`/api/characters/${owner.characterId}`, { data: { shared: true } })).status()).toBe(403);
      expect((await dbChar(owner.characterId)).shared).toBe(false);
    } finally {
      await owner.context.close();
      await other.context.close();
      await anon.close();
    }
  });

  test("[TC-CWLD-006] a home must be a location page the owner can read: another kind, a secret place, a place the owner is denied, an archived or missing page are refused", async ({ browser }) => {
    const p = await playerWithCharacter(browser);
    const home = await makePage("home");
    const god = await makePage("god", "deity");
    const secret = await makePage("secretplace", "location", "secret");
    const denied = await makePage("denied");
    const archived = await makePage("archivedplace");
    await query(`INSERT INTO entry_grants (user_id, entry_id, granted) VALUES ($1, $2, false)`, [p.id, denied.id]);
    await query(`UPDATE entries SET archived_at = now() WHERE id = $1`, [archived.id]);
    try {
      const set = (slug: unknown) => p.page.request.patch(`/api/characters/${p.characterId}`, { data: { homeSlug: slug } });
      for (const bad of [god.slug, secret.slug, denied.slug, archived.slug, "zz-playwright-cw-does-not-exist"]) {
        const res = await set(bad);
        expect(res.status(), bad).toBe(400);
        expect((await res.json()).error).toMatch(/must be a place you can read/);
      }
      expect((await dbChar(p.characterId)).home_entry_id).toBeNull();
      expect((await set(home.slug)).status()).toBe(200);
      expect((await dbChar(p.characterId)).home_entry_id).toBe(home.id);
      expect((await set(null)).status()).toBe(200);
      expect((await dbChar(p.characterId)).home_entry_id).toBeNull();
    } finally {
      await p.context.close();
    }
  });

  test("[TC-CWLD-007] editing the character in the creator keeps its sharing and home", async ({ browser }) => {
    const p = await playerWithCharacter(browser);
    const home = await makePage("keep");
    try {
      await p.page.request.patch(`/api/characters/${p.characterId}`, { data: { shared: true, homeSlug: home.slug } });
      const res = await p.page.request.put(`/api/characters/${p.characterId}`, { data: { ...VALID, name: "Zz Cw Renamed", concept: "Changed" } });
      expect(res.status()).toBe(200);
      expect(await dbChar(p.characterId)).toMatchObject({ shared: true, home_entry_id: home.id });
    } finally {
      await p.context.close();
    }
  });
});

test.describe("the party roster", () => {
  test("[TC-CWLD-008] it shows only shared characters, and only name, heritage, class, level, citizenship and worship: no id, owner, scores, story or journal reaches the page or the API", async ({ browser }) => {
    const shared = await playerWithCharacter(browser, { name: `Zz Cw Shared ${tag}`, backstory: "ZZBACKSTORYSHARED", traits: "ZZTRAITSSHARED", worship: "" });
    const hidden = await playerWithCharacter(browser, { name: `Zz Cw Hidden ${tag}`, backstory: "ZZBACKSTORYHIDDEN" });
    const viewer = await playerWithCharacter(browser);
    try {
      await shared.page.request.patch(`/api/characters/${shared.characterId}`, { data: { shared: true } });
      await shared.page.request.post(`/api/characters/${shared.characterId}/journal`, { data: { body: "ZZJOURNALTEXT" } });
      await viewer.page.goto("/characters/party");
      await viewer.page.waitForLoadState("networkidle");
      const html = await viewer.page.content();
      expect(html).toContain(shared.name);
      for (const secret of [hidden.name, "ZZBACKSTORYSHARED", "ZZBACKSTORYHIDDEN", "ZZTRAITSSHARED", "ZZJOURNALTEXT", shared.characterId, hidden.characterId, shared.username]) expect(html, secret).not.toContain(secret);
      const api = await (await viewer.page.request.get("/api/characters?scope=party")).text();
      for (const secret of [hidden.name, "ZZBACKSTORYSHARED", "ZZJOURNALTEXT", shared.characterId, shared.id, shared.username, "baseScores", "backstory"]) expect(api, secret).not.toContain(secret);
      const member = (JSON.parse(api).members as Record<string, unknown>[]).find((m) => m.name === shared.name)!;
      expect(Object.keys(member).sort()).toEqual(["citizenship", "className", "heritage", "level", "name", "worship"]);
      expect(member).toMatchObject({ heritage: "Human", className: "Fighter", level: 1 });
    } finally {
      await shared.context.close();
      await hidden.context.close();
      await viewer.context.close();
    }
  });

  test("[TC-CWLD-009] a shared character's sheet is still the owner's and the DM's alone: others get 404 from the page and the API", async ({ browser }) => {
    const owner = await playerWithCharacter(browser);
    const other = await playerWithCharacter(browser);
    try {
      await owner.page.request.patch(`/api/characters/${owner.characterId}`, { data: { shared: true } });
      expect((await other.page.request.get(`/api/characters/${owner.characterId}`)).status()).toBe(404);
      expect((await other.page.goto(`/characters/${owner.characterId}`))?.status()).toBe(404);
      expect((await owner.page.request.get(`/api/characters/${owner.characterId}`)).status()).toBe(200);
    } finally {
      await owner.context.close();
      await other.context.close();
    }
  });

  test("[TC-CWLD-010] a deleted character leaves the roster; the newest change comes first", async ({ browser }) => {
    const a = await playerWithCharacter(browser, { name: `Zz Cw A ${tag}` });
    const b = await playerWithCharacter(browser, { name: `Zz Cw B ${tag}` });
    try {
      for (const c of [a, b]) await c.page.request.patch(`/api/characters/${c.characterId}`, { data: { shared: true } });
      await query(`UPDATE characters SET updated_at = now() + interval '1 hour' WHERE id = $1`, [a.characterId]);
      const names = async () => ((await (await a.page.request.get("/api/characters?scope=party")).json()).members as { name: string }[]).map((m) => m.name).filter((n) => n === a.name || n === b.name);
      expect(await names()).toEqual([a.name, b.name]);
      expect((await a.page.request.delete(`/api/characters/${a.characterId}`)).status()).toBe(200);
      expect(await names()).toEqual([b.name]);
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });

  test("[TC-CWLD-011] signed out the roster is 401 and the page sends you to sign in; the DM can read it, with an empty state that says what to do", async ({ browser, request, page }) => {
    const anon = await browser.newContext({ storageState: undefined });
    try {
      expect((await anon.request.get("/api/characters?scope=party")).status()).toBe(401);
      const gate = await anon.newPage();
      await gate.goto("/characters/party");
      await expect(gate).toHaveURL(/\/welcome/);
    } finally {
      await anon.close();
    }
    expect((await request.get("/api/characters?scope=party")).status()).toBe(200);
    await query(`UPDATE characters SET shared = false WHERE shared`);
    await page.goto("/characters/party");
    await expect(page.getByRole("heading", { level: 1, name: "The party" })).toBeVisible();
    await expect(page.getByText("No one has shared a character yet")).toBeVisible();
  });

  test("[TC-CWLD-012] the roster holds at most 100 characters: exactly 100 are all shown, the 101st is counted and said so", async ({ browser, page }) => {
    test.slow();
    const p = await playerWithCharacter(browser, { name: `Zz Cw Cap ${tag}` });
    try {
      await query(`UPDATE characters SET shared = false WHERE shared AND id <> $1`, [p.characterId]);
      await p.page.request.patch(`/api/characters/${p.characterId}`, { data: { shared: true } });
      const fill = (n: number) => query(`INSERT INTO characters (user_id, name, input, sheet, shared) SELECT user_id, 'Zz Cw Bulk ' || g, input, sheet, true FROM characters, generate_series(1, ${n}) g WHERE id = $1`, [p.characterId]);
      await fill(99);
      const get = async () => (await p.page.request.get("/api/characters?scope=party")).json();
      let data = await get();
      expect(data).toMatchObject({ total: 100, truncated: false });
      expect(data.members).toHaveLength(100);
      await page.goto("/characters/party");
      await expect(page.getByTestId("party-list").getByRole("listitem")).toHaveCount(100);
      await expect(page.getByTestId("party-truncated")).toHaveCount(0);
      await fill(1);
      data = await get();
      expect(data).toMatchObject({ total: 101, truncated: true });
      expect(data.members).toHaveLength(100);
      await page.reload();
      await expect(page.getByTestId("party-list").getByRole("listitem")).toHaveCount(100);
      await expect(page.getByTestId("party-truncated")).toHaveText("Showing the 100 most recently changed of 101 shared characters.");
    } finally {
      await query(`DELETE FROM characters WHERE name LIKE 'Zz Cw Bulk %'`);
      await p.context.close();
    }
  });
});

test.describe("links to codex pages", () => {
  test("[TC-CWLD-013] citizenship and worship link to the pages a viewer may read and are plain text otherwise, on the roster and on the sheet", async ({ browser, page }) => {
    test.slow();
    const zeus = await makePage("zeus", "deity", "public", `Zz Cw Zeus ${tag}`);
    const hera = await makePage("hera", "deity", "secret", `Zz Cw Hera ${tag}`);
    const owner = await playerWithCharacter(browser, { name: `Zz Cw Linked ${tag}`, worship: `${zeus.name} and ${hera.name}`, citizenship: "hellenoria" });
    const reader = await playerWithCharacter(browser);
    const noGrants = await playerWithCharacter(browser, {}, []);
    try {
      await owner.page.request.patch(`/api/characters/${owner.characterId}`, { data: { shared: true } });
      // A player who may read deities and empires: Zeus links, the secret Hera is plain, Hellenoria links.
      await reader.page.goto("/characters/party");
      const card = reader.page.getByRole("listitem").filter({ hasText: owner.name });
      await expect(card.getByRole("link", { name: zeus.name })).toHaveAttribute("href", `/codex/entry/${zeus.slug}`);
      await expect(card.getByRole("link", { name: "Hellenoria" })).toHaveAttribute("href", "/codex/entry/hellenoria");
      await expect(card.getByRole("link", { name: hera.name })).toHaveCount(0);
      await expect(card).toContainText(`${zeus.name} and ${hera.name}`);
      // A player who may read neither kind: both are plain text, still shown.
      await noGrants.page.goto("/characters/party");
      const plain = noGrants.page.getByRole("listitem").filter({ hasText: owner.name });
      await expect(plain.getByRole("link")).toHaveCount(0);
      await expect(plain).toContainText("Hellenoria");
      await expect(plain).toContainText(zeus.name);
      // The DM reads everything, so every name that exists links, including the secret god.
      await page.goto("/characters/party");
      const dm = page.getByRole("listitem").filter({ hasText: owner.name });
      await expect(dm.getByRole("link", { name: hera.name })).toHaveAttribute("href", `/codex/entry/${hera.slug}`);
      // And on the character's own sheet: its owner reads Zeus but not Hera, as above.
      await owner.page.goto(`/characters/${owner.characterId}`);
      const sheet = owner.page.getByTestId("character-sheet");
      await expect(sheet.getByRole("link", { name: "Hellenoria" })).toBeVisible();
      await expect(sheet.getByRole("link", { name: zeus.name })).toBeVisible();
      await expect(sheet.getByRole("link", { name: hera.name })).toHaveCount(0);
      await expect(sheet).toContainText(hera.name);
    } finally {
      for (const c of [owner, reader, noGrants]) await c.context.close();
    }
  });

  test("[TC-CWLD-014] a character with no worship says Unaffiliated and one with no citizenship says None, neither a link", async ({ browser }) => {
    const p = await playerWithCharacter(browser, { citizenship: "none", worship: "" });
    try {
      await p.page.request.patch(`/api/characters/${p.characterId}`, { data: { shared: true } });
      await p.page.goto("/characters/party");
      const card = p.page.getByRole("listitem").filter({ hasText: p.name });
      await expect(card).toContainText("None");
      await expect(card).toContainText("Unaffiliated");
      await expect(card.getByRole("link")).toHaveCount(0);
    } finally {
      await p.context.close();
    }
  });

  test("[TC-CWLD-015] home shows on the sheet as a link for its owner and the DM, and a place that later stops being readable shows nothing, not even its name", async ({ browser, page }) => {
    test.slow();
    const place = await makePage("homeplace", "location", "public", `Zz Cw Home ${tag}`);
    const p = await playerWithCharacter(browser);
    try {
      expect((await p.page.request.patch(`/api/characters/${p.characterId}`, { data: { homeSlug: place.slug } })).status()).toBe(200);
      await p.page.goto(`/characters/${p.characterId}`);
      await expect(p.page.getByTestId("character-sheet").getByRole("link", { name: place.name })).toHaveAttribute("href", `/codex/entry/${place.slug}`);
      await page.goto(`/characters/${p.characterId}`);
      await expect(page.getByTestId("character-sheet").getByRole("link", { name: place.name })).toBeVisible();
      // The DM hides the place afterwards: the owner no longer sees it, and nothing says it was ever there.
      await query(`UPDATE entries SET visibility = 'secret' WHERE id = $1`, [place.id]);
      await p.page.goto(`/characters/${p.characterId}`);
      expect(await p.page.content()).not.toContain(place.name);
      await expect(p.page.getByTestId("character-sheet").getByText("Home", { exact: true })).toHaveCount(0);
      await page.goto(`/characters/${p.characterId}`);
      await expect(page.getByTestId("character-sheet").getByRole("link", { name: place.name })).toBeVisible();
    } finally {
      await p.context.close();
    }
  });
});

test.describe("the journal (the API)", () => {
  test("[TC-CWLD-016] the owner adds, lists (newest first), edits and deletes entries; title and body are trimmed", async ({ browser }) => {
    const p = await playerWithCharacter(browser);
    try {
      const add = (data: unknown) => p.page.request.post(`/api/characters/${p.characterId}/journal`, { data });
      const first = await add({ title: "  Day one  ", body: "  We left the port.  " });
      expect(first.status()).toBe(201);
      const a = (await first.json()).entry as { id: string; title: string; body: string };
      expect(a).toMatchObject({ title: "Day one", body: "We left the port." });
      await query(`UPDATE character_journal SET created_at = created_at - interval '1 day' WHERE id = $1`, [a.id]);
      const second = (await (await add({ body: "A storm." })).json()).entry as { id: string };
      const list = (await (await p.page.request.get(`/api/characters/${p.characterId}/journal`)).json()).entries as { id: string; body: string }[];
      expect(list.map((e) => e.id)).toEqual([second.id, a.id]);
      const edit = await p.page.request.patch(`/api/characters/${p.characterId}/journal/${a.id}`, { data: { title: "", body: "We left the port at dawn." } });
      expect(edit.status()).toBe(200);
      expect((await journalOf(p.characterId)).find((e) => e.id === a.id)).toMatchObject({ title: "", body: "We left the port at dawn." });
      expect((await p.page.request.delete(`/api/characters/${p.characterId}/journal/${a.id}`)).status()).toBe(200);
      expect((await p.page.request.delete(`/api/characters/${p.characterId}/journal/${a.id}`)).status()).toBe(404);
      expect(await journalOf(p.characterId)).toHaveLength(1);
    } finally {
      await p.context.close();
    }
  });

  test("[TC-CWLD-017] an entry that cannot be saved is refused with the reason: empty, blank, over 4,000 characters, a title over 120, wrong types, extra keys", async ({ browser }) => {
    const p = await playerWithCharacter(browser);
    try {
      const add = (data: unknown) => p.page.request.post(`/api/characters/${p.characterId}/journal`, { data });
      expect((await add({ body: "x".repeat(4000) })).status()).toBe(201);
      expect((await add({ title: "t".repeat(120), body: "ok" })).status()).toBe(201);
      for (const bad of [{ body: "" }, { body: "   " }, { body: "x".repeat(4001) }, { title: "t".repeat(121), body: "ok" }, { title: 5, body: "ok" }, { body: 5 }, { title: "only" }, { body: "ok", extra: 1 }, []]) {
        const res = await add(bad);
        expect(res.status(), JSON.stringify(bad).slice(0, 40)).toBe(400);
        expect((await res.json()).problems.length).toBeGreaterThan(0);
      }
      expect((await add("not json")).status()).toBe(400);
      expect(await journalOf(p.characterId)).toHaveLength(2);
      // The same checks apply when changing an entry.
      const id = (await journalOf(p.characterId))[0].id;
      expect((await p.page.request.patch(`/api/characters/${p.characterId}/journal/${id}`, { data: { body: "x".repeat(4001) } })).status()).toBe(400);
      expect((await p.page.request.patch(`/api/characters/${p.characterId}/journal/${id}`, { data: { body: "" } })).status()).toBe(400);
    } finally {
      await p.context.close();
    }
  });

  test("[TC-CWLD-018] a journal holds at most 200 entries: the 200th is accepted and the 201st refused; deleting one makes room", async ({ browser }) => {
    test.slow();
    const p = await playerWithCharacter(browser);
    try {
      await query(`INSERT INTO character_journal (character_id, body) SELECT $1, 'entry ' || g FROM generate_series(1, 199) g`, [p.characterId]);
      const add = (body: string) => p.page.request.post(`/api/characters/${p.characterId}/journal`, { data: { body } });
      expect((await add("the 200th")).status()).toBe(201);
      const over = await add("the 201st");
      expect(over.status()).toBe(409);
      expect((await over.json()).error).toMatch(/at most 200 entries/);
      expect(await journalOf(p.characterId)).toHaveLength(200);
      const id = (await journalOf(p.characterId))[0].id;
      expect((await p.page.request.delete(`/api/characters/${p.characterId}/journal/${id}`)).status()).toBe(200);
      expect((await add("room again")).status()).toBe(201);
    } finally {
      await p.context.close();
    }
  });

  test("[TC-CWLD-019] only the player writes and only the player and the DM read: others get 404, signed out 401, the DM reads but writes nothing (403)", async ({ browser, request }) => {
    const owner = await playerWithCharacter(browser);
    const other = await playerWithCharacter(browser);
    const anon = await browser.newContext({ storageState: undefined });
    try {
      const made = (await (await owner.page.request.post(`/api/characters/${owner.characterId}/journal`, { data: { body: "ZZPRIVATEJOURNAL" } })).json()).entry as { id: string };
      const base = `/api/characters/${owner.characterId}/journal`;
      expect((await other.page.request.get(base)).status()).toBe(404);
      expect((await other.page.request.post(base, { data: { body: "intruder" } })).status()).toBe(404);
      expect((await other.page.request.patch(`${base}/${made.id}`, { data: { body: "intruder" } })).status()).toBe(404);
      expect((await other.page.request.delete(`${base}/${made.id}`)).status()).toBe(404);
      expect((await anon.request.get(base)).status()).toBe(401);
      expect((await anon.request.post(base, { data: { body: "x" } })).status()).toBe(401);
      const dm = await request.get(base);
      expect(dm.status()).toBe(200);
      expect(await dm.text()).toContain("ZZPRIVATEJOURNAL");
      expect((await request.post(base, { data: { body: "dm writes" } })).status()).toBe(403);
      expect((await request.patch(`${base}/${made.id}`, { data: { body: "dm edits" } })).status()).toBe(403);
      expect((await request.delete(`${base}/${made.id}`)).status()).toBe(403);
      expect(await journalOf(owner.characterId)).toEqual([expect.objectContaining({ body: "ZZPRIVATEJOURNAL" })]);
    } finally {
      await owner.context.close();
      await other.context.close();
      await anon.close();
    }
  });

  test("[TC-CWLD-020] an entry cannot be reached through another character's address, and malformed or unknown ids are not found", async ({ browser }) => {
    const a = await playerWithCharacter(browser);
    const b = await playerWithCharacter(browser);
    try {
      const made = (await (await a.page.request.post(`/api/characters/${a.characterId}/journal`, { data: { body: "mine" } })).json()).entry as { id: string };
      await b.page.request.post(`/api/characters/${b.characterId}/journal`, { data: { body: "theirs" } });
      expect((await b.page.request.patch(`/api/characters/${b.characterId}/journal/${made.id}`, { data: { body: "swapped" } })).status()).toBe(404);
      expect((await b.page.request.delete(`/api/characters/${b.characterId}/journal/${made.id}`)).status()).toBe(404);
      expect((await journalOf(a.characterId))[0].body).toBe("mine");
      for (const url of [`/api/characters/not-a-uuid/journal`, `/api/characters/${randomUUID()}/journal`]) {
        expect((await a.page.request.get(url)).status(), url).toBe(404);
      }
      expect((await a.page.request.patch(`/api/characters/${a.characterId}/journal/not-a-uuid`, { data: { body: "x" } })).status()).toBe(404);
      expect((await a.page.request.delete(`/api/characters/${a.characterId}/journal/not-a-uuid`)).status()).toBe(404);
      expect((await a.page.request.patch(`/api/characters/${a.characterId}/journal/${randomUUID()}`, { data: { body: "x" } })).status()).toBe(404);
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });

  test("[TC-CWLD-021] a deleted character's journal is no longer reachable", async ({ browser }) => {
    const p = await playerWithCharacter(browser);
    try {
      await p.page.request.post(`/api/characters/${p.characterId}/journal`, { data: { body: "gone soon" } });
      expect((await p.page.request.delete(`/api/characters/${p.characterId}`)).status()).toBe(200);
      expect((await p.page.request.get(`/api/characters/${p.characterId}/journal`)).status()).toBe(404);
      expect((await p.page.request.post(`/api/characters/${p.characterId}/journal`, { data: { body: "x" } })).status()).toBe(404);
    } finally {
      await p.context.close();
    }
  });
});

test.describe("on the character page", () => {
  test("[TC-CWLD-022] the owner shares with a switch, picks a home from a search of places and clears it, and the sheet follows", async ({ browser }) => {
    test.slow();
    const place = await makePage("pick", "location", "public", `Zz Cw Pickable ${tag}`);
    await makePage("notaplace", "deity", "public", `Zz Cw Pickable God ${tag}`);
    const p = await playerWithCharacter(browser);
    try {
      await p.page.goto(`/characters/${p.characterId}`);
      await p.page.waitForLoadState("networkidle");
      const panel = p.page.getByTestId("world-panel");
      const share = panel.getByRole("switch", { name: "Share with the party" });
      await expect(share).not.toBeChecked();
      await share.click();
      await expect(share).toBeChecked();
      await expect.poll(async () => (await dbChar(p.characterId)).shared).toBe(true);
      await panel.getByLabel("Home").fill("Zz Cw Pickable");
      const results = panel.getByRole("list", { name: "Matching places" });
      await expect(results.getByRole("button", { name: place.name })).toBeVisible();
      await expect(results.getByRole("button", { name: `Zz Cw Pickable God ${tag}` })).toHaveCount(0); // only locations are offered
      await results.getByRole("button", { name: place.name }).click();
      await expect(p.page.getByTestId("home-current")).toContainText(place.name);
      await expect(p.page.getByTestId("character-sheet").getByRole("link", { name: place.name })).toBeVisible();
      await p.page.getByRole("button", { name: "Clear home" }).click();
      await expect(p.page.getByTestId("home-current")).toHaveCount(0);
      expect((await dbChar(p.characterId)).home_entry_id).toBeNull();
      await share.click();
      await expect.poll(async () => (await dbChar(p.characterId)).shared).toBe(false);
    } finally {
      await p.context.close();
    }
  });

  test("[TC-CWLD-023] the journal can be written, edited and deleted from the page, with a confirmation before deleting; an empty journal says what to do", async ({ browser }) => {
    test.slow();
    const p = await playerWithCharacter(browser);
    try {
      await p.page.goto(`/characters/${p.characterId}`);
      await p.page.waitForLoadState("networkidle");
      const journal = p.page.getByTestId("journal");
      await expect(journal.getByTestId("journal-empty")).toContainText("Your journal is empty");
      await expect(journal.getByTestId("journal-add")).toBeDisabled();
      await journal.getByLabel("Title (optional)").fill("The crossing");
      await journal.getByLabel("What happened").fill("We crossed the river at night.");
      await expect(journal.getByText("30 / 4000")).toBeVisible();
      await journal.getByTestId("journal-add").click();
      const entry = journal.getByTestId("journal-entries").getByRole("listitem").first();
      await expect(entry).toContainText("We crossed the river at night.");
      await expect(entry.getByRole("heading", { name: "The crossing" })).toBeVisible();
      expect((await journalOf(p.characterId))[0]).toMatchObject({ title: "The crossing", body: "We crossed the river at night." });
      await entry.getByRole("button", { name: /^Edit the entry/ }).click();
      await entry.getByLabel("What happened").fill("We crossed the river at dusk.");
      await entry.getByTestId("journal-save").click();
      await expect(entry.getByTestId("journal-save")).toHaveCount(0); // the form closes once the change is saved
      await expect(entry).toContainText("at dusk");
      expect((await journalOf(p.characterId))[0].body).toBe("We crossed the river at dusk.");
      await entry.getByRole("button", { name: /^Delete the entry/ }).click();
      await p.page.getByRole("button", { name: "Keep it" }).click(); // asked first: cancelling keeps it
      expect(await journalOf(p.characterId)).toHaveLength(1);
      await entry.getByRole("button", { name: /^Delete the entry/ }).click();
      await p.page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
      await expect(journal.getByTestId("journal-empty")).toBeVisible();
      expect(await journalOf(p.characterId)).toHaveLength(0);
    } finally {
      await p.context.close();
    }
  });

  test("[TC-CWLD-024] text is shown as typed, never as markup, and a refused entry shows its reason", async ({ browser }) => {
    test.slow();
    const p = await playerWithCharacter(browser);
    try {
      await p.page.request.post(`/api/characters/${p.characterId}/journal`, { data: { title: "<b>bold</b>", body: "<script>window.__cw = 1</script> & <img src=x onerror=\"window.__cw = 2\">" } });
      await p.page.goto(`/characters/${p.characterId}`);
      const entry = p.page.getByTestId("journal-entries").getByRole("listitem").first();
      await expect(entry).toContainText("<script>window.__cw = 1</script> &");
      await expect(entry).toContainText("<b>bold</b>");
      expect(await p.page.evaluate(() => (window as unknown as { __cw?: number }).__cw)).toBeUndefined();
      await p.page.waitForLoadState("networkidle");
      await p.page.getByTestId("journal").getByLabel("What happened").fill("x".repeat(4000));
      await expect(p.page.getByTestId("journal").getByText("4000 / 4000")).toBeVisible();
    } finally {
      await p.context.close();
    }
  });

  test("[TC-CWLD-025] the DM sees the journal and the links but no form, no sharing switch and no way to change anything", async ({ browser, page }) => {
    test.slow();
    const p = await playerWithCharacter(browser);
    try {
      await p.page.request.post(`/api/characters/${p.characterId}/journal`, { data: { title: "For the DM", body: "Read by the keeper." } });
      await page.goto(`/characters/${p.characterId}`);
      const journal = page.getByTestId("journal");
      await expect(journal).toContainText("Read by the keeper.");
      await expect(journal).toContainText("Private to this character's player and you.");
      await expect(journal.getByRole("button", { name: /Add entry|Edit the entry|Delete the entry/ })).toHaveCount(0);
      await expect(journal.getByLabel("What happened")).toHaveCount(0);
      await expect(page.getByTestId("world-panel")).toHaveCount(0);
      await expect(page.getByTestId("character-sheet").getByRole("link", { name: "Imperium Invicta" })).toBeVisible();
    } finally {
      await p.context.close();
    }
  });

  test("[TC-CWLD-026] another player gets a not-found page for the sheet, whether or not it is shared", async ({ browser }) => {
    const owner = await playerWithCharacter(browser);
    const other = await playerWithCharacter(browser);
    try {
      const res = await other.page.goto(`/characters/${owner.characterId}`);
      expect(res?.status()).toBe(404);
      expect(await other.page.content()).not.toContain(owner.name);
    } finally {
      await owner.context.close();
      await other.context.close();
    }
  });

  test("[TC-CWLD-027] printing leaves out the sharing panel and the journal and keeps the sheet", async ({ browser }) => {
    const p = await playerWithCharacter(browser);
    try {
      await p.page.request.post(`/api/characters/${p.characterId}/journal`, { data: { body: "Not for the paper." } });
      await p.page.goto(`/characters/${p.characterId}`);
      await expect(p.page.getByTestId("journal")).toBeVisible();
      await p.page.emulateMedia({ media: "print" });
      await expect(p.page.getByTestId("character-sheet")).toBeVisible();
      await expect(p.page.getByTestId("journal")).toBeHidden();
      await expect(p.page.getByTestId("world-panel")).toBeHidden();
    } finally {
      await p.context.close();
    }
  });

  test("[TC-CWLD-028] the sidebar has a Party link for everyone that is current on the party page, while Characters is not", async ({ browser, page }) => {
    const p = await playerWithCharacter(browser);
    try {
      for (const pg of [p.page, page]) {
        await pg.goto("/characters/party");
        await expect(pg.getByRole("link", { name: "Party", exact: true }).first()).toHaveAttribute("aria-current", "page");
        await expect(pg.getByRole("link", { name: "Characters", exact: true }).first()).not.toHaveAttribute("aria-current", "page");
      }
      await p.page.goto("/characters");
      await expect(p.page.getByRole("link", { name: "Characters", exact: true }).first()).toHaveAttribute("aria-current", "page");
    } finally {
      await p.context.close();
    }
  });
});

test.describe("accessibility and small screens", () => {
  for (const theme of ["dark", "light"] as const) {
    test(tc("character-world.spec.ts", "accessibility and small screens", `the character page (with sharing panel and journal) and the party page have no serious axe violations (${theme})`), async ({ browser }) => {
      test.slow();
      const p = await playerWithCharacter(browser, { name: `Zz Cw Axe ${theme} ${tag}`, worship: "Nobody in particular" });
      try {
        await p.page.addInitScript((t) => localStorage.setItem("asetheria-theme", t), theme);
        await p.page.request.patch(`/api/characters/${p.characterId}`, { data: { shared: true } });
        await p.page.request.post(`/api/characters/${p.characterId}/journal`, { data: { title: "An entry", body: "Something happened." } });
        for (const url of [`/characters/${p.characterId}`, "/characters/party"]) {
          await p.page.goto(url);
          await p.page.waitForLoadState("networkidle");
          await p.page.waitForTimeout(400);
          const results = await new AxeBuilder({ page: p.page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
          expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help} -> ${v.nodes[0]?.target.join(" ")}`), url).toEqual([]);
        }
      } finally {
        await p.context.close();
      }
    });
  }

  test("[TC-CWLD-031] at 375px the character page and the party page do not scroll the page sideways", async ({ browser }) => {
    test.slow();
    const p = await newPlayer();
    const context = await browser.newContext({ viewport: { width: 375, height: 800 } });
    const page = await context.newPage();
    try {
      expect((await page.request.post("/api/auth/login", { data: { username: p.username, password: PASSWORD }, headers: { "x-forwarded-for": "10.9.9.9" } })).ok()).toBe(true);
      const made = await page.request.post("/api/characters", { data: { ...VALID, name: "Zz Cw A Rather Long Character Name To Wrap On A Small Screen", worship: "A very long worship line that should wrap across several lines on a small screen" } });
      const id = (await made.json()).character.id as string;
      await page.request.patch(`/api/characters/${id}`, { data: { shared: true } });
      await page.request.post(`/api/characters/${id}/journal`, { data: { title: "A fairly long title for a journal entry that must wrap", body: "A".repeat(300) } });
      for (const url of [`/characters/${id}`, "/characters/party"]) {
        await page.goto(url);
        await page.waitForLoadState("networkidle");
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), url).toBeLessThanOrEqual(0);
      }
    } finally {
      await context.close();
    }
  });
});
