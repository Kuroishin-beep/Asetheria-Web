import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { Client } from "pg";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { closeDbHelpers, createTestPlayer, deleteTestUser, query } from "./db-helpers";
import { tc } from "./case-id";

/**
 * Phase 18: map regions, layers and city maps. A region is a polygon the DM draws; a player sees it only if
 * they may read the page it is linked to; layers show and hide groups; a pin can open another map.
 * Everything runs against the real app and the real (test) database.
 */

const ROOT = path.join(__dirname, "..");
const PASSWORD = "correct horse battery staple 42";
const tag = randomUUID().slice(0, 6);
const users: string[] = [];

test.use({ storageState: "tests/.auth/dm.json" });

test.beforeEach(async () => {
  await query(`DELETE FROM maps WHERE slug LIKE 'zz-playwright-map-%'`);
  await query(`DELETE FROM entries WHERE name LIKE 'zz-playwright-mr-%'`);
});
test.afterAll(async () => {
  await query(`DELETE FROM maps WHERE slug LIKE 'zz-playwright-map-%'`);
  await query(`DELETE FROM entries WHERE name LIKE 'zz-playwright-mr-%'`);
  for (const id of users) await deleteTestUser(id);
  await closeDbHelpers();
});

type Pg = { id: string; name: string; slug: string };
type Mp = { id: string; slug: string; name: string };

async function makeMap(label: string): Promise<Mp> {
  const slug = `zz-playwright-map-${label}-${tag}`;
  const name = `Test map ${label} ${tag}`;
  const [row] = await query<{ id: string }>(`INSERT INTO maps (slug, name, image_path, width, height) VALUES ($1, $2, '/maps/wip-map.png', 2250, 1200) RETURNING id`, [slug, name]);
  return { id: row.id, slug, name };
}

async function makePage(label: string, kind = "location", visibility = "public"): Promise<Pg> {
  const n = `zz-playwright-mr-${label}-${tag}`;
  const [row] = await query<{ id: string }>(`INSERT INTO entries (slug, kind, name, summary, visibility, source_path) VALUES ($1, $2::entry_kind, $3, $4, $5::visibility, 'test: map regions') RETURNING id`, [n, kind, n, `About ${label}`, visibility]);
  return { id: row.id, name: n, slug: n };
}

const SQUARE = [[0.2, 0.2], [0.4, 0.2], [0.4, 0.4], [0.2, 0.4]];
const TRIANGLE = [[0.6, 0.2], [0.8, 0.2], [0.7, 0.4]];
const L_SHAPE = [[0.1, 0.5], [0.4, 0.5], [0.4, 0.7], [0.3, 0.7], [0.3, 0.9], [0.1, 0.9]]; // an L with a notch at the right

async function layer(map: Mp, name: string, defaultOn = true): Promise<string> {
  const [row] = await query<{ id: string }>(`INSERT INTO map_layers (map_id, name, default_on) VALUES ($1, $2, $3) RETURNING id`, [map.id, name, defaultOn]);
  return row.id;
}

async function region(map: Mp, name: string, points: number[][], opts: { entry?: Pg | null; layerId?: string | null; tone?: string } = {}): Promise<string> {
  const [row] = await query<{ id: string }>(`INSERT INTO map_regions (map_id, entry_id, layer_id, name, points, tone) VALUES ($1, $2, $3, $4, $5::jsonb, $6) RETURNING id`, [map.id, opts.entry?.id ?? null, opts.layerId ?? null, name, JSON.stringify(points), opts.tone ?? "1"]);
  return row.id;
}

async function pin(map: Mp, entry: Pg, x: number, y: number, layerId: string | null = null, childMapId: string | null = null): Promise<string> {
  const [row] = await query<{ id: string }>(`INSERT INTO map_pins (map_id, entry_id, x, y, layer_id, child_map_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, [map.id, entry.id, x, y, layerId, childMapId]);
  return row.id;
}

async function reader(browser: Browser, kinds: string[] = ["location", "empire"]) {
  const username = `zz-mr-${randomUUID().slice(0, 6)}`;
  const id = await createTestPlayer(username, PASSWORD);
  users.push(id);
  await query(`UPDATE users SET display_name = $2 WHERE id = $1`, [id, `Zz ${username.slice(-4)}`]);
  for (const k of kinds) await query(`INSERT INTO entry_grants (user_id, kind, granted) VALUES ($1, $2::entry_kind, true)`, [id, k]);
  const context = await browser.newContext();
  const page = await context.newPage();
  const res = await page.request.post("/api/auth/login", { data: { username, password: PASSWORD }, headers: { "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.4.${Math.floor(Math.random() * 250)}` } });
  expect(res.ok()).toBe(true);
  return { context, page };
}

async function open(page: Page, map: Mp) {
  // Tall enough that the whole map is on screen: the mouse clicks below do not scroll.
  await page.setViewportSize({ width: page.viewportSize()?.width ?? 1280, height: 1500 });
  await page.goto(`/map/${map.slug}`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("map-viewport")).toBeVisible();
}

/** Clicks the map at a fraction of the image (the stage's own box, so it is right at any zoom). */
async function clickAt(page: Page, fx: number, fy: number) {
  const box = (await page.getByTestId("map-stage").boundingBox()) as { x: number; y: number; width: number; height: number };
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

const regionsOf = (mapId: string) => query<{ id: string; name: string; entry_id: string | null; layer_id: string | null; tone: string; points: number[][] }>(`SELECT id, name, entry_id, layer_id, tone, points FROM map_regions WHERE map_id = $1 ORDER BY created_at`, [mapId]);

const post = (request: APIRequestContext, map: Mp, data: unknown) => request.post(`/api/maps/${map.slug}/regions`, { data });

test.describe("migration", () => {
  test("[TC-MREG-001] the tables and pin columns exist and hold their checks and cascades, and the migration is idempotent", async () => {
    const map = await makeMap("mig");
    const other = await makeMap("mig2");
    const page = await makePage("mig");
    const ins = (sql: string, params: unknown[]) => query(sql, params);
    const addRegion = (name: string, points: unknown, tone = "1") => ins(`INSERT INTO map_regions (map_id, name, points, tone) VALUES ($1, $2, $3::jsonb, $4)`, [map.id, name, JSON.stringify(points), tone]);
    await expect(addRegion("", SQUARE)).rejects.toThrow(/map_regions_name_length/);
    await expect(addRegion("x".repeat(121), SQUARE)).rejects.toThrow(/map_regions_name_length/);
    await expect(addRegion("ok", [[0, 0], [1, 1]])).rejects.toThrow(/map_regions_points_array/);
    await expect(addRegion("ok", Array.from({ length: 201 }, () => [0.5, 0.5]))).rejects.toThrow(/map_regions_points_array/);
    await expect(addRegion("ok", { not: "an array" })).rejects.toThrow(/map_regions_points_array/);
    await expect(addRegion("ok", SQUARE, "9")).rejects.toThrow(/map_regions_tone/);
    await addRegion("x".repeat(120), Array.from({ length: 200 }, (_, i) => [i / 200, 0.5]));
    await expect(ins(`INSERT INTO map_layers (map_id, name) VALUES ($1, '')`, [map.id])).rejects.toThrow(/map_layers_name_length/);
    await expect(ins(`INSERT INTO map_layers (map_id, name) VALUES ($1, $2)`, [map.id, "x".repeat(61)])).rejects.toThrow(/map_layers_name_length/);
    const lid = await layer(map, "Roads");
    await expect(layer(map, "ROADS")).rejects.toThrow(/duplicate key/); // a name is unique on a map whatever its case
    await layer(other, "Roads"); // but another map may reuse it
    const pid = await pin(map, page, 0.5, 0.5, lid, null);
    await expect(ins(`UPDATE map_pins SET child_map_id = map_id WHERE id = $1`, [pid])).rejects.toThrow(/map_pins_not_own_child/);
    await ins(`UPDATE map_pins SET child_map_id = $2 WHERE id = $1`, [pid, other.id]);
    // Deleting a layer keeps its pins and regions; deleting a map or a page removes what hangs on it.
    const rid = await region(map, "R", SQUARE, { layerId: lid, entry: page });
    await query(`DELETE FROM map_layers WHERE id = $1`, [lid]);
    expect((await query<{ layer_id: string | null }>(`SELECT layer_id FROM map_pins WHERE id = $1`, [pid]))[0].layer_id).toBeNull();
    expect((await query<{ layer_id: string | null }>(`SELECT layer_id FROM map_regions WHERE id = $1`, [rid]))[0].layer_id).toBeNull();
    await query(`DELETE FROM entries WHERE id = $1`, [page.id]);
    expect(await query(`SELECT 1 FROM map_regions WHERE id = $1`, [rid])).toHaveLength(0);
    await query(`DELETE FROM maps WHERE id = $1`, [other.id]);
    expect((await query<{ child_map_id: string | null }>(`SELECT child_map_id FROM map_pins WHERE id = $1`, [pid]))[0]).toBeUndefined(); // the pin's entry is gone, so is the pin
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      const sql = fs.readFileSync(path.join(ROOT, "scripts", "sql", "map-regions.sql"), "utf8");
      await client.query(sql);
      await client.query(sql);
    } finally {
      await client.end();
    }
  });

  test("[TC-MREG-002] the rollback drops the regions, layers and the two pin columns and leaves maps, pins and entries (run inside a transaction that is rolled back)", async () => {
    expect(process.env.DATABASE_URL ?? "").not.toMatch(/neon\.tech|neon\.build/);
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query("BEGIN");
      const pins = Number((await client.query(`SELECT count(*)::int AS n FROM map_pins`)).rows[0].n);
      const entries = Number((await client.query(`SELECT count(*)::int AS n FROM entries`)).rows[0].n);
      await client.query(fs.readFileSync(path.join(ROOT, "scripts", "sql", "map-regions-rollback.sql"), "utf8"));
      expect((await client.query(`SELECT to_regclass('map_regions')::text AS a, to_regclass('map_layers')::text AS b`)).rows[0]).toEqual({ a: null, b: null });
      expect((await client.query(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'map_pins' AND column_name IN ('layer_id', 'child_map_id')`)).rows[0].n).toBe(0);
      expect(Number((await client.query(`SELECT count(*)::int AS n FROM map_pins`)).rows[0].n)).toBe(pins);
      expect(Number((await client.query(`SELECT count(*)::int AS n FROM entries`)).rows[0].n)).toBe(entries);
      expect((await client.query(`SELECT to_regclass('maps')::text AS t`)).rows[0].t).toBe("maps");
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
    expect((await query<{ t: string }>(`SELECT to_regclass('map_regions')::text AS t`))[0].t).toBe("map_regions");
  });
});

test.describe("regions (the API)", () => {
  test("[TC-MREG-003] a good outline is saved as fractions of the image, and the DM reads it back", async ({ request }) => {
    const map = await makeMap("api");
    const place = await makePage("place");
    const res = await post(request, map, { name: "  The Heartland  ", points: SQUARE, entryId: place.id, tone: "3" });
    expect(res.status()).toBe(201);
    const [row] = await regionsOf(map.id);
    expect(row).toMatchObject({ name: "The Heartland", entry_id: place.id, tone: "3", layer_id: null });
    expect(row.points).toEqual(SQUARE);
    const listed = await (await request.get(`/api/maps/${map.slug}/regions`)).json();
    expect(listed.regions).toHaveLength(1);
    expect(listed.regions[0]).toMatchObject({ name: "The Heartland", tone: "3", entry: { slug: place.slug } });
  });

  test("[TC-MREG-004] an outline that cannot be a region is refused with the reason: too few or too many points, outside the map, crossing itself, no area", async ({ request }) => {
    const map = await makeMap("bad");
    const refuse = async (points: unknown, message: RegExp) => {
      const res = await post(request, map, { name: "Bad", points });
      expect(res.status(), JSON.stringify(points).slice(0, 40)).toBe(400);
      expect((await res.json()).error).toMatch(message);
    };
    await refuse([[0.1, 0.1], [0.9, 0.9]], /at least 3 points/);
    await refuse(Array.from({ length: 201 }, (_, i) => [0.5 + 0.4 * Math.cos((2 * Math.PI * i) / 201), 0.5 + 0.4 * Math.sin((2 * Math.PI * i) / 201)]), /at most 200 points/);
    await refuse([[0.1, 0.1], [1.5, 0.1], [0.5, 0.9]], /Point 2 is outside the map/);
    await refuse([[0.1, 0.1], [0.9, 0.9], [0.9, 0.1], [0.1, 0.9]], /crosses itself/);
    await refuse([[0.1, 0.1], [0.5, 0.5], [0.9, 0.9]], /no area/);
    await refuse([[0.1, 0.1], ["x", 0.1], [0.5, 0.9]], /Point 2 is not a pair of numbers/);
    await refuse([[0.1, 0.1], [0.1, 0.1], [0.9, 0.5], [0.5, 0.9]], /same spot/);
    expect(await regionsOf(map.id)).toHaveLength(0);
  });

  test("[TC-MREG-005] 200 points are accepted, as are the corners of the map itself", async ({ request }) => {
    const map = await makeMap("edge");
    const ring = Array.from({ length: 200 }, (_, i) => [0.5 + 0.4 * Math.cos((2 * Math.PI * i) / 200), 0.5 + 0.4 * Math.sin((2 * Math.PI * i) / 200)]);
    expect((await post(request, map, { name: "Ring", points: ring })).status()).toBe(201);
    expect((await post(request, map, { name: "All", points: [[0, 0], [1, 0], [1, 1], [0, 1]] })).status()).toBe(201);
  });

  test("[TC-MREG-006] a blank or over-long name, an unknown colour, a missing or extra field are refused; the name limit is 120", async ({ request }) => {
    const map = await makeMap("shape");
    expect((await post(request, map, { name: "x".repeat(120), points: SQUARE })).status()).toBe(201);
    for (const data of [{ name: "", points: SQUARE }, { name: "   ", points: SQUARE }, { name: "x".repeat(121), points: SQUARE }, { name: "ok", points: SQUARE, tone: "9" }, { name: "ok" }, { points: SQUARE }, { name: "ok", points: SQUARE, extra: 1 }, { name: "ok", points: "nope" }, { name: 5, points: SQUARE }]) {
      expect((await post(request, map, data)).status(), JSON.stringify(data).slice(0, 50)).toBe(400);
    }
    expect(await regionsOf(map.id)).toHaveLength(1);
  });

  test("[TC-MREG-007] a page that is gone or archived, and a layer that belongs to another map, are refused", async ({ request }) => {
    const map = await makeMap("refs");
    const other = await makeMap("refs2");
    const gone = await makePage("gone");
    await query(`UPDATE entries SET archived_at = now() WHERE id = $1`, [gone.id]);
    const foreign = await layer(other, "Elsewhere");
    expect((await post(request, map, { name: "A", points: SQUARE, entryId: randomUUID() })).status()).toBe(404);
    expect((await post(request, map, { name: "A", points: SQUARE, entryId: gone.id })).status()).toBe(404);
    const res = await post(request, map, { name: "A", points: SQUARE, layerId: foreign });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/does not belong to this map/);
    expect((await post(request, map, { name: "A", points: SQUARE, entryId: "not-a-uuid" })).status()).toBe(400);
    expect(await regionsOf(map.id)).toHaveLength(0);
  });

  test("[TC-MREG-008] a map holds at most 300 regions; the 300th is accepted and the 301st refused", async ({ request }) => {
    test.slow();
    const map = await makeMap("cap");
    await query(`INSERT INTO map_regions (map_id, name, points) SELECT $1, 'bulk ' || g, $2::jsonb FROM generate_series(1, 299) g`, [map.id, JSON.stringify(SQUARE)]);
    expect((await post(request, map, { name: "300th", points: SQUARE })).status()).toBe(201);
    const over = await post(request, map, { name: "301st", points: SQUARE });
    expect(over.status()).toBe(400);
    expect((await over.json()).error).toMatch(/at most 300 regions/);
  });

  test("[TC-MREG-009] a region can be renamed, recoloured, linked, unlinked and moved to a layer; bad changes are refused; deleting it leaves the page", async ({ request }) => {
    const map = await makeMap("patch");
    const place = await makePage("p1");
    const lid = await layer(map, "Borders");
    const rid = await region(map, "First", SQUARE);
    const patch = (data: unknown) => request.patch(`/api/maps/${map.slug}/regions/${rid}`, { data });
    expect((await patch({ name: "Second", tone: "4", entryId: place.id, layerId: lid })).status()).toBe(200);
    expect((await regionsOf(map.id))[0]).toMatchObject({ name: "Second", tone: "4", entry_id: place.id, layer_id: lid });
    expect((await patch({ entryId: null, layerId: null })).status()).toBe(200);
    expect((await regionsOf(map.id))[0]).toMatchObject({ entry_id: null, layer_id: null });
    for (const bad of [{ name: "" }, { name: "x".repeat(121) }, { tone: "0" }, { entryId: randomUUID() }, { layerId: randomUUID() }, { points: SQUARE }, { name: 5 }]) {
      expect((await patch(bad)).status(), JSON.stringify(bad)).toBeGreaterThanOrEqual(400);
    }
    expect((await request.patch(`/api/maps/${map.slug}/regions/${randomUUID()}`, { data: { name: "x" } })).status()).toBe(404);
    expect((await request.patch(`/api/maps/${map.slug}/regions/not-a-uuid`, { data: { name: "x" } })).status()).toBe(400);
    expect((await request.delete(`/api/maps/${map.slug}/regions/${rid}`)).status()).toBe(200);
    expect((await request.delete(`/api/maps/${map.slug}/regions/${rid}`)).status()).toBe(404);
    expect(await query(`SELECT 1 FROM entries WHERE id = $1`, [place.id])).toHaveLength(1);
  });

  test("[TC-MREG-010] a region of another map cannot be changed or deleted through this map's address", async ({ request }) => {
    const a = await makeMap("a");
    const b = await makeMap("b");
    const rid = await region(a, "Mine", SQUARE);
    expect((await request.patch(`/api/maps/${b.slug}/regions/${rid}`, { data: { name: "Hijacked" } })).status()).toBe(404);
    expect((await request.delete(`/api/maps/${b.slug}/regions/${rid}`)).status()).toBe(404);
    expect((await regionsOf(a.id))[0].name).toBe("Mine");
    expect((await post(request, { id: "", slug: `zz-playwright-map-missing-${tag}`, name: "" }, { name: "x", points: SQUARE })).status()).toBe(404);
  });

  test("[TC-MREG-011] signed out: 401 everywhere; a player: 403 on every write, and the lists are still theirs to read", async ({ browser }) => {
    const map = await makeMap("auth");
    const rid = await region(map, "R", SQUARE);
    const lid = await layer(map, "L");
    const anon = await browser.newContext({ storageState: undefined });
    const { context, page } = await reader(browser);
    try {
      for (const [label, ctx] of [["anon", anon], ["player", { request: page.request }]] as const) {
        const want = label === "anon" ? 401 : 403;
        expect((await ctx.request.post(`/api/maps/${map.slug}/regions`, { data: { name: "x", points: SQUARE } })).status(), `${label} POST regions`).toBe(want);
        expect((await ctx.request.patch(`/api/maps/${map.slug}/regions/${rid}`, { data: { name: "x" } })).status(), `${label} PATCH region`).toBe(want);
        expect((await ctx.request.delete(`/api/maps/${map.slug}/regions/${rid}`)).status(), `${label} DELETE region`).toBe(want);
        expect((await ctx.request.post(`/api/maps/${map.slug}/layers`, { data: { name: "x" } })).status(), `${label} POST layer`).toBe(want);
        expect((await ctx.request.patch(`/api/maps/${map.slug}/layers/${lid}`, { data: { name: "x" } })).status(), `${label} PATCH layer`).toBe(want);
        expect((await ctx.request.delete(`/api/maps/${map.slug}/layers/${lid}`)).status(), `${label} DELETE layer`).toBe(want);
      }
      expect((await anon.request.get(`/api/maps/${map.slug}/regions`)).status()).toBe(401);
      expect((await page.request.get(`/api/maps/${map.slug}/regions`)).status()).toBe(200);
      expect(await regionsOf(map.id)).toHaveLength(1);
      expect(await query(`SELECT 1 FROM map_layers WHERE id = $1`, [lid])).toHaveLength(1);
    } finally {
      await context.close();
      await anon.close();
    }
  });
});

test.describe("who sees which region and layer", () => {
  test("[TC-MREG-012] a player sees only regions linked to a page they may read: nothing from a secret page, an unlinked region, an ungranted kind or an archived page is in the page, the data or the API", async ({ browser, request }) => {
    test.slow();
    const map = await makeMap("vis");
    const open1 = await makePage("open", "location");
    const hidden = await makePage("hidden", "location", "secret");
    const ungranted = await makePage("ungranted", "creature");
    const archived = await makePage("archived", "location");
    await query(`UPDATE entries SET archived_at = now() WHERE id = $1`, [archived.id]);
    await region(map, "Open region", SQUARE, { entry: open1 });
    await region(map, "Secret region", TRIANGLE, { entry: hidden });
    await region(map, "DM-only region", L_SHAPE);
    await region(map, "Ungranted region", [[0.5, 0.5], [0.6, 0.5], [0.55, 0.6]], { entry: ungranted });
    await region(map, "Archived region", [[0.7, 0.7], [0.8, 0.7], [0.75, 0.8]], { entry: archived });
    const { context, page } = await reader(browser);
    try {
      await open(page, map);
      const html = await page.content();
      for (const secret of ["Secret region", "DM-only region", "Ungranted region", "Archived region", hidden.name, ungranted.name, archived.name]) expect(html, secret).not.toContain(secret);
      expect(html).toContain("Open region");
      await expect(page.locator("[data-region]")).toHaveCount(1);
      const api = await (await page.request.get(`/api/maps/${map.slug}/regions`)).text();
      for (const secret of ["Secret region", "DM-only region", "Ungranted region", "Archived region"]) expect(api, secret).not.toContain(secret);
      expect(JSON.parse(api).regions).toHaveLength(1);
    } finally {
      await context.close();
    }
    // The DM sees every region that is not on an archived page, including the one with no page.
    const dm = (await (await request.get(`/api/maps/${map.slug}/regions`)).json()).regions.map((r: { name: string }) => r.name).sort();
    expect(dm).toEqual(["DM-only region", "Open region", "Secret region", "Ungranted region"]);
  });

  test("[TC-MREG-013] a layer that holds only hidden things is not named to a player; a layer with something they can see is, and only by name", async ({ browser }) => {
    test.slow();
    const map = await makeMap("lay");
    const open1 = await makePage("lopen", "location");
    const hidden = await makePage("lhidden", "location", "secret");
    const quiet = await layer(map, `Cult hideouts ${tag}`);
    const shown = await layer(map, `Trade routes ${tag}`);
    await region(map, "Cult region", SQUARE, { entry: hidden, layerId: quiet });
    await pin(map, hidden, 0.3, 0.3, quiet);
    await region(map, "Open region", TRIANGLE, { entry: open1, layerId: shown });
    const { context, page } = await reader(browser);
    try {
      await open(page, map);
      const html = await page.content();
      expect(html).not.toContain(`Cult hideouts ${tag}`);
      expect(html).toContain(`Trade routes ${tag}`);
      await expect(page.getByTestId("map-layers").getByRole("checkbox")).toHaveCount(1);
    } finally {
      await context.close();
    }
  });

  test("[TC-MREG-014] the DM sees every layer, including empty ones", async ({ page }) => {
    const map = await makeMap("dmlay");
    await layer(map, "Empty one");
    await layer(map, "Empty two");
    await open(page, map);
    await expect(page.getByTestId("map-layers").getByRole("checkbox")).toHaveCount(2);
  });
});

test.describe("layers (the API)", () => {
  test("[TC-MREG-015] a layer is added, renamed and switched off by default; its name is unique on a map in any letter case; blank and 61-character names are refused", async ({ request }) => {
    const map = await makeMap("lapi");
    const add = (name: unknown) => request.post(`/api/maps/${map.slug}/layers`, { data: { name } });
    const res = await add("  Roads  ");
    expect(res.status()).toBe(201);
    const { id } = await res.json();
    expect((await query<{ name: string }>(`SELECT name FROM map_layers WHERE id = $1`, [id]))[0].name).toBe("Roads");
    for (const dup of ["Roads", "ROADS", " roads "]) expect((await add(dup)).status(), dup).toBe(400);
    for (const bad of ["", "   ", "x".repeat(61), 5]) expect((await add(bad)).status(), String(bad)).toBe(400);
    expect((await add("x".repeat(60))).status()).toBe(201);
    expect((await request.post(`/api/maps/${map.slug}/layers`, { data: { name: "ok", extra: 1 } })).status()).toBe(400);
    const patch = (data: unknown) => request.patch(`/api/maps/${map.slug}/layers/${id}`, { data });
    expect((await patch({ name: "Highways", defaultOn: false })).status()).toBe(200);
    expect((await query<{ name: string; default_on: boolean }>(`SELECT name, default_on FROM map_layers WHERE id = $1`, [id]))[0]).toEqual({ name: "Highways", default_on: false });
    expect((await patch({ name: "x".repeat(60) })).status()).toBe(400); // taken by the other layer
    expect((await patch({ defaultOn: "yes" })).status()).toBe(400);
    expect((await request.patch(`/api/maps/${map.slug}/layers/${randomUUID()}`, { data: { name: "z" } })).status()).toBe(404);
    expect((await request.patch(`/api/maps/${map.slug}/layers/nope`, { data: { name: "z" } })).status()).toBe(400);
  });

  test("[TC-MREG-016] a map holds at most 20 layers; the 20th is accepted and the 21st refused", async ({ request }) => {
    test.slow();
    const map = await makeMap("lcap");
    for (let i = 1; i <= 20; i++) expect((await request.post(`/api/maps/${map.slug}/layers`, { data: { name: `Layer ${i}` } })).status(), `layer ${i}`).toBe(201);
    const over = await request.post(`/api/maps/${map.slug}/layers`, { data: { name: "Layer 21" } });
    expect(over.status()).toBe(400);
    expect((await over.json()).error).toMatch(/at most 20 layers/);
  });

  test("[TC-MREG-017] deleting a layer leaves its pins and regions on the map with no layer", async ({ request }) => {
    const map = await makeMap("ldel");
    const place = await makePage("ldel");
    const lid = await layer(map, "Temporary");
    const rid = await region(map, "R", SQUARE, { layerId: lid, entry: place });
    const pid = await pin(map, place, 0.5, 0.5, lid);
    expect((await request.delete(`/api/maps/${map.slug}/layers/${lid}`)).status()).toBe(200);
    expect((await request.delete(`/api/maps/${map.slug}/layers/${lid}`)).status()).toBe(404);
    expect((await regionsOf(map.id))[0]).toMatchObject({ id: rid, layer_id: null });
    expect((await query<{ layer_id: string | null }>(`SELECT layer_id FROM map_pins WHERE id = $1`, [pid]))[0].layer_id).toBeNull();
  });
});

test.describe("pins: layers and city maps (the API)", () => {
  test("[TC-MREG-018] a pin can be moved to a layer of its own map but not of another, and its label changed", async ({ request }) => {
    const a = await makeMap("pa");
    const b = await makeMap("pb");
    const place = await makePage("pin1");
    const pid = await pin(a, place, 0.5, 0.5);
    const own = await layer(a, "Mine");
    const foreign = await layer(b, "Theirs");
    const patch = (data: unknown) => request.patch(`/api/maps/${a.slug}/pins/${pid}`, { data });
    expect((await patch({ layerId: own, label: "A label" })).status()).toBe(200);
    expect((await query<{ layer_id: string; label: string }>(`SELECT layer_id, label FROM map_pins WHERE id = $1`, [pid]))[0]).toEqual({ layer_id: own, label: "A label" });
    expect((await patch({ layerId: foreign })).status()).toBe(400);
    expect((await patch({ layerId: null, label: "" })).status()).toBe(200);
    expect((await query<{ layer_id: string | null; label: string | null }>(`SELECT layer_id, label FROM map_pins WHERE id = $1`, [pid]))[0]).toEqual({ layer_id: null, label: null });
    for (const bad of [{ layerId: "nope" }, { extra: 1 }, { label: "x".repeat(121) }, { childMapId: 5 }]) expect((await patch(bad)).status(), JSON.stringify(bad)).toBe(400);
    expect((await request.patch(`/api/maps/${a.slug}/pins/${randomUUID()}`, { data: { label: "x" } })).status()).toBe(404);
    expect((await request.patch(`/api/maps/${b.slug}/pins/${pid}`, { data: { label: "x" } })).status()).toBe(404);
  });

  test("[TC-MREG-019] a pin can open another map; it may not open its own map, and no two maps may open each other, directly or through a chain", async ({ request }) => {
    const [world, region_, city, other] = [await makeMap("w"), await makeMap("r"), await makeMap("c"), await makeMap("o")];
    const place = await makePage("w1");
    const pw = await pin(world, place, 0.1, 0.1);
    const pr = await pin(region_, place, 0.2, 0.2);
    const pc = await pin(city, place, 0.3, 0.3);
    const link = (m: Mp, pinId: string, childMapId: string | null) => request.patch(`/api/maps/${m.slug}/pins/${pinId}`, { data: { childMapId } });
    expect((await link(world, pw, region_.id)).status()).toBe(200);
    expect((await link(region_, pr, city.id)).status()).toBe(200);
    const self = await link(city, pc, city.id);
    expect(self.status()).toBe(400);
    expect((await self.json()).error).toMatch(/cannot open the map it is on/);
    for (const [m, p, target] of [[city, pc, region_], [city, pc, world], [region_, pr, world]] as const) {
      const res = await link(m, p, target.id);
      expect(res.status(), `${m.slug} -> ${target.slug}`).toBe(400);
      expect((await res.json()).error).toMatch(/open each other/);
    }
    expect((await link(world, pw, city.id)).status()).toBe(200); // a shortcut down is not a loop
    expect((await link(city, pc, other.id)).status()).toBe(200); // and a chain may go on
    expect((await link(world, pw, null)).status()).toBe(200);
    expect((await link(world, pw, randomUUID())).status()).toBe(400);
    expect((await query<{ child_map_id: string | null }>(`SELECT child_map_id FROM map_pins WHERE id = $1`, [pw]))[0].child_map_id).toBeNull();
  });

  test("[TC-MREG-020] a player cannot change a pin", async ({ browser }) => {
    const map = await makeMap("pp");
    const place = await makePage("pp1");
    const pid = await pin(map, place, 0.5, 0.5);
    const { context, page } = await reader(browser);
    try {
      expect((await page.request.patch(`/api/maps/${map.slug}/pins/${pid}`, { data: { label: "mine" } })).status()).toBe(403);
      expect((await query<{ label: string | null }>(`SELECT label FROM map_pins WHERE id = $1`, [pid]))[0].label).toBeNull();
    } finally {
      await context.close();
    }
  });
});

test.describe("drawing a region (DM)", () => {
  test("[TC-MREG-021] click the corners, Finish, name it, link a page, pick a layer and a colour: the region is drawn, listed and saved at the places clicked", async ({ page }) => {
    test.slow();
    const map = await makeMap("draw");
    const place = await makePage("drawn");
    const lid = await layer(map, "Borders");
    await open(page, map);
    await page.getByTestId("draw-region").click();
    await expect(page.getByTestId("map-viewport")).toHaveAttribute("data-drawing", "true");
    await expect(page.getByTestId("finish-region")).toBeDisabled();
    const corners = [[0.2, 0.2], [0.5, 0.2], [0.5, 0.5], [0.2, 0.5]];
    for (const [i, [fx, fy]] of corners.entries()) {
      await clickAt(page, fx, fy);
      await expect(page.locator("[data-draft-point]")).toHaveCount(i + 1);
    }
    await expect(page.getByTestId("finish-region")).toContainText("Finish (4 points)");
    await page.getByTestId("finish-region").click();
    await page.getByLabel("Region name").fill("The Drawn Lands");
    await page.getByLabel("The page it belongs to (optional)").fill(place.name.slice(0, 24));
    await page.getByTestId("region-result").filter({ hasText: place.name }).click();
    await expect(page.getByTestId("region-chosen")).toContainText(place.name);
    await page.locator("#region-layer").selectOption({ label: "Borders" });
    await page.getByLabel("Colour").selectOption("2");
    await page.getByTestId("region-save").click();
    await expect(page.locator("[data-region]")).toHaveCount(1);
    await expect(page.getByTestId("map-regions-list")).toContainText("The Drawn Lands");
    const [row] = await regionsOf(map.id);
    expect(row).toMatchObject({ name: "The Drawn Lands", entry_id: place.id, layer_id: lid, tone: "2" });
    expect(row.points).toHaveLength(4);
    row.points.forEach((p, i) => {
      expect(Math.abs(p[0] - corners[i][0])).toBeLessThan(0.01);
      expect(Math.abs(p[1] - corners[i][1])).toBeLessThan(0.01);
    });
    // Drawing ended; the draft is gone.
    await expect(page.getByTestId("map-viewport")).toHaveAttribute("data-drawing", "false");
    await expect(page.locator("[data-draft-point]")).toHaveCount(0);
  });

  test("[TC-MREG-022] the corners stay right after zooming in and panning", async ({ page }) => {
    test.slow();
    const map = await makeMap("zoom");
    await open(page, map);
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.keyboard.press("Escape");
    await page.getByTestId("map-viewport").focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
    await page.getByTestId("draw-region").click();
    const stage = (await page.getByTestId("map-stage").boundingBox()) as { x: number; y: number; width: number; height: number };
    const vp = (await page.getByTestId("map-viewport").boundingBox()) as { x: number; y: number; width: number; height: number };
    // Three clicks well inside the visible part; the expected fractions come from where they landed on the stage.
    const spots = [[0.3, 0.3], [0.7, 0.3], [0.5, 0.7]].map(([a, b]) => [vp.x + vp.width * a, vp.y + vp.height * b]);
    for (const [x, y] of spots) await page.mouse.click(x, y);
    await page.getByTestId("finish-region").click();
    await page.getByLabel("Region name").fill("Zoomed");
    await page.getByTestId("region-save").click();
    await expect(page.locator("[data-region]")).toHaveCount(1);
    const [row] = await regionsOf(map.id);
    row.points.forEach((p, i) => {
      expect(Math.abs(p[0] - (spots[i][0] - stage.x) / stage.width)).toBeLessThan(0.01);
      expect(Math.abs(p[1] - (spots[i][1] - stage.y) / stage.height)).toBeLessThan(0.01);
    });
  });

  test("[TC-MREG-023] Undo and Backspace take back the last corner; Escape and Cancel throw the outline away; fewer than 3 points cannot be finished; Enter finishes", async ({ page }) => {
    test.slow();
    const map = await makeMap("undo");
    await open(page, map);
    await page.getByTestId("draw-region").click();
    await clickAt(page, 0.2, 0.2);
    await clickAt(page, 0.5, 0.2);
    await expect(page.getByTestId("finish-region")).toBeDisabled();
    await page.getByTestId("undo-point").click();
    await expect(page.locator("[data-draft-point]")).toHaveCount(1);
    await clickAt(page, 0.5, 0.2);
    await clickAt(page, 0.5, 0.5);
    await page.getByTestId("map-viewport").focus();
    await page.keyboard.press("Backspace");
    await expect(page.locator("[data-draft-point]")).toHaveCount(2);
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-draft-point]")).toHaveCount(0);
    await expect(page.getByTestId("map-viewport")).toHaveAttribute("data-drawing", "false");
    await page.getByTestId("draw-region").click();
    for (const [x, y] of [[0.2, 0.2], [0.5, 0.2], [0.35, 0.5]]) await clickAt(page, x, y);
    await page.getByTestId("map-viewport").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Region name")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click(); // the dialog's Cancel saves nothing
    expect(await regionsOf(map.id)).toHaveLength(0);
    await page.getByTestId("cancel-region").click();
    await expect(page.locator("[data-draft-point]")).toHaveCount(0);
  });

  test("[TC-MREG-024] an outline that crosses itself is refused on the spot with the reason, and nothing is saved", async ({ page }) => {
    test.slow();
    const map = await makeMap("cross");
    await open(page, map);
    await page.getByTestId("draw-region").click();
    for (const [x, y] of [[0.2, 0.2], [0.6, 0.6], [0.6, 0.2], [0.2, 0.6]]) await clickAt(page, x, y);
    await page.getByTestId("finish-region").click();
    await expect(page.getByTestId("draw-error")).toContainText("crosses itself");
    await expect(page.getByLabel("Region name")).toHaveCount(0);
    await page.getByTestId("undo-point").click();
    await page.getByTestId("finish-region").click();
    await expect(page.getByLabel("Region name")).toBeVisible();
    expect(await regionsOf(map.id)).toHaveLength(0);
  });

  test("[TC-MREG-025] a region with no name cannot be saved; one with no page is kept as the DM's own and says so", async ({ page }) => {
    test.slow();
    const map = await makeMap("noname");
    await open(page, map);
    await page.getByTestId("draw-region").click();
    for (const [x, y] of [[0.2, 0.2], [0.5, 0.2], [0.35, 0.5]]) await clickAt(page, x, y);
    await page.getByTestId("finish-region").click();
    await expect(page.getByTestId("region-save")).toBeDisabled();
    await page.getByLabel("Region name").fill("Private notes area");
    await expect(page.getByText("With no page the region is for your eyes only.")).toBeVisible();
    await page.getByTestId("region-save").click();
    await expect(page.getByTestId("map-regions-list")).toContainText("only you can see this");
    expect((await regionsOf(map.id))[0].entry_id).toBeNull();
  });

  test("[TC-MREG-026] a player has no drawing controls", async ({ browser }) => {
    const map = await makeMap("pdraw");
    const { context, page } = await reader(browser);
    try {
      await open(page, map);
      await expect(page.getByTestId("draw-region")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Place a pin" })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});

test.describe("opening a region", () => {
  test("[TC-MREG-027] tapping inside a region opens its preview with its page; tapping outside closes it; the last region drawn is on top where they overlap; Open page goes to the page", async ({ page }) => {
    test.slow();
    const map = await makeMap("tap");
    const a = await makePage("rega");
    const b = await makePage("regb");
    await region(map, "Under", [[0.1, 0.1], [0.6, 0.1], [0.6, 0.6], [0.1, 0.6]], { entry: a });
    await region(map, "Over", [[0.4, 0.4], [0.9, 0.4], [0.9, 0.9], [0.4, 0.9]], { entry: b });
    await open(page, map);
    await clickAt(page, 0.2, 0.2);
    await expect(page.getByRole("region", { name: "Region preview" })).toBeVisible();
    await expect(page.getByTestId("region-title")).toHaveText("Under");
    await clickAt(page, 0.5, 0.5); // inside both
    await expect(page.getByTestId("region-title")).toHaveText("Over");
    await clickAt(page, 0.95, 0.05); // outside
    await expect(page.getByRole("region", { name: "Region preview" })).toHaveCount(0);
    await clickAt(page, 0.8, 0.8);
    await page.getByTestId("open-region-page").click();
    await expect(page).toHaveURL(new RegExp(`/codex/entry/${b.slug}$`));
  });

  test("[TC-MREG-028] a concave region is opened from its arms but not from its notch", async ({ page }) => {
    test.slow();
    const map = await makeMap("concave");
    const a = await makePage("concave");
    await region(map, "The L", L_SHAPE, { entry: a });
    await open(page, map);
    await clickAt(page, 0.35, 0.8); // the notch, to the right of the long arm
    await expect(page.getByRole("region", { name: "Region preview" })).toHaveCount(0);
    await clickAt(page, 0.2, 0.8); // the long arm
    await expect(page.getByTestId("region-title")).toHaveText("The L");
    await clickAt(page, 0.35, 0.6); // the foot
    await expect(page.getByTestId("region-title")).toHaveText("The L");
  });

  test("[TC-MREG-029] a pin on top of a region opens the pin, not the region", async ({ page }) => {
    test.slow();
    const map = await makeMap("pinon");
    const a = await makePage("under");
    const p = await makePage("pinned");
    await region(map, "Big", [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]], { entry: a });
    await pin(map, p, 0.5, 0.5);
    await open(page, map);
    await page.locator("[data-pin]").click();
    await expect(page.getByRole("region", { name: "Pin preview" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Region preview" })).toHaveCount(0);
  });

  test("[TC-MREG-030] the regions list opens a region by keyboard, Escape closes it, and each region links to its page", async ({ page }) => {
    test.slow();
    const map = await makeMap("klist");
    const a = await makePage("klist");
    await region(map, "Listed", SQUARE, { entry: a });
    await open(page, map);
    const list = page.getByTestId("map-regions-list");
    await expect(list.getByRole("link", { name: a.name })).toHaveAttribute("href", `/codex/entry/${a.slug}`);
    await list.getByRole("button", { name: "Listed" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("region-title")).toHaveText("Listed");
    await page.getByTestId("map-viewport").focus();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("region", { name: "Region preview" })).toHaveCount(0);
  });

  test("[TC-MREG-031] a player gets the preview with no DM controls; the DM can remove a region and move it to a layer from its preview", async ({ page, browser }) => {
    test.slow();
    const map = await makeMap("ctrl");
    const a = await makePage("ctrl");
    const lid = await layer(map, "Sorted");
    await region(map, "Controlled", SQUARE, { entry: a });
    const { context, page: pp } = await reader(browser);
    try {
      await open(pp, map);
      await clickAt(pp, 0.3, 0.3);
      await expect(pp.getByTestId("region-title")).toHaveText("Controlled");
      await expect(pp.getByRole("button", { name: "Remove region" })).toHaveCount(0);
      await expect(pp.locator("#region-layer-change")).toHaveCount(0);
    } finally {
      await context.close();
    }
    await open(page, map);
    await clickAt(page, 0.3, 0.3);
    await page.locator("#region-layer-change").selectOption(lid);
    await expect.poll(async () => (await regionsOf(map.id))[0].layer_id).toBe(lid);
    await page.getByRole("button", { name: "Remove region" }).click();
    await expect.poll(async () => (await regionsOf(map.id)).length).toBe(0);
  });
});

test.describe("layers on the map", () => {
  test("[TC-MREG-032] switching a layer off hides its pins, regions, names and list entries; switching it on brings them back; a layer set off by default starts off", async ({ page }) => {
    test.slow();
    const map = await makeMap("tog");
    const a = await makePage("tog1");
    const b = await makePage("tog2");
    const roads = await layer(map, "Roads");
    const secret = await layer(map, "Rumours", false);
    await region(map, "Road region", SQUARE, { entry: a, layerId: roads });
    await region(map, "Rumour region", TRIANGLE, { entry: b, layerId: secret });
    await region(map, "Plain region", [[0.1, 0.7], [0.3, 0.7], [0.2, 0.9]], { entry: a });
    await pin(map, a, 0.5, 0.5, roads);
    await pin(map, b, 0.6, 0.6, secret);
    await open(page, map);
    const boxes = page.getByTestId("map-layers").getByRole("checkbox");
    await expect(page.getByRole("checkbox", { name: "Roads" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Rumours" })).not.toBeChecked();
    await expect(page.locator("[data-region]")).toHaveCount(2); // Road region and Plain region
    await expect(page.locator("[data-pin]")).toHaveCount(1);
    await expect(page.getByText("On this map (1)")).toBeVisible();
    await page.getByRole("checkbox", { name: "Roads" }).uncheck();
    await expect(page.locator("[data-region]")).toHaveCount(1);
    await expect(page.locator("[data-pin]")).toHaveCount(0);
    await expect(page.getByTestId("map-regions-list")).not.toContainText("Road region");
    await page.getByRole("checkbox", { name: "Rumours" }).check();
    await expect(page.locator("[data-region]")).toHaveCount(2);
    await expect(page.locator("[data-pin]")).toHaveCount(1);
    await page.getByRole("checkbox", { name: "Roads" }).check();
    await expect(page.locator("[data-region]")).toHaveCount(3);
    await expect(page.locator("[data-pin]")).toHaveCount(2);
    expect(await boxes.count()).toBe(2);
  });

  test("[TC-MREG-033] a selected pin or region closes when its layer is switched off", async ({ page }) => {
    test.slow();
    const map = await makeMap("selhide");
    const a = await makePage("selhide");
    const lid = await layer(map, "Switchable");
    await region(map, "R", SQUARE, { entry: a, layerId: lid });
    await open(page, map);
    await clickAt(page, 0.3, 0.3);
    await expect(page.getByRole("region", { name: "Region preview" })).toBeVisible();
    await page.getByRole("checkbox", { name: "Switchable" }).uncheck();
    await expect(page.getByRole("region", { name: "Region preview" })).toHaveCount(0);
  });

  test("[TC-MREG-034] the DM adds a layer and is told when the name is taken; deletes one and what was on it stays; assigns a pin to a layer from its preview", async ({ page }) => {
    test.slow();
    const map = await makeMap("dmlayers");
    const a = await makePage("dml");
    const pid = await pin(map, a, 0.5, 0.5);
    await open(page, map);
    await page.locator("#new-layer-name").fill("Roads");
    await page.getByTestId("add-layer").click();
    await expect(page.getByRole("checkbox", { name: "Roads" })).toBeVisible();
    await page.locator("#new-layer-name").fill("roads");
    await page.getByTestId("add-layer").click();
    await expect(page.getByTestId("layer-error")).toContainText('There is already a layer called "roads"');
    await page.locator("[data-pin]").click();
    await page.locator("#pin-layer").selectOption({ label: "Roads" });
    await expect.poll(async () => (await query<{ layer_id: string | null }>(`SELECT layer_id FROM map_pins WHERE id = $1`, [pid]))[0].layer_id).not.toBeNull();
    await page.getByRole("button", { name: "Delete the layer Roads" }).click();
    await expect(page.getByRole("checkbox", { name: "Roads" })).toHaveCount(0);
    expect((await query<{ layer_id: string | null }>(`SELECT layer_id FROM map_pins WHERE id = $1`, [pid]))[0].layer_id).toBeNull();
    await expect(page.locator("[data-pin]")).toHaveCount(1);
  });

  test("[TC-MREG-035] a player sees the layer switches but no way to add or delete layers, and the switches work by keyboard", async ({ browser }) => {
    test.slow();
    const map = await makeMap("playlay");
    const a = await makePage("playlay");
    const lid = await layer(map, "Visible layer");
    await region(map, "R", SQUARE, { entry: a, layerId: lid });
    const { context, page } = await reader(browser);
    try {
      await open(page, map);
      await expect(page.locator("#new-layer-name")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Delete the layer/ })).toHaveCount(0);
      const box = page.getByRole("checkbox", { name: "Visible layer" });
      await box.focus();
      await page.keyboard.press("Space");
      await expect(box).not.toBeChecked();
      await expect(page.locator("[data-region]")).toHaveCount(0);
      await page.keyboard.press("Space");
      await expect(page.locator("[data-region]")).toHaveCount(1);
    } finally {
      await context.close();
    }
  });
});

test.describe("city maps", () => {
  test("[TC-MREG-036] a pin that opens another map offers it in its preview; the city map has a way back; a map that no pin opens has none", async ({ page }) => {
    test.slow();
    const world = await makeMap("world");
    const city = await makeMap("city");
    const place = await makePage("citypin");
    await pin(world, place, 0.5, 0.5, null, city.id);
    await open(page, world);
    await expect(page.getByTestId("back-to-parent-map")).toHaveCount(0);
    await page.locator("[data-pin]").click();
    await page.getByTestId("open-child-map").click();
    await expect(page).toHaveURL(new RegExp(`/map/${city.slug}$`));
    await expect(page.getByTestId("back-to-parent-map")).toContainText(`Back to ${world.name}`);
    await page.getByTestId("back-to-parent-map").click();
    await expect(page).toHaveURL(new RegExp(`/map/${world.slug}$`));
  });

  test("[TC-MREG-037] a player gets the same link; the DM chooses the city map from the pin's preview, and can take it away", async ({ page, browser }) => {
    test.slow();
    const world = await makeMap("w2");
    const city = await makeMap("c2");
    const place = await makePage("cp2");
    const pid = await pin(world, place, 0.5, 0.5);
    await open(page, world);
    await page.locator("[data-pin]").click();
    const others = await query<{ name: string }>(`SELECT name FROM maps WHERE id <> $1 ORDER BY name`, [world.id]);
    expect((await page.locator("#pin-child option").allTextContents()).sort()).toEqual(["No other map", ...others.map((o) => o.name)].sort());
    await page.locator("#pin-child").selectOption(city.id);
    await expect.poll(async () => (await query<{ child_map_id: string | null }>(`SELECT child_map_id FROM map_pins WHERE id = $1`, [pid]))[0].child_map_id).toBe(city.id);
    const { context, page: pp } = await reader(browser);
    try {
      await open(pp, world);
      await pp.locator("[data-pin]").click();
      await expect(pp.getByTestId("open-child-map")).toContainText(city.name);
      await expect(pp.locator("#pin-child")).toHaveCount(0);
    } finally {
      await context.close();
    }
    await open(page, world);
    await page.locator("[data-pin]").click();
    await page.locator("#pin-child").selectOption("");
    await expect.poll(async () => (await query<{ child_map_id: string | null }>(`SELECT child_map_id FROM map_pins WHERE id = $1`, [pid]))[0].child_map_id).toBeNull();
  });

  test("[TC-MREG-038] the DM's choice of map leaves out the map the pin is on", async ({ page }) => {
    test.slow();
    const world = await makeMap("w3");
    const place = await makePage("cp3");
    await pin(world, place, 0.5, 0.5);
    await open(page, world);
    await page.locator("[data-pin]").click();
    await expect(page.locator("#pin-child option", { hasText: world.name })).toHaveCount(0);
  });

  test("[TC-MREG-039] a loop is refused when chosen in the preview, and the pin is left as it was", async ({ page }) => {
    test.slow();
    const a = await makeMap("la");
    const b = await makeMap("lb");
    const place = await makePage("loop1");
    await pin(a, place, 0.5, 0.5, null, b.id);
    const pb = await pin(b, place, 0.5, 0.5);
    await open(page, b);
    await page.locator("[data-pin]").click();
    await page.locator("#pin-child").selectOption(a.id);
    await expect(page.getByText(/open each other/)).toBeVisible();
    expect((await query<{ child_map_id: string | null }>(`SELECT child_map_id FROM map_pins WHERE id = $1`, [pb]))[0].child_map_id).toBeNull();
  });
});

test.describe("registering a map image", () => {
  const pngBuf = (w: number, h: number) => {
    // A valid PNG: the signature, an IHDR for w by h, one IDAT of zeroed pixels, and IEND.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const zlib = require("node:zlib") as typeof import("node:zlib");
    const chunk = (type: string, data: Buffer) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(zlib.crc32(body) >>> 0);
      return Buffer.concat([len, body, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    const raw = Buffer.alloc((w * 4 + 1) * h);
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
  };

  test("[TC-MREG-040] the seed script registers a new image with its real size and a name from its file name, leaves registered maps alone, and skips a file it cannot read", async () => {
    test.slow();
    const dir = path.join(ROOT, "public", "maps");
    const good = `zz-playwright-city-${tag}.png`;
    const bad = `zz-playwright-bad-${tag}.png`;
    fs.writeFileSync(path.join(dir, good), pngBuf(64, 48));
    fs.writeFileSync(path.join(dir, bad), Buffer.from("this is not an image"));
    const { spawnSync } = await import("node:child_process");
    const run = () => {
      const r = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["tsx", "scripts/seed-maps.ts"], { cwd: ROOT, encoding: "utf8", shell: process.platform === "win32", env: { ...process.env } });
      expect(r.status, r.stderr).toBe(0);
      return `${r.stdout}
${r.stderr}`;
    };
    try {
      const first = run();
      expect(first).toContain(`registered (64x48)`);
      expect(first).toContain(`skipped ${bad}`);
      const rows = await query<{ slug: string; name: string; width: number; height: number; image_path: string }>(`SELECT slug, name, width, height, image_path FROM maps WHERE image_path = $1`, [`/maps/${good}`]);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ width: 64, height: 48, slug: `zz-playwright-city-${tag}` });
      expect(rows[0].name).toBe(`Zz Playwright City ${tag.charAt(0).toUpperCase()}${tag.slice(1)}`);
      const second = run();
      expect(second).toContain("already registered");
      expect(await query(`SELECT 1 FROM maps WHERE image_path = $1`, [`/maps/${good}`])).toHaveLength(1);
      expect((await query<{ n: number }>(`SELECT count(*)::int AS n FROM maps WHERE slug = 'wip-map'`))[0].n).toBe(1);
    } finally {
      fs.rmSync(path.join(dir, good), { force: true });
      fs.rmSync(path.join(dir, bad), { force: true });
      await query(`DELETE FROM maps WHERE image_path = $1`, [`/maps/${good}`]);
    }
  });
});

test.describe("accessibility and small screens", () => {
  for (const theme of ["dark", "light"] as const) {
    test(tc("map-regions.spec.ts", "accessibility and small screens", `a map with regions, layers, a preview and the drawing controls has no serious axe violations (${theme})`), async ({ page }) => {
      test.slow();
      await page.addInitScript((t) => localStorage.setItem("asetheria-theme", t), theme);
      const map = await makeMap(`ax-${theme}`);
      const a = await makePage(`ax-${theme}`);
      const lid = await layer(map, "Roads");
      await region(map, "Axe region", SQUARE, { entry: a, layerId: lid });
      await pin(map, a, 0.7, 0.7, lid);
      await open(page, map);
      await clickAt(page, 0.3, 0.3);
      await page.waitForTimeout(400);
      let results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help} -> ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
      await page.getByTestId("draw-region").click();
      for (const [x, y] of [[0.1, 0.1], [0.2, 0.1], [0.15, 0.2]]) await clickAt(page, x, y);
      results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help} -> ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
    });
  }

  test("[TC-MREG-043] at 375px the map, its layers, regions list and controls do not scroll the page sideways", async ({ browser }) => {
    test.slow();
    const map = await makeMap("small");
    const a = await makePage("small");
    const lid = await layer(map, "A layer with a fairly long name to wrap");
    await region(map, "A region with a long name that has to wrap on a small screen", SQUARE, { entry: a, layerId: lid });
    const context = await browser.newContext({ storageState: "tests/.auth/dm.json", viewport: { width: 375, height: 800 } });
    const page = await context.newPage();
    try {
      await open(page, map);
      await page.getByTestId("draw-region").click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    } finally {
      await context.close();
    }
  });
});
