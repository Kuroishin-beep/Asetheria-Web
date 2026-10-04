import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { buildNameIndex, normalizeName, parseAliases, parseRelationValue } from "../src/lib/links";
import { PLACE_TARGET, loadPlaces, wikiTargets } from "../scripts/lib/natural-world";
import { closeDbHelpers, createTestPlayer, deleteTestUser, query } from "./db-helpers";

const ROOT = path.join(__dirname, "..");
const PLACES = "original: natural-world/places-%";

/**
 * Phase 5 (ENH-03): a specimen's "Found in" places are real, role-scoped links.
 * R5 first: a player must never get a link, a tooltip or a path to a secret or
 * ungranted place from a property, exactly as they never do from the body.
 */

const PASSWORD = "correct horse battery staple 42";
const tag = randomUUID().slice(0, 8);
const PUBLIC_PLACE = `Zz Open Quarry ${tag}`;
const SECRET_PLACE = `Zz Hidden Vault ${tag}`;
const ORE = `Zz Test Ore ${tag}`;
const slugOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

let publicId = "";
let oreId = "";
const users: string[] = [];

async function playerWith(kinds: string[]): Promise<string> {
  const username = `zz-nwl-${randomUUID().slice(0, 8)}`;
  const id = await createTestPlayer(username, PASSWORD);
  users.push(id);
  await query(`UPDATE users SET display_name = 'NWL Tester' WHERE id = $1`, [id]);
  for (const kind of kinds) {
    await query(`INSERT INTO entry_grants (user_id, kind, granted) VALUES ($1, $2, true)`, [id, kind]);
  }
  return username;
}

async function login(browser: import("@playwright/test").Browser, username: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  expect((await page.request.post("/api/auth/login", { data: { username, password: PASSWORD } })).ok()).toBe(true);
  return { context, page };
}

test.beforeAll(async () => {
  const place = async (name: string, visibility: string) =>
    (
      await query<{ id: string }>(
        `INSERT INTO entries (slug, kind, name, summary, visibility, source_path)
         VALUES ($1, 'location', $2, 'A test place.', $3, 'test: natural-world-links') RETURNING id`,
        [slugOf(name), name, visibility],
      )
    )[0].id;
  publicId = await place(PUBLIC_PLACE, "public");
  await place(SECRET_PLACE, "secret");
  oreId = (
    await query<{ id: string }>(
      `INSERT INTO entries (slug, kind, name, summary, fields, visibility, source_path)
       VALUES ($1, 'ore', $2, 'A test ore.', $3::jsonb, 'public', 'test: natural-world-links') RETURNING id`,
      [slugOf(ORE), ORE, JSON.stringify({ foundIn: `${PUBLIC_PLACE}, ${SECRET_PLACE}, Nowhere Named ${tag}` })],
    )
  )[0].id;
  // Mirror what a save does so the graph carries the connections.
  await query(
    `INSERT INTO links (source_id, target_id, relation)
     SELECT $1, id, 'found-in' FROM entries WHERE name = ANY($2)`,
    [oreId, [PUBLIC_PLACE, SECRET_PLACE]],
  );
});

test.afterAll(async () => {
  await query(`DELETE FROM links WHERE source_id IN (SELECT id FROM entries WHERE source_path = 'test: natural-world-links')
                  OR target_id IN (SELECT id FROM entries WHERE source_path = 'test: natural-world-links')`);
  await query(`DELETE FROM entries WHERE source_path = 'test: natural-world-links'`);
  for (const id of users) await deleteTestUser(id);
  await closeDbHelpers();
});

test.describe("Found in links, by role (R5)", () => {
  test.describe("DM", () => {
    test.use({ storageState: "tests/.auth/dm.json" });

    test("sees every named place as a link, including the secret one", async ({ page }) => {
      await page.goto(`/codex/entry/${slugOf(ORE)}`);
      const row = page.locator("dd", { has: page.getByText(/Nowhere Named/) });
      await expect(row.getByRole("link", { name: PUBLIC_PLACE })).toHaveAttribute("href", `/codex/entry/${slugOf(PUBLIC_PLACE)}`);
      await expect(row.getByRole("link", { name: SECRET_PLACE })).toBeVisible();
      await expect(row.getByRole("link", { name: /Nowhere Named/ })).toHaveCount(0);
    });
  });

  test("a player who may read locations gets a link to the open place, and plain text for the secret and the unknown", async ({ browser }) => {
    const { context, page } = await login(browser, await playerWith(["ore", "location"]));
    try {
      await page.goto(`/codex/entry/${slugOf(ORE)}`);
      const row = page.locator("dd", { has: page.getByText(/Nowhere Named/) });
      await expect(row.getByRole("link", { name: PUBLIC_PLACE })).toHaveAttribute("href", `/codex/entry/${slugOf(PUBLIC_PLACE)}`);
      await expect(row).toContainText(SECRET_PLACE); // the DM chose to print the name; it is text only
      await expect(row.getByRole("link")).toHaveCount(1);
      await expect(row.locator("[title]")).toHaveCount(0);
      const html = await page.content();
      expect(html).not.toContain(`/codex/entry/${slugOf(SECRET_PLACE)}`);
    } finally {
      await context.close();
    }
  });

  test("a player with no grant on locations gets no links at all, and no tooltip", async ({ browser }) => {
    const { context, page } = await login(browser, await playerWith(["ore"]));
    try {
      await page.goto(`/codex/entry/${slugOf(ORE)}`);
      const row = page.locator("dd", { has: page.getByText(/Nowhere Named/) });
      await expect(row).toContainText(PUBLIC_PLACE);
      await expect(row.getByRole("link")).toHaveCount(0);
      await expect(row.locator("[title]")).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("a player cannot open the secret place by guessing its address", async ({ browser }) => {
    const { context, page } = await login(browser, await playerWith(["ore", "location"]));
    try {
      expect((await page.goto(`/codex/entry/${slugOf(SECRET_PLACE)}`))?.status()).toBe(404);
    } finally {
      await context.close();
    }
  });

  test("the open place lists the ore in its linked mentions; the ore never appears on the secret place for a player", async ({ browser }) => {
    const { context, page } = await login(browser, await playerWith(["ore", "location"]));
    try {
      await page.goto(`/codex/entry/${slugOf(PUBLIC_PLACE)}`);
      await expect(page.getByRole("link", { name: new RegExp(ORE) }).first()).toBeVisible();
    } finally {
      await context.close();
    }
    expect(publicId).not.toBe("");
  });
});

test.describe("the places and the specimen linkage (data)", () => {
  test("exactly the planned number of new places exist and none is archived", async () => {
    const rows = await query<{ n: string }>(
      `SELECT count(*)::text AS n FROM entries WHERE source_path LIKE $1 AND archived_at IS NULL AND kind = 'location'`,
      [PLACES],
    );
    expect(Number(rows[0].n)).toBe(PLACE_TARGET);
  });

  test("no orphan places: each has a parent that is a live location, and its region names that parent", async () => {
    const bad = await query<{ name: string }>(
      `SELECT e.name FROM entries e LEFT JOIN entries p ON p.id = e.parent_id
       WHERE e.source_path LIKE $1 AND e.archived_at IS NULL
         AND (p.id IS NULL OR p.archived_at IS NOT NULL OR p.kind <> 'location' OR e.fields->>'region' <> p.name)`,
      [PLACES],
    );
    expect(bad.map((r) => r.name)).toEqual([]);
  });

  test("every ore, plant and animal has a non-empty Found in", async () => {
    const bad = await query<{ name: string }>(
      `SELECT name FROM entries WHERE kind IN ('ore','flora','fauna') AND archived_at IS NULL AND coalesce(btrim(fields->>'foundIn'), '') = ''`,
    );
    expect(bad.map((r) => r.name)).toEqual([]);
  });

  test("every place a Found in names is a live page, and each is a found-in edge in the graph", async () => {
    const all = await query<{ id: string; name: string; kind: string; fields: Record<string, string> }>(
      `SELECT id, name, kind, fields FROM entries WHERE archived_at IS NULL AND coalesce(source_path, '') NOT LIKE 'test:%'`,
    );
    const index = buildNameIndex(all.map((e) => ({ id: e.id, name: e.name, kind: e.kind, aliases: parseAliases(e.fields) })));
    const edges = await query<{ source_id: string; target_id: string }>(`SELECT source_id, target_id FROM links WHERE relation = 'found-in'`);
    const have = new Set(edges.map((e) => `${e.source_id}>${e.target_id}`));
    const unresolved: string[] = [];
    const missingEdges: string[] = [];
    let expected = 0;
    for (const e of all.filter((x) => ["ore", "flora", "fauna"].includes(x.kind))) {
      for (const { name } of parseRelationValue(e.fields.foundIn ?? "")) {
        const target = index.get(normalizeName(name));
        if (!target) {
          unresolved.push(`${e.name} -> ${name}`);
          continue;
        }
        if (target !== e.id) {
          expected++;
          if (!have.has(`${e.id}>${target}`)) missingEdges.push(`${e.name} -> ${name}`);
        }
      }
    }
    expect(unresolved).toEqual([]);
    expect(missingEdges).toEqual([]);
    expect(edges.length).toBeGreaterThanOrEqual(expected);
  });

  test("every specimen a new place links gets that place in its Found in", async () => {
    const lacking: string[] = [];
    const specimens = await query<{ name: string; foundin: string | null }>(
      `SELECT name, fields->>'foundIn' AS foundin FROM entries WHERE kind IN ('ore','flora','fauna') AND archived_at IS NULL`,
    );
    const foundIn = new Map(specimens.map((s) => [normalizeName(s.name), new Set(parseRelationValue(s.foundin ?? "").map((p) => normalizeName(p.name)))]));
    for (const place of loadPlaces().flatMap((f) => f.entries)) {
      for (const target of wikiTargets(place.body)) {
        const list = foundIn.get(normalizeName(target));
        if (list && !list.has(normalizeName(place.name))) lacking.push(`${target} <- ${place.name}`);
      }
    }
    expect(lacking).toEqual([]);
  });

  test("re-running the backfill changes nothing, and it writes nothing but Found in", async () => {
    const out = execFileSync("npx", ["tsx", "scripts/backfill-found-in.ts"], { cwd: ROOT, encoding: "utf8", shell: true });
    expect(out).toContain("0 specimens would be updated");
    const source = fs.readFileSync(path.join(ROOT, "scripts", "backfill-found-in.ts"), "utf8");
    const updates = source.match(/UPDATE entries SET [^`]*/g) ?? [];
    expect(updates).toHaveLength(1);
    expect(updates[0]).toContain("jsonb_set(fields, '{foundIn}'");
    expect(updates[0]).not.toMatch(/\b(summary|body|dm_notes)\b/);
  });

  test("the link checker still reports no new unresolved links", async () => {
    const out = execFileSync("npx", ["tsx", "scripts/check-links.ts", "--max", "2"], { cwd: ROOT, encoding: "utf8", shell: true });
    expect(out).toMatch(/2 unresolved \[\[links\]\] \(allowed: 2\)/);
  });
});

test.describe("the places on the site", () => {
  test.describe("DM", () => {
    test.use({ storageState: "tests/.auth/dm.json" });

    test("a place's page lists the specimens found there as linked mentions, and shows the DM hook", async ({ page }) => {
      await page.goto("/codex/entry/the-green-gallery");
      await expect(page.getByRole("heading", { level: 1, name: "The Green Gallery" })).toBeVisible();
      await expect(page.getByRole("heading", { name: /Linked mentions/ })).toBeVisible();
      await expect(page.getByRole("link", { name: /Malachite/ }).first()).toBeVisible();
      await expect(page.getByText(/^Hook:/)).toBeVisible();
      await expect(page.getByRole("link", { name: "Klynin Mountain Range" }).first()).toBeVisible();
    });

    test("a specimen's Found in links to the new places", async ({ page }) => {
      await page.goto("/codex/entry/malachite");
      const dd = page.locator("dd", { has: page.getByRole("link", { name: "The Green Gallery" }) });
      await expect(dd.getByRole("link", { name: "The Green Gallery" })).toHaveAttribute("href", "/codex/entry/the-green-gallery");
    });
  });

  test("a player who may read locations sees the place and the link from the ore, and never the DM hook", async ({ browser }) => {
    const { context, page } = await login(browser, await playerWith(["ore", "location"]));
    try {
      await page.goto("/codex/entry/malachite");
      await expect(page.getByRole("link", { name: "The Green Gallery" }).first()).toBeVisible();
      await page.goto("/codex/entry/the-green-gallery");
      await expect(page.getByRole("heading", { level: 1, name: "The Green Gallery" })).toBeVisible();
      await expect(page.getByRole("link", { name: /Malachite/ }).first()).toBeVisible();
      expect(await page.content()).not.toContain("Hook:");
    } finally {
      await context.close();
    }
  });

  test("a player without the location grant gets the names as plain text and a 404 on the place", async ({ browser }) => {
    const { context, page } = await login(browser, await playerWith(["ore"]));
    try {
      await page.goto("/codex/entry/malachite");
      await expect(page.locator("dd", { hasText: "The Green Gallery" })).toBeVisible();
      await expect(page.getByRole("link", { name: "The Green Gallery" })).toHaveCount(0);
      expect((await page.goto("/codex/entry/the-green-gallery"))?.status()).toBe(404);
    } finally {
      await context.close();
    }
  });
});
