import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { validateAndDerive, type CharacterInput } from "../src/lib/character/engine";
import { closeDbHelpers, createTestPlayer, deleteTestUser, query } from "./db-helpers";

/**
 * Phase 10: saved characters. The server never trusts the browser: it re-checks
 * every house rule, recomputes every number, keeps each player's characters
 * private, and lets the DM read but not write.
 */

const ROOT = path.join(__dirname, "..");
const PASSWORD = "correct horse battery staple 42";
const users: string[] = [];

const scores = (str: number, dex: number, con: number, int: number, wis: number, cha: number) => ({ str, dex, con, int, wis, cha });

const VALID: CharacterInput = {
  schemaVersion: 1,
  name: "Zz Test Hero",
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
const withName = (name: string): CharacterInput => ({ ...VALID, name });

async function newPlayer() {
  const username = `zz-ch-${randomUUID().slice(0, 8)}`;
  const id = await createTestPlayer(username, PASSWORD);
  users.push(id);
  await query(`UPDATE users SET display_name = $2 WHERE id = $1`, [id, `Zz ${username.slice(-4)}`]);
  return { id, username };
}

async function session(browser: Browser, username: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  expect((await page.request.post("/api/auth/login", { data: { username, password: PASSWORD } })).ok()).toBe(true);
  return { context, page };
}

test.afterAll(async () => {
  for (const id of users) await deleteTestUser(id);
  await closeDbHelpers();
});

test.describe("migration", () => {
  test("the table exists with a name-length check, a cascade, and the migration is idempotent", async () => {
    expect((await query<{ t: string }>(`SELECT to_regclass('characters')::text AS t`))[0].t).toBe("characters");
    const p = await newPlayer();
    await expect(query(`INSERT INTO characters (user_id, name, input, sheet) VALUES ($1, '', '{}', '{}')`, [p.id])).rejects.toThrow(/characters_name_length/);
    await expect(query(`INSERT INTO characters (user_id, name, input, sheet) VALUES ($1, $2, '{}', '{}')`, [p.id, "x".repeat(81)])).rejects.toThrow(/characters_name_length/);
    await query(`INSERT INTO characters (user_id, name, input, sheet) VALUES ($1, 'ok', '{}', '{}')`, [p.id]);
    await deleteTestUser(p.id);
    users.splice(users.indexOf(p.id), 1);
    expect((await query(`SELECT 1 FROM characters WHERE user_id = $1`, [p.id])).length).toBe(0);

    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      const sql = fs.readFileSync(path.join(ROOT, "scripts", "sql", "characters.sql"), "utf8");
      await client.query(sql);
      await client.query(sql);
    } finally {
      await client.end();
    }
  });

  test("the rollback drops only the characters table (run inside a transaction that is rolled back)", async () => {
    expect(process.env.DATABASE_URL ?? "").not.toMatch(/neon\.tech|neon\.build/);
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query("BEGIN");
      const entries = Number((await client.query(`SELECT count(*)::int AS n FROM entries`)).rows[0].n);
      const users = Number((await client.query(`SELECT count(*)::int AS n FROM users`)).rows[0].n);
      await client.query(fs.readFileSync(path.join(ROOT, "scripts", "sql", "characters-rollback.sql"), "utf8"));
      expect((await client.query(`SELECT to_regclass('characters')::text AS t`)).rows[0].t).toBeNull();
      expect(Number((await client.query(`SELECT count(*)::int AS n FROM entries`)).rows[0].n)).toBe(entries);
      expect(Number((await client.query(`SELECT count(*)::int AS n FROM users`)).rows[0].n)).toBe(users);
      expect((await client.query(`SELECT to_regclass('maps')::text AS t`)).rows[0].t).toBe("maps");
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
    expect((await query<{ t: string }>(`SELECT to_regclass('characters')::text AS t`))[0].t).toBe("characters");
  });
});

test.describe("a player's own characters", () => {
  test("saving stores the server's own computation, not anything the browser claims", async ({ browser }) => {
    const p = await newPlayer();
    const { context, page } = await session(browser, p.username);
    try {
      const res = await page.request.post("/api/characters", { data: VALID });
      expect(res.status()).toBe(201);
      const { character } = (await res.json()) as { character: { id: string; sheet: { hitPoints: number; armorClass: number; passivePerception: number } } };
      expect(character.sheet).toMatchObject({ hitPoints: 12, armorClass: 12, passivePerception: 13 });

      const [row] = await query<{ user_id: string; name: string; input: CharacterInput; sheet: unknown; archived_at: string | null }>(
        `SELECT user_id, name, input, sheet, archived_at FROM characters WHERE id = $1`,
        [character.id],
      );
      expect(row.user_id).toBe(p.id);
      expect(row.name).toBe("Zz Test Hero");
      expect(row.input).toEqual(VALID);
      expect(row.sheet).toEqual(validateAndDerive(VALID).sheet);
      expect(row.archived_at).toBeNull();
    } finally {
      await context.close();
    }
  });

  test("a client-supplied sheet, owner, id or any unknown key is rejected, and nothing is stored", async ({ browser }) => {
    const p = await newPlayer();
    const { context, page } = await session(browser, p.username);
    try {
      for (const extra of [{ sheet: { hitPoints: 999 } }, { userId: randomUUID() }, { id: randomUUID() }, { isAdmin: true }]) {
        const res = await page.request.post("/api/characters", { data: { ...VALID, ...extra } });
        expect(res.status(), JSON.stringify(extra)).toBe(400);
      }
      expect((await query(`SELECT 1 FROM characters WHERE user_id = $1`, [p.id])).length).toBe(0);
    } finally {
      await context.close();
    }
  });

  test("every house rule is enforced on the server: each tampered character is refused with its reasons", async ({ browser }) => {
    const p = await newPlayer();
    const { context, page } = await session(browser, p.username);
    try {
      const bad: [string, Record<string, unknown>][] = [
        ["point buy over budget", { pointBuy: { extraRoll: 1, scores: scores(15, 15, 15, 15, 15, 15) } }],
        ["a bonus die of 9", { pointBuy: { extraRoll: 9, scores: scores(8, 8, 8, 8, 8, 8) } }],
        ["a score of 16 before bonuses", { pointBuy: { extraRoll: 4, scores: scores(16, 8, 8, 8, 8, 8) } }],
        ["a score of 5 before bonuses", { pointBuy: { extraRoll: 4, scores: scores(5, 8, 8, 8, 8, 8) } }],
        ["a standard array with a reused value", { method: "standard-array", array: { index: 0, assignment: scores(15, 15, 13, 12, 10, 8) } }],
        ["a standard array index that does not exist", { method: "standard-array", array: { index: 7, assignment: scores(15, 14, 13, 12, 10, 8) } }],
        ["rolled scores that were never rolled", { method: "roll", roll: { sets: [{ dice: [], scores: [], total: 0 }], assignment: scores(18, 18, 18, 18, 18, 18) } }],
        ["level 21", { level: 21 }],
        ["a class that does not exist", { classId: "necromancer-supreme" }],
        ["a skill that repeats", { classSkills: ["athletics", "athletics"] }],
        ["manual hit points above the ceiling", { hp: { mode: "manual", total: 500 } }],
        ["rolled hit points for the wrong level", { level: 6, hp: { mode: "rolled", levelRolls: [{ first: 4 }] } }],
        ["an empire that does not exist", { citizenship: "atlantis" }],
        ["schema version 2", { schemaVersion: 2 }],
        ["a number where text belongs", { name: 42 }],
      ];
      for (const [label, patch] of bad) {
        const res = await page.request.post("/api/characters", { data: { ...VALID, ...patch } });
        expect(res.status(), label).toBe(400);
        const body = (await res.json()) as { error: string; problems: string[] };
        expect(body.problems.length, label).toBeGreaterThan(0);
      }
      expect((await page.request.post("/api/characters", { data: "{not json", headers: { "content-type": "application/json" } })).status()).toBe(400);
      expect((await page.request.post("/api/characters", { data: { schemaVersion: 1, junk: "x".repeat(70_000) } })).status()).toBe(413);
      expect((await query(`SELECT 1 FROM characters WHERE user_id = $1`, [p.id])).length).toBe(0);
    } finally {
      await context.close();
    }
  });

  test("a rolled character with a binding lower reroll is accepted; going back to the discarded set is not", async ({ browser }) => {
    const { rollSet } = await import("../src/lib/character/engine");
    const p = await newPlayer();
    const { context, page } = await session(browser, p.username);
    try {
      let high = rollSet();
      while (high.total < 72) high = rollSet();
      let lower = rollSet();
      while (lower.total >= 72) lower = rollSet();
      const asScores = (values: number[]) => scores(values[0], values[1], values[2], values[3], values[4], values[5]);
      const roll = { ...VALID, method: "roll" as const, pointBuy: undefined };
      const ok = await page.request.post("/api/characters", { data: { ...roll, roll: { sets: [high, lower], assignment: asScores(lower.scores) } } });
      expect(ok.status()).toBe(201);
      const cheat = await page.request.post("/api/characters", { data: { ...roll, roll: { sets: [high, lower], assignment: asScores(high.scores) } } });
      expect(cheat.status()).toBe(400);
    } finally {
      await context.close();
    }
  });

  test("a player lists, opens, updates and deletes their own character", async ({ browser }) => {
    const p = await newPlayer();
    const { context, page } = await session(browser, p.username);
    try {
      const a = ((await (await page.request.post("/api/characters", { data: withName("Zz Alpha") })).json()) as { character: { id: string } }).character;
      await page.request.post("/api/characters", { data: withName("Zz Beta") });

      const list = (await (await page.request.get("/api/characters")).json()) as { characters: { id: string; name: string }[] };
      expect(list.characters.map((c) => c.name).sort()).toEqual(["Zz Alpha", "Zz Beta"]);

      const got = await page.request.get(`/api/characters/${a.id}`);
      expect(got.status()).toBe(200);

      const before = (await query<{ updated_at: Date }>(`SELECT updated_at FROM characters WHERE id = $1`, [a.id]))[0].updated_at;
      await new Promise((r) => setTimeout(r, 20));
      const put = await page.request.put(`/api/characters/${a.id}`, { data: { ...withName("Zz Alpha Renamed"), level: 2, hp: { mode: "rolled", levelRolls: [] } } });
      expect(put.status()).toBe(200);
      const [row] = await query<{ name: string; sheet: { level: number; name: string; hitPoints: number }; updated_at: Date }>(`SELECT name, sheet, updated_at FROM characters WHERE id = $1`, [a.id]);
      expect(row.name).toBe("Zz Alpha Renamed");
      expect(row.sheet).toMatchObject({ level: 2, name: "Zz Alpha Renamed", hitPoints: 24 });
      expect(row.updated_at.getTime()).toBeGreaterThan(before.getTime());

      expect((await page.request.delete(`/api/characters/${a.id}`)).status()).toBe(200);
      expect((await page.request.get(`/api/characters/${a.id}`)).status()).toBe(404);
      expect((await page.request.delete(`/api/characters/${a.id}`)).status()).toBe(404);
      const [soft] = await query<{ archived_at: Date | null }>(`SELECT archived_at FROM characters WHERE id = $1`, [a.id]);
      expect(soft.archived_at).not.toBeNull();
      const after = (await (await page.request.get("/api/characters")).json()) as { characters: { name: string }[] };
      expect(after.characters.map((c) => c.name)).toEqual(["Zz Beta"]);
    } finally {
      await context.close();
    }
  });

  test("two saves of the same character at once leave one whole result, never a mix", async ({ browser }) => {
    const p = await newPlayer();
    const { context, page } = await session(browser, p.username);
    try {
      const id = ((await (await page.request.post("/api/characters", { data: VALID })).json()) as { character: { id: string } }).character.id;
      const [r1, r2] = await Promise.all([
        page.request.put(`/api/characters/${id}`, { data: { ...VALID, name: "Zz One", classId: "wizard", classSkills: ["arcana", "history"], backgroundSkills: ["survival", "stealth"] } }),
        page.request.put(`/api/characters/${id}`, { data: { ...VALID, name: "Zz Two" } }),
      ]);
      expect([r1.status(), r2.status()]).toEqual([200, 200]);
      const [row] = await query<{ name: string; input: CharacterInput; sheet: { name: string; className: string } }>(`SELECT name, input, sheet FROM characters WHERE id = $1`, [id]);
      expect(row.input.name).toBe(row.name);
      expect(row.sheet.name).toBe(row.name);
      expect(row.sheet.className).toBe(row.input.classId === "wizard" ? "Wizard" : "Fighter");
    } finally {
      await context.close();
    }
  });

  test("the 21st character is refused, and deleting one frees a slot", async ({ browser }) => {
    const p = await newPlayer();
    const { context, page } = await session(browser, p.username);
    try {
      const ids: string[] = [];
      for (let i = 1; i <= 20; i++) {
        const res = await page.request.post("/api/characters", { data: withName(`Zz Many ${i}`) });
        expect(res.status(), `character ${i}`).toBe(201);
        ids.push(((await res.json()) as { character: { id: string } }).character.id);
      }
      const over = await page.request.post("/api/characters", { data: withName("Zz Many 21") });
      expect(over.status()).toBe(409);
      expect((await page.request.delete(`/api/characters/${ids[0]}`)).status()).toBe(200);
      expect((await page.request.post("/api/characters", { data: withName("Zz Many 21") })).status()).toBe(201);
    } finally {
      await context.close();
    }
  });
});

test.describe("who can see what", () => {
  test("another player's character is 'not found' in every way, and a malformed id is too", async ({ browser }) => {
    const a = await newPlayer();
    const b = await newPlayer();
    const A = await session(browser, a.username);
    const B = await session(browser, b.username);
    try {
      const id = ((await (await A.page.request.post("/api/characters", { data: VALID })).json()) as { character: { id: string } }).character.id;
      expect((await B.page.request.get(`/api/characters/${id}`)).status()).toBe(404);
      expect((await B.page.request.put(`/api/characters/${id}`, { data: withName("Zz Hijack") })).status()).toBe(404);
      expect((await B.page.request.delete(`/api/characters/${id}`)).status()).toBe(404);
      const bList = (await (await B.page.request.get("/api/characters")).json()) as { characters: unknown[] };
      expect(bList.characters).toEqual([]);
      expect((await B.page.request.get("/api/characters/not-a-uuid")).status()).toBe(404);
      const [row] = await query<{ name: string; archived_at: Date | null }>(`SELECT name, archived_at FROM characters WHERE id = $1`, [id]);
      expect(row).toMatchObject({ name: "Zz Test Hero", archived_at: null });
    } finally {
      await A.context.close();
      await B.context.close();
    }
  });

  test("signed-out callers get 401", async ({ request }) => {
    const headers = { cookie: "" };
    expect((await request.get("/api/characters", { headers })).status()).toBe(401);
    expect((await request.post("/api/characters", { headers, data: VALID })).status()).toBe(401);
    expect((await request.get(`/api/characters/${randomUUID()}`, { headers })).status()).toBe(401);
    expect((await request.put(`/api/characters/${randomUUID()}`, { headers, data: VALID })).status()).toBe(401);
    expect((await request.delete(`/api/characters/${randomUUID()}`, { headers })).status()).toBe(401);
  });

  test("a player cannot ask for everyone's characters", async ({ browser }) => {
    const p = await newPlayer();
    const { context, page } = await session(browser, p.username);
    try {
      expect((await page.request.get("/api/characters?scope=all")).status()).toBe(403);
    } finally {
      await context.close();
    }
  });

  test.describe("the DM", () => {
    test.use({ storageState: "tests/.auth/dm.json" });

    test("reads every player's characters with their owner, and can open any one, but writes nothing", async ({ browser, request }) => {
      const p = await newPlayer();
      const { context, page } = await session(browser, p.username);
      let id: string;
      try {
        id = ((await (await page.request.post("/api/characters", { data: withName("Zz Seen By DM") })).json()) as { character: { id: string } }).character.id;
      } finally {
        await context.close();
      }
      const all = (await (await request.get("/api/characters?scope=all")).json()) as { characters: { id: string; name: string; owner?: { id: string } }[] };
      const mine = all.characters.find((c) => c.id === id);
      expect(mine?.name).toBe("Zz Seen By DM");
      expect(mine?.owner?.id).toBe(p.id);
      expect((await request.get(`/api/characters/${id}`)).status()).toBe(200);

      expect((await request.post("/api/characters", { data: VALID })).status()).toBe(403);
      expect((await request.put(`/api/characters/${id}`, { data: withName("Zz DM Edit") })).status()).toBe(403);
      expect((await request.delete(`/api/characters/${id}`)).status()).toBe(403);
      const [row] = await query<{ name: string; archived_at: Date | null }>(`SELECT name, archived_at FROM characters WHERE id = $1`, [id]);
      expect(row).toMatchObject({ name: "Zz Seen By DM", archived_at: null });
      expect((await (await request.get("/api/characters")).json()) as { characters: unknown[] }).toEqual({ characters: [] });
    });
  });
});
