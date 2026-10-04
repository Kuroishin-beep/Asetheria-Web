import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { closeDbHelpers, createTestPlayer, deleteTestUser, query } from "./db-helpers";

/**
 * Phase 8b (ENH-07b): an interactive map with pins. R6 is the risk: a pin must
 * never leak a hidden entry's name, id, slug or position to someone who may not
 * see it, in the page, the data it loads, or the pins API.
 */

const ROOT = path.join(__dirname, "..");
const PASSWORD = "correct horse battery staple 42";
const tag = randomUUID().slice(0, 8);
const MAP_SLUG = `zz-map-${tag}`;
const SRC = "test: map";
const slugOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const users: string[] = [];

let mapId = "";
const ids: Record<string, string> = {};

const OPEN = `Zz Open Place ${tag}`;
const SECRET = `Zz Secret Place ${tag}`;
const UNGRANTED = `Zz Ungranted Item ${tag}`;
const ARCHIVED = `Zz Archived Place ${tag}`;
const TARGET = `Zz Target Place ${tag}`;
const SECRET_X = 0.123456;
const SECRET_Y = 0.654321;

async function entry(name: string, kind: string, visibility = "public", summary = "A fixture place.") {
  const rows = await query<{ id: string }>(
    `INSERT INTO entries (slug, kind, name, summary, visibility, source_path) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [slugOf(name), kind, name, summary, visibility, SRC],
  );
  ids[name] = rows[0].id;
  return rows[0].id;
}

async function pin(entryId: string, x: number, y: number, label: string | null = null) {
  await query(`INSERT INTO map_pins (map_id, entry_id, x, y, label) VALUES ($1, $2, $3, $4, $5)`, [mapId, entryId, x, y, label]);
}

async function playerWith(kinds: string[]): Promise<string> {
  const username = `zz-map-${randomUUID().slice(0, 8)}`;
  const id = await createTestPlayer(username, PASSWORD);
  users.push(id);
  await query(`UPDATE users SET display_name = 'Map Tester' WHERE id = $1`, [id]);
  for (const kind of kinds) await query(`INSERT INTO entry_grants (user_id, kind, granted) VALUES ($1, $2, true)`, [id, kind]);
  return username;
}

async function login(browser: Browser, username: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  expect((await page.request.post("/api/auth/login", { data: { username, password: PASSWORD } })).ok()).toBe(true);
  return { context, page };
}

test.beforeAll(async () => {
  mapId = (
    await query<{ id: string }>(
      `INSERT INTO maps (slug, name, image_path, width, height) VALUES ($1, $2, '/maps/wip-map.png', 2250, 1200) RETURNING id`,
      [MAP_SLUG, `Zz Test Map ${tag}`],
    )
  )[0].id;
  await pin(await entry(OPEN, "location", "public", "The open place's summary."), 0.25, 0.4);
  await pin(await entry(SECRET, "location", "secret"), SECRET_X, SECRET_Y);
  await pin(await entry(UNGRANTED, "ore", "public"), 0.7, 0.2);
  await pin(await entry(ARCHIVED, "location", "public"), 0.5, 0.5);
  await query(`UPDATE entries SET archived_at = now() WHERE id = $1`, [ids[ARCHIVED]]);
  await entry(TARGET, "location", "public");
});

test.afterAll(async () => {
  await query(`DELETE FROM maps WHERE slug = $1`, [MAP_SLUG]);
  await query(`DELETE FROM entries WHERE source_path = $1`, [SRC]);
  for (const id of users) await deleteTestUser(id);
  await closeDbHelpers();
});

test.describe("schema and rollback", () => {
  test("both tables exist, coordinates are range-checked by the database, and a pin cannot outlive its map", async () => {
    const tables = await query<{ t: string }>(`SELECT to_regclass('maps')::text AS t UNION ALL SELECT to_regclass('map_pins')::text`);
    expect(tables.map((r) => r.t)).toEqual(["maps", "map_pins"]);
    for (const [x, y] of [[1.01, 0.5], [-0.01, 0.5], [0.5, 1.5], [0.5, -1]]) {
      await expect(
        query(`INSERT INTO map_pins (map_id, entry_id, x, y) VALUES ($1, $2, $3, $4)`, [mapId, ids[TARGET], x, y]),
        `${x},${y}`,
      ).rejects.toThrow(/map_pins_(x|y)_range/);
    }
    // The edges 0 and 1 are valid.
    await query(`INSERT INTO map_pins (map_id, entry_id, x, y) VALUES ($1, $2, 0, 1)`, [mapId, ids[TARGET]]);
    await query(`DELETE FROM map_pins WHERE entry_id = $1`, [ids[TARGET]]);
  });

  test("the rollback script drops both tables and nothing else (run inside a transaction that is rolled back)", async () => {
    const url = process.env.DATABASE_URL ?? "";
    expect(url).not.toMatch(/neon\.tech|neon\.build/);
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      await client.query("BEGIN");
      const before = Number((await client.query(`SELECT count(*)::int AS n FROM entries`)).rows[0].n);
      await client.query(fs.readFileSync(path.join(ROOT, "scripts", "sql", "maps-rollback.sql"), "utf8"));
      const gone = (await client.query(`SELECT to_regclass('maps')::text AS a, to_regclass('map_pins')::text AS b`)).rows[0];
      expect(gone).toEqual({ a: null, b: null });
      expect(Number((await client.query(`SELECT count(*)::int AS n FROM entries`)).rows[0].n)).toBe(before);
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
    expect((await query<{ t: string }>(`SELECT to_regclass('map_pins')::text AS t`))[0].t).toBe("map_pins");
  });

  test("the migration is idempotent", async () => {
    const url = process.env.DATABASE_URL ?? "";
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      await client.query(fs.readFileSync(path.join(ROOT, "scripts", "sql", "maps.sql"), "utf8"));
      await client.query(fs.readFileSync(path.join(ROOT, "scripts", "sql", "maps.sql"), "utf8"));
    } finally {
      await client.end();
    }
  });

  test("the first map is registered at the size of its image file, and the file is served only to signed-in users", async ({ request, browser }) => {
    const rows = await query<{ slug: string; width: number; height: number; image_path: string }>(`SELECT slug, width, height, image_path FROM maps WHERE slug = 'wip-map'`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ width: 2250, height: 1200, image_path: "/maps/wip-map.png" });
    const png = fs.readFileSync(path.join(ROOT, "public", "maps", "wip-map.png"));
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([2250, 1200]);
    // The map is part of the private campaign: signed-out callers are bounced, signed-in ones get the image.
    const anon = await request.get("/maps/wip-map.png", { maxRedirects: 0 });
    expect([301, 302, 303, 307, 308]).toContain(anon.status());
    const dm = await browser.newContext({ storageState: "tests/.auth/dm.json" });
    try {
      const res = await dm.request.get("/maps/wip-map.png");
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toContain("image/png");
    } finally {
      await dm.close();
    }
  });
});

test.describe("pins API", () => {
  test.describe("DM", () => {
    test.use({ storageState: "tests/.auth/dm.json" });

    test("creates a pin at exact coordinates, including the edges 0 and 1, and lists it back", async ({ request }) => {
      for (const [x, y] of [[0, 0], [1, 1], [0.5, 0.25]]) {
        const res = await request.post(`/api/maps/${MAP_SLUG}/pins`, { data: { entryId: ids[TARGET], x, y, label: "  Edge  " } });
        expect(res.status(), `${x},${y}`).toBe(201);
      }
      const rows = await query<{ x: number; y: number; label: string }>(`SELECT x, y, label FROM map_pins WHERE entry_id = $1 ORDER BY x`, [ids[TARGET]]);
      expect(rows.map((r) => [r.x, r.y])).toEqual([[0, 0], [0.5, 0.25], [1, 1]]);
      expect(rows[0].label).toBe("Edge");
      const list = (await (await request.get(`/api/maps/${MAP_SLUG}/pins`)).json()) as { pins: { entry: { slug: string } }[] };
      expect(list.pins.filter((p) => p.entry.slug === slugOf(TARGET))).toHaveLength(3);
      await query(`DELETE FROM map_pins WHERE entry_id = $1`, [ids[TARGET]]);
    });

    test("rejects bad coordinates, bad ids, an unknown map and an unknown entry", async ({ request }) => {
      const post = (data: unknown, slug = MAP_SLUG) => request.post(`/api/maps/${slug}/pins`, { data });
      for (const bad of [
        { entryId: ids[TARGET], x: 1.0001, y: 0.5 },
        { entryId: ids[TARGET], x: -0.1, y: 0.5 },
        { entryId: ids[TARGET], x: "0.5", y: 0.5 },
        { entryId: ids[TARGET], x: null, y: 0.5 },
        { entryId: ids[TARGET], x: 0.5 },
        { entryId: "not-a-uuid", x: 0.5, y: 0.5 },
        { entryId: ids[TARGET], x: 0.5, y: 0.5, label: "x".repeat(121) },
      ]) {
        expect((await post(bad)).status(), JSON.stringify(bad)).toBe(400);
      }
      expect((await request.post(`/api/maps/${MAP_SLUG}/pins`, { data: "{not json", headers: { "content-type": "application/json" } })).status()).toBe(400);
      expect((await post({ entryId: ids[TARGET], x: 0.5, y: 0.5 }, "no-such-map")).status()).toBe(404);
      expect((await post({ entryId: randomUUID(), x: 0.5, y: 0.5 })).status()).toBe(404);
      expect((await post({ entryId: ids[ARCHIVED], x: 0.5, y: 0.5 })).status()).toBe(404);
      const none = await query<{ n: string }>(`SELECT count(*)::text AS n FROM map_pins WHERE entry_id = $1`, [ids[TARGET]]);
      expect(none[0].n).toBe("0");
    });

    test("deletes a pin, only on its own map, and not twice", async ({ request }) => {
      const created = await request.post(`/api/maps/${MAP_SLUG}/pins`, { data: { entryId: ids[TARGET], x: 0.3, y: 0.3 } });
      const { id } = (await created.json()) as { id: string };
      expect((await request.delete(`/api/maps/wip-map/pins/${id}`)).status()).toBe(404);
      expect((await request.delete(`/api/maps/${MAP_SLUG}/pins/not-a-uuid`)).status()).toBe(400);
      expect((await request.delete(`/api/maps/${MAP_SLUG}/pins/${id}`)).status()).toBe(200);
      expect((await request.delete(`/api/maps/${MAP_SLUG}/pins/${id}`)).status()).toBe(404);
    });
  });

  test("signed-out callers get 401 on every method", async ({ request }) => {
    const headers = { cookie: "" };
    expect((await request.get(`/api/maps/${MAP_SLUG}/pins`, { headers })).status()).toBe(401);
    expect((await request.post(`/api/maps/${MAP_SLUG}/pins`, { headers, data: { entryId: ids[TARGET], x: 0.5, y: 0.5 } })).status()).toBe(401);
    expect((await request.delete(`/api/maps/${MAP_SLUG}/pins/${randomUUID()}`, { headers })).status()).toBe(401);
  });

  test("a player may read pins but cannot create or delete them", async ({ browser }) => {
    const { context, page } = await login(browser, await playerWith(["location"]));
    try {
      expect((await page.request.get(`/api/maps/${MAP_SLUG}/pins`)).status()).toBe(200);
      const made = await page.request.post(`/api/maps/${MAP_SLUG}/pins`, { data: { entryId: ids[TARGET], x: 0.5, y: 0.5 } });
      expect(made.status()).toBe(403);
      const del = await page.request.delete(`/api/maps/${MAP_SLUG}/pins/${randomUUID()}`);
      expect(del.status()).toBe(403);
      const n = await query<{ n: string }>(`SELECT count(*)::text AS n FROM map_pins WHERE entry_id = $1`, [ids[TARGET]]);
      expect(n[0].n).toBe("0");
    } finally {
      await context.close();
    }
  });
});

test.describe("what each person sees (R6)", () => {
  test.describe("DM", () => {
    test.use({ storageState: "tests/.auth/dm.json" });

    test("sees the pins of secret and ungranted entries, but not the archived one", async ({ page }) => {
      await page.goto(`/map/${MAP_SLUG}`);
      await expect(page.locator(`[data-pin-entry="${slugOf(OPEN)}"]`)).toHaveCount(1);
      await expect(page.locator(`[data-pin-entry="${slugOf(SECRET)}"]`)).toHaveCount(1);
      await expect(page.locator(`[data-pin-entry="${slugOf(UNGRANTED)}"]`)).toHaveCount(1);
      await expect(page.locator(`[data-pin-entry="${slugOf(ARCHIVED)}"]`)).toHaveCount(0);
    });
  });

  test("a player sees only the pins whose entries they can read, and nothing of the others is in the HTML, the data or the API", async ({ browser }) => {
    const { context, page } = await login(browser, await playerWith(["location"]));
    try {
      const bodies: string[] = [];
      page.on("response", async (r) => {
        const url = r.url();
        if (url.includes(`/map/${MAP_SLUG}`) || url.includes(`/api/maps/${MAP_SLUG}`)) bodies.push(await r.text().catch(() => ""));
      });
      await page.goto(`/map/${MAP_SLUG}`);
      await expect(page.locator(`[data-pin-entry="${slugOf(OPEN)}"]`)).toHaveCount(1);
      await expect(page.locator("[data-pin]")).toHaveCount(1);

      const api = await page.request.get(`/api/maps/${MAP_SLUG}/pins`);
      bodies.push(await api.text());
      bodies.push(await page.content());
      const everything = bodies.join("\n");
      for (const hidden of [SECRET, UNGRANTED, ARCHIVED, slugOf(SECRET), slugOf(UNGRANTED), slugOf(ARCHIVED), ids[SECRET], ids[UNGRANTED], String(SECRET_X), String(SECRET_Y)]) {
        expect(everything, `leaked: ${hidden}`).not.toContain(hidden);
      }
      expect(everything).toContain(OPEN);
    } finally {
      await context.close();
    }
  });

  test("a player with no grant on locations sees a map with no pins", async ({ browser }) => {
    const { context, page } = await login(browser, await playerWith(["note"]));
    try {
      await page.goto(`/map/${MAP_SLUG}`);
      await expect(page.getByTestId("map-viewport")).toBeVisible();
      await expect(page.locator("[data-pin]")).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("granting the ore kind to a player reveals that pin to them", async ({ browser }) => {
    const { context, page } = await login(browser, await playerWith(["location", "ore"]));
    try {
      await page.goto(`/map/${MAP_SLUG}`);
      await expect(page.locator(`[data-pin-entry="${slugOf(UNGRANTED)}"]`)).toHaveCount(1);
      await expect(page.locator(`[data-pin-entry="${slugOf(SECRET)}"]`)).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("an unknown map is a 404", async ({ browser }) => {
    const { context, page } = await login(browser, await playerWith(["location"]));
    try {
      expect((await page.goto("/map/no-such-map"))?.status()).toBe(404);
    } finally {
      await context.close();
    }
  });
});

test.describe("cascade", () => {
  test("deleting an entry removes its pins", async () => {
    const id = await entry(`Zz Doomed ${tag}`, "location");
    await pin(id, 0.9, 0.9);
    const before = await query<{ n: string }>(`SELECT count(*)::text AS n FROM map_pins WHERE entry_id = $1`, [id]);
    expect(before[0].n).toBe("1");
    await query(`DELETE FROM entries WHERE id = $1`, [id]);
    const after = await query<{ n: string }>(`SELECT count(*)::text AS n FROM map_pins WHERE entry_id = $1`, [id]);
    expect(after[0].n).toBe("0");
  });

  test("deleting a map removes its pins and leaves the entries", async () => {
    const m = (await query<{ id: string }>(`INSERT INTO maps (slug, name, image_path, width, height) VALUES ($1, 'Temp', '/maps/wip-map.png', 10, 10) RETURNING id`, [`zz-temp-${tag}`]))[0].id;
    await query(`INSERT INTO map_pins (map_id, entry_id, x, y) VALUES ($1, $2, 0.1, 0.1)`, [m, ids[TARGET]]);
    await query(`DELETE FROM maps WHERE id = $1`, [m]);
    expect((await query<{ n: string }>(`SELECT count(*)::text AS n FROM map_pins WHERE map_id = $1`, [m]))[0].n).toBe("0");
    expect((await query<{ n: string }>(`SELECT count(*)::text AS n FROM entries WHERE id = $1`, [ids[TARGET]]))[0].n).toBe("1");
  });
});

/** Clicks a pin until its preview is open: a click that lands before the page has hydrated is simply lost. */
async function openPin(page: Page, slug: string) {
  const card = page.getByRole("region", { name: "Pin preview" });
  await expect(async () => {
    if (!(await card.isVisible())) await page.locator(`[data-pin-entry="${slug}"]`).click();
    await expect(card).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15000 });
}

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error("no bounding box");
  return b;
}

test.describe("DM placing a pin", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("click the map, pick an entry, and the pin saves within 1% of where it was clicked", async ({ page }) => {
    await page.goto(`/map/${MAP_SLUG}`);
    await page.getByRole("button", { name: "Place a pin" }).click();
    const stage = await box(page.getByTestId("map-stage"));
    const fx = 0.3;
    const fy = 0.6;
    await page.mouse.click(stage.x + stage.width * fx, stage.y + stage.height * fy);

    await expect(page.getByTestId("pending-pin")).toBeVisible();
    await page.getByRole("textbox", { name: "Find the entry to pin" }).fill(TARGET);
    await page.getByRole("button", { name: new RegExp(TARGET) }).first().click();
    await expect(page.getByTestId("chosen-entry")).toContainText(TARGET);
    await page.getByRole("button", { name: "Save pin" }).click();
    await expect(page.locator(`[data-pin-entry="${slugOf(TARGET)}"]`)).toHaveCount(1);

    const rows = await query<{ x: number; y: number }>(`SELECT x, y FROM map_pins WHERE entry_id = $1`, [ids[TARGET]]);
    expect(rows).toHaveLength(1);
    expect(Math.abs(rows[0].x - fx)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(rows[0].y - fy)).toBeLessThanOrEqual(0.01);
    await query(`DELETE FROM map_pins WHERE entry_id = $1`, [ids[TARGET]]);
  });

  test("the position is still right after zooming in and panning (it is a fraction of the image, not the screen)", async ({ page }) => {
    await page.goto(`/map/${MAP_SLUG}`);
    const viewport = page.getByTestId("map-viewport");
    await viewport.focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press("+");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowDown");
    expect(Number(await viewport.getAttribute("data-scale"))).toBeGreaterThan(2);

    await page.getByRole("button", { name: "Place a pin" }).click();
    const vp = await box(viewport);
    const clickX = vp.x + vp.width * 0.5;
    const clickY = vp.y + vp.height * 0.5;
    // Where that screen point lies on the image, from the stage's own box.
    const stage = await box(page.getByTestId("map-stage"));
    const expectedX = (clickX - stage.x) / stage.width;
    const expectedY = (clickY - stage.y) / stage.height;
    await page.mouse.click(clickX, clickY);
    await page.getByRole("textbox", { name: "Find the entry to pin" }).fill(TARGET);
    await page.getByRole("button", { name: new RegExp(TARGET) }).first().click();
    await page.getByRole("button", { name: "Save pin" }).click();
    await expect(page.locator(`[data-pin-entry="${slugOf(TARGET)}"]`)).toHaveCount(1);
    const rows = await query<{ x: number; y: number }>(`SELECT x, y FROM map_pins WHERE entry_id = $1`, [ids[TARGET]]);
    expect(Math.abs(rows[0].x - expectedX)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(rows[0].y - expectedY)).toBeLessThanOrEqual(0.01);
    await query(`DELETE FROM map_pins WHERE entry_id = $1`, [ids[TARGET]]);
  });

  test("Save is disabled until an entry is chosen, and Cancel saves nothing", async ({ page }) => {
    await page.goto(`/map/${MAP_SLUG}`);
    await page.getByRole("button", { name: "Place a pin" }).click();
    const stage = await box(page.getByTestId("map-stage"));
    await page.mouse.click(stage.x + stage.width * 0.4, stage.y + stage.height * 0.4);
    await expect(page.getByRole("button", { name: "Save pin" })).toBeDisabled();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("pending-pin")).toHaveCount(0);
    const n = await query<{ n: string }>(`SELECT count(*)::text AS n FROM map_pins WHERE entry_id = $1`, [ids[TARGET]]);
    expect(n[0].n).toBe("0");
  });

  test("a DM can remove a pin from its preview card", async ({ page }) => {
    await query(`INSERT INTO map_pins (map_id, entry_id, x, y) VALUES ($1, $2, 0.8, 0.8)`, [mapId, ids[TARGET]]);
    await page.goto(`/map/${MAP_SLUG}`);
    await openPin(page, slugOf(TARGET));
    await page.getByRole("button", { name: "Remove pin" }).click();
    await expect(page.locator(`[data-pin-entry="${slugOf(TARGET)}"]`)).toHaveCount(0);
    const n = await query<{ n: string }>(`SELECT count(*)::text AS n FROM map_pins WHERE entry_id = $1`, [ids[TARGET]]);
    expect(n[0].n).toBe("0");
  });
});

test.describe("pins and the preview card", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("clicking a pin opens a preview with the name and summary, and Open page goes to the entry", async ({ page }) => {
    await page.goto(`/map/${MAP_SLUG}`);
    await openPin(page, slugOf(OPEN));
    const card = page.getByRole("region", { name: "Pin preview" });
    await expect(card).toContainText(OPEN);
    await expect(card).toContainText("The open place's summary.");
    await card.getByRole("link", { name: "Open page" }).click();
    await expect(page).toHaveURL(new RegExp(`/codex/entry/${slugOf(OPEN)}$`));
  });

  test("Escape and the close button dismiss the preview", async ({ page }) => {
    await page.goto(`/map/${MAP_SLUG}`);
    const pinButton = page.locator(`[data-pin-entry="${slugOf(OPEN)}"]`);
    await openPin(page, slugOf(OPEN));
    const card = page.getByRole("region", { name: "Pin preview" });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Close preview" }).click();
    await expect(card).toHaveCount(0);
    await pinButton.focus();
    await page.keyboard.press("Enter");
    await expect(card).toBeVisible();
    await page.getByTestId("map-viewport").focus();
    await page.keyboard.press("Escape");
    await expect(card).toHaveCount(0);
  });

  test("a keyboard user can reach a pin with Tab and open it with Enter", async ({ page }) => {
    await page.goto(`/map/${MAP_SLUG}`);
    await page.locator(`[data-pin-entry="${slugOf(OPEN)}"]`).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("region", { name: "Pin preview" })).toContainText(OPEN);
  });

  test("every pin is also in a plain list below the map", async ({ page }) => {
    await page.goto(`/map/${MAP_SLUG}`);
    await expect(page.getByRole("heading", { name: /On this map/ })).toBeVisible();
    await expect(page.getByRole("link", { name: OPEN })).toBeVisible();
  });
});

async function pinch(page: Page, target: Locator, from: number, to: number) {
  const b = await box(target);
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  await target.evaluate(
    (el, p) => {
      const fire = (type: string, id: number, x: number, y: number) =>
        el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: "touch", clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: id === 1 }));
      fire("pointerdown", 1, p.cx - p.from, p.cy);
      fire("pointerdown", 2, p.cx + p.from, p.cy);
      for (let i = 1; i <= 5; i++) {
        const d = p.from + ((p.to - p.from) * i) / 5;
        fire("pointermove", 1, p.cx - d, p.cy);
        fire("pointermove", 2, p.cx + d, p.cy);
      }
      fire("pointerup", 2, p.cx + p.to, p.cy);
      fire("pointerup", 1, p.cx - p.to, p.cy);
    },
    { cx, cy, from, to },
  );
  void page;
}

test.describe("pan and zoom", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("the keyboard zooms with + and -, resets with 0, and pans with the arrows without leaving the picture", async ({ page }) => {
    await page.goto(`/map/${MAP_SLUG}`);
    const vp = page.getByTestId("map-viewport");
    await vp.focus();
    const scale = async () => Number(await vp.getAttribute("data-scale"));
    const tx = async () => Number(await vp.getAttribute("data-tx"));
    const ty = async () => Number(await vp.getAttribute("data-ty"));

    expect(await scale()).toBe(1);
    await page.keyboard.press("+");
    const zoomed = await scale();
    expect(zoomed).toBeGreaterThan(1);
    await page.keyboard.press("=");
    expect(await scale()).toBeGreaterThan(zoomed);
    await page.keyboard.press("-");
    expect(await scale()).toBeCloseTo(zoomed, 1);
    await page.keyboard.press("_");
    expect(await scale()).toBe(1);

    // At 1x the picture fills the frame: nothing to pan. Zoom in, then move.
    await page.keyboard.press("+");
    await page.keyboard.press("+");
    const x0 = await tx();
    await page.keyboard.press("ArrowRight");
    expect(await tx()).toBeLessThan(x0);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    expect(await tx()).toBeLessThanOrEqual(0);
    for (let i = 0; i < 40; i++) await page.keyboard.press("ArrowDown");
    const size = await box(vp);
    const stage = await box(page.getByTestId("map-stage"));
    expect(stage.y + stage.height).toBeGreaterThanOrEqual(size.y + size.height - 1);
    for (let i = 0; i < 40; i++) await page.keyboard.press("ArrowUp");
    expect(await ty()).toBe(0);

    await page.keyboard.press("0");
    expect(await scale()).toBe(1);
    expect(await tx()).toBe(0);
  });

  test("the zoom stays between 100% and 800%", async ({ page }) => {
    await page.goto(`/map/${MAP_SLUG}`);
    const vp = page.getByTestId("map-viewport");
    await vp.focus();
    for (let i = 0; i < 30; i++) await page.keyboard.press("+");
    expect(Number(await vp.getAttribute("data-scale"))).toBeLessThanOrEqual(8.001);
    for (let i = 0; i < 40; i++) await page.keyboard.press("-");
    expect(Number(await vp.getAttribute("data-scale"))).toBe(1);
  });

  test("the zoom buttons and reset work with the mouse, and the wheel zooms", async ({ page }) => {
    await page.goto(`/map/${MAP_SLUG}`);
    const vp = page.getByTestId("map-viewport");
    await page.getByRole("button", { name: "Zoom in" }).click();
    expect(Number(await vp.getAttribute("data-scale"))).toBeGreaterThan(1);
    await page.getByRole("button", { name: "Reset view" }).click();
    expect(Number(await vp.getAttribute("data-scale"))).toBe(1);
    const b = await box(vp);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.wheel(0, -300);
    await expect.poll(async () => Number(await vp.getAttribute("data-scale"))).toBeGreaterThan(1);
  });

  test("dragging pans a zoomed map, and a drag does not open anything", async ({ page }) => {
    await page.goto(`/map/${MAP_SLUG}`);
    const vp = page.getByTestId("map-viewport");
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.getByRole("button", { name: "Zoom in" }).click();
    const b = await box(vp);
    const before = Number(await vp.getAttribute("data-tx"));
    await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.5, { steps: 8 });
    await page.mouse.up();
    expect(Number(await vp.getAttribute("data-tx"))).toBeLessThan(before);
    await expect(page.getByRole("region", { name: "Pin preview" })).toHaveCount(0);
  });

  test("a two-finger pinch zooms in and out (touch pointer events)", async ({ page }) => {
    await page.goto(`/map/${MAP_SLUG}`);
    const vp = page.getByTestId("map-viewport");
    await pinch(page, vp, 40, 160);
    const zoomed = Number(await vp.getAttribute("data-scale"));
    expect(zoomed).toBeGreaterThan(2);
    await pinch(page, vp, 160, 40);
    expect(Number(await vp.getAttribute("data-scale"))).toBeLessThan(zoomed);
  });

  test("pins keep the same on-screen size at any zoom", async ({ page }) => {
    await page.goto(`/map/${MAP_SLUG}`);
    const pinEl = page.locator(`[data-pin-entry="${slugOf(OPEN)}"]`);
    const w1 = (await box(pinEl)).width;
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Zoom in" }).click();
    const w2 = (await box(pinEl)).width;
    expect(Math.abs(w2 - w1)).toBeLessThan(1.5);
  });
});

test.describe("real touch input (browser touch events)", () => {
  test.use({ storageState: "tests/.auth/dm.json", hasTouch: true, viewport: { width: 390, height: 800 } });

  test("a real two-finger spread zooms in, and a one-finger drag then pans", async ({ page }) => {
    await page.goto(`/map/${MAP_SLUG}`);
    const vp = page.getByTestId("map-viewport");
    await vp.scrollIntoViewIfNeeded();
    const b = await box(vp);
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", points: { x: number; y: number; id: number }[]) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : points.map((p) => ({ x: p.x, y: p.y, id: p.id })) });

    await touch("touchStart", [{ x: cx - 30, y: cy, id: 1 }, { x: cx + 30, y: cy, id: 2 }]);
    for (let i = 1; i <= 8; i++) {
      await touch("touchMove", [{ x: cx - 30 - i * 12, y: cy, id: 1 }, { x: cx + 30 + i * 12, y: cy, id: 2 }]);
    }
    await touch("touchEnd", []);
    const zoomed = Number(await vp.getAttribute("data-scale"));
    expect(zoomed).toBeGreaterThan(1.5);

    const before = Number(await vp.getAttribute("data-tx"));
    await touch("touchStart", [{ x: cx + 60, y: cy, id: 1 }]);
    for (let i = 1; i <= 8; i++) await touch("touchMove", [{ x: cx + 60 - i * 12, y: cy, id: 1 }]);
    await touch("touchEnd", []);
    expect(Number(await vp.getAttribute("data-tx"))).toBeLessThan(before);
  });
});

test.describe("small screens", () => {
  test.use({ storageState: "tests/.auth/dm.json", viewport: { width: 375, height: 800 } });

  test("at 375px the map fits and the page does not scroll sideways", async ({ page }) => {
    await page.goto(`/map/${MAP_SLUG}`);
    await expect(page.getByTestId("map-viewport")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const vp = await box(page.getByTestId("map-viewport"));
    expect(vp.width).toBeLessThanOrEqual(375);
  });
});

test.describe("navigation", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("the sidebar has a Map link, and /map opens the first map", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Map", exact: true }).first()).toBeVisible();
    await page.goto("/map");
    await expect(page).toHaveURL(/\/map\/[a-z0-9-]+$/);
    await expect(page.getByTestId("map-viewport")).toBeVisible();
  });
});
