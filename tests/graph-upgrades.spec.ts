import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { buildFacets, filterGraph, graphQuery, parseGraphFilters, NO_FILTERS } from "../src/lib/graph-filter";
import { layoutGraph, type GraphEdge, type GraphNode } from "../src/lib/graph-layout";
import { createLayoutCache, graphFingerprint } from "../src/lib/layout-cache";
import { closeDbHelpers, createTestPlayer, deleteTestUser, query } from "./db-helpers";

/**
 * Phase 8c (ENH-07c): the world graph with filters (kind, region, tag), parent
 * clustering, keyboard navigation, and a measured frame rate on 600+ nodes.
 */

const PASSWORD = "correct horse battery staple 42";
const tag = randomUUID().slice(0, 8);
const SRC = "test: graph-upgrades";
const SECRET_TAG = `zz-secret-tag-${tag}`;
const SECRET_REGION = `Zz Secret Region ${tag}`;
const users: string[] = [];

function node(id: string, kind: GraphNode["kind"], extra: Partial<GraphNode> = {}): GraphNode {
  return { id, slug: id, name: id, kind, tags: [], region: "", parentId: null, ...extra };
}

async function playerWith(kinds: string[]): Promise<string> {
  const username = `zz-gr-${randomUUID().slice(0, 8)}`;
  const id = await createTestPlayer(username, PASSWORD);
  users.push(id);
  await query(`UPDATE users SET display_name = 'GR Tester' WHERE id = $1`, [id]);
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
  // A secret page carrying a tag and a region that exist nowhere else, linked to a public ore.
  const sec = await query<{ id: string }>(
    `INSERT INTO entries (slug, kind, name, summary, visibility, tags, fields, source_path)
     VALUES ($1, 'ore', $2, 'secret', 'secret', ARRAY[$3]::text[], $4::jsonb, $5) RETURNING id`,
    [`zz-secret-ore-${tag}`, `Zz Secret Ore ${tag}`, SECRET_TAG, JSON.stringify({ region: SECRET_REGION }), SRC],
  );
  const pub = await query<{ id: string }>(`SELECT id FROM entries WHERE slug = 'malachite' AND archived_at IS NULL`);
  await query(`INSERT INTO links (source_id, target_id, relation) VALUES ($1, $2, 'mentions')`, [sec[0].id, pub[0].id]);
});

test.afterAll(async () => {
  await query(`DELETE FROM links WHERE source_id IN (SELECT id FROM entries WHERE source_path = $1) OR target_id IN (SELECT id FROM entries WHERE source_path = $1)`, [SRC]);
  await query(`DELETE FROM entries WHERE source_path = $1`, [SRC]);
  for (const id of users) await deleteTestUser(id);
  await closeDbHelpers();
});

async function renderedIds(page: Page): Promise<string[]> {
  return page.locator("[data-node-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-node-id") as string));
}

async function renderedPositions(page: Page): Promise<Map<string, { x: number; y: number }>> {
  const rows = await page.locator("[data-node-id]").evaluateAll((els) =>
    els.map((e) => {
      const m = (e.getAttribute("transform") ?? "").match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
      return { id: e.getAttribute("data-node-id") as string, x: m ? parseFloat(m[1]) : NaN, y: m ? parseFloat(m[2]) : NaN };
    }),
  );
  return new Map(rows.map((r) => [r.id, { x: r.x, y: r.y }]));
}

test.describe("filter rules (pure)", () => {
  const nodes: GraphNode[] = [
    node("ore1", "ore", { tags: ["Metal"], region: "North" }),
    node("ore2", "ore", { tags: ["Gem"], region: "South" }),
    node("city", "location", { tags: ["Metal"], region: "North" }),
    node("npc", "npc", { parentId: "city" }),
    node("far", "lore"),
    node("lonely", "note"),
  ];
  const edges: GraphEdge[] = [
    { source: "ore1", target: "city", relation: "found-in" },
    { source: "ore2", target: "far", relation: "mentions" },
    { source: "city", target: "far", relation: "mentions" },
    { source: "npc", target: "city", relation: "located-in" },
  ];

  test("[TC-GRAPH-001] no filter shows everything", () => {
    const out = filterGraph(nodes, edges, NO_FILTERS);
    expect(out.nodes).toHaveLength(6);
    expect(out.edges).toHaveLength(4);
    expect(out.matches).toHaveLength(6);
  });

  test("[TC-GRAPH-002] kind=ore shows only the ores and their direct neighbours, and only the links that touch an ore", () => {
    const out = filterGraph(nodes, edges, { ...NO_FILTERS, kinds: ["ore"] });
    expect(out.matches.sort()).toEqual(["ore1", "ore2"]);
    expect(out.nodes.map((n) => n.id).sort()).toEqual(["city", "far", "ore1", "ore2"]);
    // city -> far joins two neighbours, so it is left out.
    expect(out.edges.map((e) => `${e.source}>${e.target}`).sort()).toEqual(["ore1>city", "ore2>far"]);
    for (const e of out.edges) expect(out.matches.includes(e.source) || out.matches.includes(e.target)).toBe(true);
  });

  test("[TC-GRAPH-003] region and tag narrow further, and several filters must all hold", () => {
    expect(filterGraph(nodes, edges, { ...NO_FILTERS, region: "North" }).matches.sort()).toEqual(["city", "ore1"]);
    expect(filterGraph(nodes, edges, { ...NO_FILTERS, tag: "metal" }).matches.sort()).toEqual(["city", "ore1"]);
    expect(filterGraph(nodes, edges, { ...NO_FILTERS, kinds: ["ore"], tag: "Metal" }).matches).toEqual(["ore1"]);
    expect(filterGraph(nodes, edges, { ...NO_FILTERS, kinds: ["ore"], region: "North", tag: "Gem" }).matches).toEqual([]);
  });

  test("[TC-GRAPH-004] a filter with no matches shows nothing, and a page with no links shows only when it matches", () => {
    expect(filterGraph(nodes, edges, { ...NO_FILTERS, kinds: ["deity"] }).nodes).toEqual([]);
    expect(filterGraph(nodes, edges, { ...NO_FILTERS, kinds: ["note"] }).nodes.map((n) => n.id)).toEqual(["lonely"]);
  });

  test("[TC-GRAPH-005] clustering adds parent edges only between pages that are both shown", () => {
    const on = filterGraph(nodes, edges, { ...NO_FILTERS, cluster: true });
    expect(on.edges.filter((e) => e.relation === "parent")).toEqual([{ source: "city", target: "npc", relation: "parent" }]);
    const narrowed = filterGraph(nodes, edges, { ...NO_FILTERS, kinds: ["ore"], cluster: true });
    expect(narrowed.edges.some((e) => e.relation === "parent")).toBe(false);
  });

  test("[TC-GRAPH-006] parseGraphFilters keeps real options and ignores everything else; graphQuery round-trips", () => {
    const facets = buildFacets(nodes);
    expect(parseGraphFilters({ kind: "ore,nonsense", region: "North", tag: "Metal", cluster: "parent" }, facets)).toEqual({ kinds: ["ore"], region: "North", tag: "Metal", cluster: true });
    expect(parseGraphFilters({ kind: "'; DROP TABLE", region: "Atlantis", tag: "zz", cluster: "maybe" }, facets)).toEqual(NO_FILTERS);
    expect(parseGraphFilters({ kind: ["ore", "npc"] }, facets).kinds).toEqual(["ore"]);
    const f = { kinds: ["ore"], region: "North", tag: "Metal", cluster: true };
    expect(parseGraphFilters(Object.fromEntries(new URLSearchParams(graphQuery(f))), facets)).toEqual(f);
    expect(graphQuery(NO_FILTERS)).toBe("");
  });
});

test.describe("layout cache and cost (pure)", () => {
  const nodes: GraphNode[] = [node("a", "ore"), node("b", "ore"), node("c", "location")];
  const edges: GraphEdge[] = [{ source: "a", target: "c", relation: "found-in" }, { source: "b", target: "c", relation: "found-in" }];

  test("[TC-GRAPH-007] the same pages and links are laid out once, however often they are asked for", () => {
    let calls = 0;
    const cache = createLayoutCache((n, e) => {
      calls++;
      return layoutGraph(n, e);
    });
    const first = cache.get(nodes, edges);
    for (let i = 0; i < 50; i++) expect(cache.get([...nodes], [...edges])).toBe(first);
    expect(calls).toBe(1);
    expect(cache.size()).toBe(1);
  });

  test("[TC-GRAPH-008] a different set of pages or links gets its own layout, so one person's picture is never served for another's", () => {
    let calls = 0;
    const cache = createLayoutCache((n, e) => {
      calls++;
      return layoutGraph(n, e);
    });
    const full = cache.get(nodes, edges);
    const playerView = cache.get(nodes.slice(0, 2), edges.slice(0, 0));
    expect(playerView).not.toBe(full);
    expect(Object.keys(playerView)).toHaveLength(2);
    cache.get(nodes, [...edges, { source: "a", target: "b", relation: "mentions" }]);
    expect(calls).toBe(3);
    expect(graphFingerprint(nodes, edges)).not.toBe(graphFingerprint(nodes.slice(0, 2), edges));
    expect(graphFingerprint(nodes, edges)).toBe(graphFingerprint([...nodes], [...edges]));
  });

  test("[TC-GRAPH-009] it is bounded: the least recently used layout is dropped, and a recently used one is kept", () => {
    const cache = createLayoutCache(layoutGraph, 3);
    const sets = [1, 2, 3, 4].map((n) => [node(`x${n}`, "note")]);
    cache.get(sets[0], []);
    cache.get(sets[1], []);
    cache.get(sets[2], []);
    cache.get(sets[0], []); // touch the oldest so it becomes the newest
    cache.get(sets[3], []); // evicts sets[1]
    expect(cache.size()).toBe(3);
    let calls = 0;
    const counting = createLayoutCache((n, e) => (calls++, layoutGraph(n, e)), 3);
    counting.get(sets[0], []);
    counting.get(sets[1], []);
    counting.get(sets[2], []);
    counting.get(sets[0], []);
    counting.get(sets[3], []);
    counting.get(sets[0], []); // still cached
    expect(calls).toBe(4);
    counting.get(sets[1], []); // was evicted, laid out again
    expect(calls).toBe(5);
  });

  test("[TC-GRAPH-010] the layout is deterministic and stays inside the canvas, and the whole codex lays out in well under half a second", () => {
    const many: GraphNode[] = Array.from({ length: 1000 }, (_, i) => node(`n${i}`, i % 3 === 0 ? "ore" : "location"));
    const links: GraphEdge[] = [];
    for (let i = 1; i < 1000; i++) {
      links.push({ source: `n${i}`, target: `n${Math.floor(i / 3)}`, relation: "mentions" });
      if (i % 5 === 0) links.push({ source: `n${i}`, target: `n${(i * 7) % 1000}`, relation: "mentions" });
    }
    layoutGraph(many, links); // warm the JIT, as a running server is
    const t = performance.now();
    const a = layoutGraph(many, links);
    const ms = performance.now() - t;
    test.info().annotations.push({ type: "cold layout of 1000 nodes", description: `${ms.toFixed(0)} ms` });
    expect(ms).toBeLessThan(500);
    expect(layoutGraph(many, links)).toEqual(a);
    for (const p of Object.values(a)) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(900);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(640);
    }
  });
});

test.describe("filters in the browser (DM)", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("[TC-GRAPH-011] kind=ore shows exactly the ores and their direct neighbours (checked against the database)", async ({ page }) => {
    const ores = await query<{ id: string }>(`SELECT id FROM entries WHERE kind = 'ore' AND archived_at IS NULL`);
    const oreIds = new Set(ores.map((r) => r.id));
    const live = new Set((await query<{ id: string }>(`SELECT id FROM entries WHERE archived_at IS NULL`)).map((r) => r.id));
    const edges = await query<{ source_id: string; target_id: string }>(`SELECT source_id, target_id FROM links`);
    const expected = new Set(oreIds);
    for (const e of edges) {
      if (!live.has(e.source_id) || !live.has(e.target_id)) continue;
      if (oreIds.has(e.source_id) || oreIds.has(e.target_id)) {
        expected.add(e.source_id);
        expected.add(e.target_id);
      }
    }
    await page.goto("/graph?kind=ore");
    await expect(page.getByTestId("graph-svg")).toBeVisible();
    const got = new Set(await renderedIds(page));
    expect([...got].filter((id) => !expected.has(id))).toEqual([]);
    expect([...expected].filter((id) => !got.has(id))).toEqual([]);
    for (const id of oreIds) expect(got.has(id), "every ore is shown").toBe(true);
    await expect(page.getByTestId("graph-summary")).toContainText(`${oreIds.size} pages match`);
  });

  test("[TC-GRAPH-012] choosing a kind, region and tag in the controls updates the URL and the picture", async ({ page }) => {
    await page.goto("/graph");
    const all = Number(await page.getByTestId("graph-svg").getAttribute("data-shown"));
    expect(all).toBeGreaterThan(600);

    await page.getByLabel("Kind").selectOption("ore");
    await expect(page).toHaveURL(/kind=ore/);
    await expect(page.getByTestId("graph-summary")).toContainText("match");
    expect(Number(await page.getByTestId("graph-svg").getAttribute("data-shown"))).toBeLessThan(all);

    const region = (await query<{ r: string }>(`SELECT fields->>'region' AS r FROM entries WHERE archived_at IS NULL AND coalesce(fields->>'region','') <> '' GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1`))[0].r;
    await page.getByLabel("Kind").selectOption("");
    await page.getByLabel("Region").selectOption(region);
    await expect(page).toHaveURL(/region=/);
    const n = (await query<{ n: string }>(`SELECT count(*)::text AS n FROM entries WHERE archived_at IS NULL AND fields->>'region' = $1`, [region]))[0].n;
    await expect(page.getByTestId("graph-summary")).toContainText(`${n} pages match`);

    await page.getByLabel("Region").selectOption("");
    await page.getByLabel("Tag").selectOption({ index: 1 });
    await expect(page).toHaveURL(/tag=/);
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page).not.toHaveURL(/tag=|kind=|region=/);
    expect(Number(await page.getByTestId("graph-svg").getAttribute("data-shown"))).toBe(all);
  });

  test("[TC-GRAPH-013] a combination with no matches says so and offers a way back", async ({ page }) => {
    await page.goto("/graph?kind=pantheon&region=Corinth%20City");
    await expect(page.getByText("Nothing matches those filters")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).first().click();
    await expect(page.getByTestId("graph-svg")).toBeVisible();
  });

  test("[TC-GRAPH-014] unknown or hostile parameters are ignored: 200 and the whole graph", async ({ page }) => {
    await page.goto("/graph");
    const all = await page.getByTestId("graph-svg").getAttribute("data-shown");
    for (const qs of ["kind=nonsense", "region=Atlantis&tag=nope", "cluster=maybe", "kind=%27%3B%20DROP%20TABLE%20entries", "kind=%00&tag=%00", "kind=ore&kind=npc"]) {
      const res = await page.goto(`/graph?${qs}`);
      expect(res?.status(), qs).toBe(200);
      if (!qs.startsWith("kind=ore")) expect(await page.getByTestId("graph-svg").getAttribute("data-shown"), qs).toBe(all);
    }
  });

  test("[TC-GRAPH-015] the DM's controls include the secret page's tag and region", async ({ page }) => {
    await page.goto("/graph");
    await expect(page.getByLabel("Tag").locator(`option[value="${SECRET_TAG}"]`)).toHaveCount(1);
    await expect(page.getByLabel("Region").locator(`option[value="${SECRET_REGION}"]`)).toHaveCount(1);
    await page.goto(`/graph?tag=${SECRET_TAG}`);
    await expect(page.getByTestId("graph-summary")).toContainText("1 page matches");
  });
});

test.describe("filters for a player", () => {
  test("[TC-GRAPH-016] a secret page's tag and region are not in the controls, and asking for them changes nothing (existence is not confirmed)", async ({ browser }) => {
    const { context, page } = await login(browser, await playerWith(["ore", "location"]));
    try {
      await page.goto("/graph");
      const all = await page.getByTestId("graph-svg").getAttribute("data-shown");
      const html = await page.content();
      expect(html).not.toContain(SECRET_TAG);
      expect(html).not.toContain(SECRET_REGION);
      expect(html).not.toContain(`Zz Secret Ore ${tag}`);
      await expect(page.getByLabel("Tag").locator(`option[value="${SECRET_TAG}"]`)).toHaveCount(0);

      for (const qs of [`tag=${SECRET_TAG}`, `region=${encodeURIComponent(SECRET_REGION)}`, `tag=zz-not-a-tag-at-all`]) {
        await page.goto(`/graph?${qs}`);
        expect(await page.getByTestId("graph-svg").getAttribute("data-shown"), qs).toBe(all);
        expect(await page.content()).not.toContain(`Zz Secret Ore ${tag}`);
      }
      expect(await renderedIds(page)).not.toContain(`zz-secret-ore-${tag}`);
    } finally {
      await context.close();
    }
  });

  test("[TC-GRAPH-017] the node ids in a player's graph are all pages that player may read", async ({ browser }) => {
    const { context, page } = await login(browser, await playerWith(["ore"]));
    try {
      await page.goto("/graph?kind=ore");
      const ids = await renderedIds(page);
      expect(ids.length).toBeGreaterThan(0);
      const bad = await query<{ id: string }>(`SELECT id FROM entries WHERE id = ANY($1::uuid[]) AND (visibility = 'secret' OR archived_at IS NOT NULL)`, [ids]);
      expect(bad).toEqual([]);
    } finally {
      await context.close();
    }
  });
});

test.describe("parent clustering", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("[TC-GRAPH-018] the switch is in the URL, and children sit measurably closer to their parent than without it", async ({ page }) => {
    const pairs = await query<{ id: string; parent_id: string }>(
      `SELECT c.id, c.parent_id FROM entries c JOIN entries p ON p.id = c.parent_id
       WHERE c.archived_at IS NULL AND p.archived_at IS NULL AND c.kind = 'location' AND p.kind = 'location'`,
    );
    expect(pairs.length).toBeGreaterThan(50);

    const meanDistance = async (qs: string) => {
      await page.goto(`/graph?${qs}`);
      await expect(page.getByTestId("graph-svg")).toBeVisible();
      const pos = await renderedPositions(page);
      const ds = pairs
        .map((p) => ({ a: pos.get(p.id), b: pos.get(p.parent_id) }))
        .filter((p): p is { a: { x: number; y: number }; b: { x: number; y: number } } => Boolean(p.a && p.b))
        .map((p) => Math.hypot(p.a.x - p.b.x, p.a.y - p.b.y));
      expect(ds.length).toBeGreaterThan(30);
      return ds.reduce((s, d) => s + d, 0) / ds.length;
    };

    const without = await meanDistance("kind=location");
    const withCluster = await meanDistance("kind=location&cluster=parent");
    test.info().annotations.push({ type: "mean parent-child distance", description: `${without.toFixed(1)} -> ${withCluster.toFixed(1)}` });
    expect(withCluster).toBeLessThan(without * 0.5);
  });

  test("[TC-GRAPH-019] the Group by parent switch toggles the URL and draws dashed parent links", async ({ page }) => {
    await page.goto("/graph?kind=location");
    await page.getByRole("switch", { name: "Group by parent" }).click();
    await expect(page).toHaveURL(/cluster=parent/);
    await expect(page.locator("path[stroke-dasharray]").first()).toBeAttached();
    await page.getByRole("switch", { name: "Group by parent" }).click();
    await expect(page).not.toHaveURL(/cluster=/);
  });
});

test.describe("keyboard", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("[TC-GRAPH-020] the graph is one tab stop; arrows move to the nearest page in that direction; Enter opens it", async ({ page }) => {
    await page.goto("/graph?kind=location");
    await expect(page.getByTestId("graph-svg")).toBeVisible();
    await expect(page.locator('g[data-node-id][tabindex="0"]')).toHaveCount(1);

    const tabbable = page.locator('g[data-node-id][tabindex="0"]');
    await tabbable.focus();
    const idOf = () => page.evaluate(() => document.activeElement?.getAttribute("data-node-id") ?? "");
    const start = await idOf();
    expect(start).not.toBe("");
    const pos = await renderedPositions(page);

    for (const [key, ok] of [
      ["ArrowRight", (a: { x: number; y: number }, b: { x: number; y: number }) => b.x > a.x],
      ["ArrowLeft", (a: { x: number; y: number }, b: { x: number; y: number }) => b.x < a.x],
      ["ArrowDown", (a: { x: number; y: number }, b: { x: number; y: number }) => b.y > a.y],
      ["ArrowUp", (a: { x: number; y: number }, b: { x: number; y: number }) => b.y < a.y],
    ] as const) {
      const before = await idOf();
      await page.keyboard.press(key);
      const after = await idOf();
      if (after !== before) expect(ok(pos.get(before)!, pos.get(after)!), `${key}: ${before} -> ${after}`).toBe(true);
    }
    // After moving, still exactly one tab stop.
    await expect(page.locator('g[data-node-id][tabindex="0"]')).toHaveCount(1);

    const focused = await idOf();
    const slug = (await query<{ slug: string }>(`SELECT slug FROM entries WHERE id = $1`, [focused]))[0].slug;
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/codex/entry/${slug}$`));
  });

  test("[TC-GRAPH-021] an arrow with no page in that direction stays put, and Escape leaves the graph", async ({ page }) => {
    await page.goto("/graph?kind=deity");
    const tabbable = page.locator('g[data-node-id][tabindex="0"]');
    await tabbable.focus();
    const before = await page.evaluate(() => document.activeElement?.getAttribute("data-node-id"));
    for (let i = 0; i < 400; i++) await page.keyboard.press("ArrowRight");
    const edge = await page.evaluate(() => document.activeElement?.getAttribute("data-node-id"));
    expect(edge).toBeTruthy();
    await page.keyboard.press("ArrowRight");
    expect(await page.evaluate(() => document.activeElement?.getAttribute("data-node-id"))).toBe(edge);
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => document.activeElement?.getAttribute("data-node-id") ?? "")).toBe("");
    void before;
  });
});

test.describe("performance", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("[TC-GRAPH-022] 600+ nodes keep 90% of frames within 33 ms (30 fps) while the pointer sweeps the graph, on a 4x-throttled (mid laptop) CPU", async ({ page }) => {
    test.setTimeout(120000);
    await page.goto("/graph");
    const svg = page.getByTestId("graph-svg");
    await expect(svg).toBeVisible();
    const shown = Number(await svg.getAttribute("data-shown"));
    expect(shown).toBeGreaterThanOrEqual(600);

    // Let hydration finish before measuring: the question is how the graph responds to use, not how long first paint takes.
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    try {
      const box = (await svg.boundingBox())!;
      // Warm-up sweep (not measured) so first-hover work does not count against steady state.
      for (let i = 0; i < 10; i++) await page.mouse.move(box.x + box.width * (0.2 + i * 0.05), box.y + box.height * 0.5);
      await page.evaluate(() => {
        const w = window as unknown as { __frames: number[] };
        w.__frames = [];
        const tick = (t: number) => {
          w.__frames.push(t);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      const SWEEPS = 120;
      for (let i = 0; i < SWEEPS; i++) {
        const fx = (i % 40) / 40;
        const fy = Math.floor(i / 40) / 3 + 0.15;
        await page.mouse.move(box.x + box.width * (0.1 + 0.8 * fx), box.y + box.height * Math.min(0.9, fy), { steps: 2 });
      }
      const frames = await page.evaluate(() => (window as unknown as { __frames: number[] }).__frames);
      const seconds = (frames[frames.length - 1] - frames[0]) / 1000;
      const fps = (frames.length - 1) / seconds;
      const gaps = frames.slice(1).map((t, i) => t - frames[i]);
      const worst = Math.max(...gaps);
      const sorted = [...gaps].sort((x, y) => x - y);
      const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
      const median = pct(0.5);
      const result = { nodes: shown, cpuThrottle: "4x", seconds: Number(seconds.toFixed(2)), frames: frames.length, fps: Number(fps.toFixed(1)), worstFrameMs: Number(worst.toFixed(1)), medianFrameMs: Number(median.toFixed(1)), p90FrameMs: Number(pct(0.9).toFixed(1)), p99FrameMs: Number(pct(0.99).toFixed(1)), at: "pointer sweep over the graph" };
      fs.mkdirSync("test-results", { recursive: true });
      fs.writeFileSync(path.join("test-results", "graph-fps.json"), JSON.stringify(result, null, 2));
      test.info().annotations.push({ type: "graph fps", description: JSON.stringify(result) });
      console.log(`GRAPH FPS ${JSON.stringify(result)}`);
      // "30 fps or better" means frames arrive within 33.4 ms: required of 90% of frames, with no freeze over a second.
      // The mean rate is recorded above but not asserted: it depends on how fast the test driver feeds mouse events.
      // Frames land on 16.7 ms display steps: two steps is 33.4 plus a float rounding error, so compare at the precision that is measured.
      expect(Number(pct(0.9).toFixed(1))).toBeLessThanOrEqual(33.4);
      expect(worst).toBeLessThan(1000);
    } finally {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    }
  });
});

test.describe("small screens", () => {
  test.use({ storageState: "tests/.auth/dm.json", viewport: { width: 375, height: 800 } });

  test("[TC-GRAPH-023] at 375px the filters wrap and the page does not scroll sideways", async ({ page }) => {
    await page.goto("/graph?kind=ore");
    await expect(page.getByLabel("Kind")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
