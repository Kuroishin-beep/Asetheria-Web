import { execFileSync } from "node:child_process";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { buildNameIndex, normalizeName, parseAliases } from "../src/lib/links";
import { TARGETS, check, foundInNames, loadAll, wikiTargets } from "../scripts/lib/natural-world";
import { closeDbHelpers, createTestPlayer, deleteTestUser, query } from "./db-helpers";

/**
 * Phase 4: the original natural-world batches are valid, licence-clean data,
 * and once imported they are real, connected, access-controlled codex pages.
 */

const ROOT = path.join(__dirname, "..");
const PASSWORD = "correct horse battery staple 42";
const SOURCE = "original: natural-world/%";

test.afterAll(async () => {
  await closeDbHelpers();
});

test.describe("the data files (pure)", () => {
  test("[TC-NATW-002] pass every static check: shape, fields, provenance, licence denylist, counts", () => {
    expect(check()).toEqual([]);
  });

  test("[TC-NATW-003] hold exactly the promised number of new ores, flora and fauna, with no duplicate names across batches", () => {
    const all = loadAll().flatMap((f) => f.entries);
    for (const kind of ["ore", "flora", "fauna"] as const) {
      expect(all.filter((e) => e.kind === kind)).toHaveLength(TARGETS[kind]);
    }
    expect(new Set(all.map((e) => e.name.toLowerCase())).size).toBe(all.length);
  });

  test("[TC-NATW-004] the denylist check really rejects scraped-source and third-party game text", () => {
    const sample = JSON.stringify({ body: "Copied from a GM Binder page, see dnd5e.wikidot.com and the Forgotten Realms." }).toLowerCase();
    expect(["gm binder", "wikidot", "forgotten realms"].every((w) => sample.includes(w))).toBe(true);
  });
});

test.describe("once imported", () => {
  test("[TC-NATW-005] every batch entry is in the database with its kind, and each file imports once", async () => {
    const rows = await query<{ kind: string; n: string }>(
      `SELECT kind, count(*)::text AS n FROM entries WHERE source_path LIKE $1 AND kind IN ('ore','flora','fauna') AND archived_at IS NULL GROUP BY kind`,
      [SOURCE],
    );
    const byKind = Object.fromEntries(rows.map((r) => [r.kind, Number(r.n)]));
    expect(byKind).toEqual({ ore: TARGETS.ore, flora: TARGETS.flora, fauna: TARGETS.fauna });
  });

  test("[TC-NATW-006] re-importing a batch creates nothing and changes no row count", async () => {
    const before = await query<{ n: string }>(`SELECT count(*)::text AS n FROM entries`);
    const out = execFileSync("npx", ["tsx", "scripts/import-codex-file.ts", "data/natural-world/ores-1.json"], {
      cwd: ROOT,
      encoding: "utf8",
      shell: true,
    });
    const after = await query<{ n: string }>(`SELECT count(*)::text AS n FROM entries`);
    expect(out).toContain(" 0 created,");
    expect(after[0].n).toBe(before[0].n);
  });

  test("[TC-NATW-007] every place named in a Found in property or a [[link]] is a real, active page", async () => {
    const all = await query<{ id: string; name: string; kind: string; fields: Record<string, string> }>(
      `SELECT id, name, kind, fields FROM entries WHERE archived_at IS NULL`,
    );
    const index = buildNameIndex(all.map((e) => ({ id: e.id, name: e.name, kind: e.kind, aliases: parseAliases(e.fields) })));
    const missing: string[] = [];
    for (const e of loadAll().flatMap((f) => f.entries)) {
      for (const n of [...foundInNames(e.fields.foundIn), ...wikiTargets(e.body)]) {
        if (!index.has(normalizeName(n))) missing.push(`${e.name} -> ${n}`);
      }
    }
    expect(missing).toEqual([]);
  });

  test("[TC-NATW-008] each entry has a found-in connection and a body connection in the graph", async () => {
    const rows = await query<{ name: string; foundin: string; mentions: string }>(
      `SELECT e.name,
              count(*) FILTER (WHERE l.relation = 'found-in')::text AS foundin,
              count(*) FILTER (WHERE l.relation = 'mentions')::text AS mentions
       FROM entries e LEFT JOIN links l ON l.source_id = e.id
       WHERE e.source_path LIKE $1 AND e.kind IN ('ore','flora','fauna') AND e.archived_at IS NULL
       GROUP BY e.id, e.name`,
      [SOURCE],
    );
    const lacking = rows.filter((r) => Number(r.foundin) === 0 || Number(r.mentions) === 0).map((r) => r.name);
    expect(lacking).toEqual([]);
  });
});

test.describe("on the site (DM)", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("[TC-NATW-009] an imported ore reads as a finished page: summary, sections, properties, place links and the DM's Basis note", async ({ page }) => {
    await page.goto("/codex/entry/malachite");
    await expect(page.getByRole("heading", { level: 1, name: "Malachite" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Where it is found" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "In play" })).toBeVisible();
    await expect(page.getByText("Cost per lb.", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Dasht-a Khaliq" }).first()).toBeVisible();
    await expect(page.getByText(/^Basis: real malachite/)).toBeVisible();
  });

  test("[TC-NATW-010] a place now lists the things found there, as linked mentions", async ({ page }) => {
    await page.goto("/codex/entry/dasht-a-khaliq");
    await expect(page.getByRole("heading", { name: /Linked mentions/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Malachite/ }).first()).toBeVisible();
  });

  test("[TC-NATW-011] full-text search finds an imported entry by a word that is only in its body", async ({ page }) => {
    await page.goto("/search?q=bedbug");
    await expect(page.getByRole("link", { name: /Bug-Herb/ }).first()).toBeVisible();
  });

  test("[TC-NATW-012] the sections list the new entries", async ({ page }) => {
    await page.goto("/codex/ores?page=2");
    await expect(page.locator('[data-slot="card"]').first()).toBeVisible();
    await page.goto("/codex/fauna");
    await expect(page.getByText("68 total")).toBeVisible();
  });
});

test("[TC-NATW-001] a player with the kind granted sees the entry but never its DM-only Basis note", async ({ browser }) => {
  const username = `zz-nw-${randomUUID().slice(0, 8)}`;
  const userId = await createTestPlayer(username, PASSWORD);
  await query(`UPDATE users SET display_name = 'NW Tester' WHERE id = $1`, [userId]);
  await query(`INSERT INTO entry_grants (user_id, kind, granted) VALUES ($1, 'ore', true), ($1, 'location', true)`, [userId]);
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    expect((await page.request.post("/api/auth/login", { data: { username, password: PASSWORD } })).ok()).toBe(true);
    const res = await page.goto("/codex/entry/malachite");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Malachite" })).toBeVisible();
    expect(await page.content()).not.toContain("Basis:");
    expect(await page.content()).not.toContain("real malachite, copper carbonate");
  } finally {
    await context.close();
    await deleteTestUser(userId);
  }
});

test.describe("batch archive tool", () => {
  test("[TC-NATW-013] archives and restores exactly one batch by its source, and refuses a too-short prefix", async () => {
    const tag = `test: archive-batch-${randomUUID().slice(0, 8)}`;
    const slugs = [0, 1].map(() => `zz-batch-${randomUUID().slice(0, 8)}`);
    try {
      for (const slug of slugs) {
        await query(`INSERT INTO entries (slug, kind, name, summary, source_path) VALUES ($1, 'note', $1, 'x', $2)`, [slug, tag]);
      }
      const run = (...args: string[]) =>
        execFileSync("npx", ["tsx", "scripts/archive-batch.ts", ...args], { cwd: ROOT, encoding: "utf8", shell: true });

      expect(run(`"${tag}"`)).toContain("2 entries");
      let state = await query<{ archived_at: string | null }>(`SELECT archived_at FROM entries WHERE source_path = $1`, [tag]);
      expect(state.every((r) => r.archived_at === null)).toBe(true); // dry run wrote nothing

      expect(run(`"${tag}"`, "--apply")).toContain("2 entries archived");
      state = await query(`SELECT archived_at FROM entries WHERE source_path = $1`, [tag]);
      expect(state.every((r) => r.archived_at !== null)).toBe(true);

      expect(run(`"${tag}"`, "--restore", "--apply")).toContain("2 entries restored");
      state = await query(`SELECT archived_at FROM entries WHERE source_path = $1`, [tag]);
      expect(state.every((r) => r.archived_at === null)).toBe(true);

      expect(() => run('"x"', "--apply")).toThrow();
    } finally {
      await query(`DELETE FROM entries WHERE source_path = $1`, [tag]);
    }
  });
});
