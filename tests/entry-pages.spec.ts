import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { initialsOf, safePortraitUrl } from "../src/lib/entry-hero";
import { ENTRY_TEMPLATES, templateFor } from "../src/lib/entry-templates";
import { readRecentKeyForTest } from "./recent-key";
import { closeDbHelpers, createTestPlayer, deleteTestUser, query } from "./db-helpers";

/**
 * Phase 8a (ENH-07a): hero card with a portrait slot, per-kind templates, a
 * local graph that shows only what the viewer may read, and recently viewed.
 */

const PASSWORD = "correct horse battery staple 42";
const tag = randomUUID().slice(0, 8);
const SRC = "test: entry-pages";
const slugOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const users: string[] = [];

type Fixture = { name: string; kind: string; fields?: Record<string, string>; visibility?: string; body?: string; dmNotes?: string };

async function insert(f: Fixture): Promise<string> {
  const rows = await query<{ id: string }>(
    `INSERT INTO entries (slug, kind, name, summary, body, dm_notes, fields, visibility, source_path)
     VALUES ($1, $2, $3, 'A fixture.', $4, $5, $6::jsonb, $7, $8) RETURNING id`,
    [slugOf(f.name), f.kind, f.name, f.body ?? "", f.dmNotes ?? "", JSON.stringify(f.fields ?? {}), f.visibility ?? "public", SRC],
  );
  return rows[0].id;
}

async function playerWith(kinds: string[]): Promise<{ username: string; id: string }> {
  const username = `zz-ep-${randomUUID().slice(0, 8)}`;
  const id = await createTestPlayer(username, PASSWORD);
  users.push(id);
  await query(`UPDATE users SET display_name = 'EP Tester' WHERE id = $1`, [id]);
  for (const kind of kinds) await query(`INSERT INTO entry_grants (user_id, kind, granted) VALUES ($1, $2, true)`, [id, kind]);
  return { username, id };
}

async function login(browser: Browser, username: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  expect((await page.request.post("/api/auth/login", { data: { username, password: PASSWORD } })).ok()).toBe(true);
  return { context, page };
}

const HERO = `Zz Hero ${tag}`;
const NO_PORTRAIT = `Zz Plain ${tag}`;
const HTTPS_PORTRAIT = `Zz Https ${tag}`;
const BAD_PORTRAIT = `Zz Evil ${tag}`;
const HUB = `Zz Hub ${tag}`;
const PUB_SPOKE = `Zz Open Spoke ${tag}`;
const SECRET_SPOKE = `Zz Secret Spoke ${tag}`;

test.beforeAll(async () => {
  await insert({
    name: HERO,
    kind: "npc",
    fields: { race: "Half-elf", gender: "Female", role: "Harbour-master", attitude: "Ally", statblock: "AC 12" },
    dmNotes: "## Secrets\n\nShe is the smuggler.",
  });
  await insert({ name: NO_PORTRAIT, kind: "npc", fields: { race: "Human" } });
  await insert({ name: HTTPS_PORTRAIT, kind: "npc", fields: { race: "Human", portrait: "https://example.invalid/face.png" } });
  await insert({ name: BAD_PORTRAIT, kind: "npc", fields: { race: "Human", portrait: "javascript:alert(1)" } });

  const hub = await insert({ name: HUB, kind: "note", body: `See [[${PUB_SPOKE}]].` });
  // The edge to the secret page exists in the graph but is never named in the public body, so what this
  // fixture tests is the graph and the link lists, not text the DM typed.
  const pub = await insert({ name: PUB_SPOKE, kind: "note" });
  const sec = await insert({ name: SECRET_SPOKE, kind: "note", visibility: "secret" });
  await query(`INSERT INTO links (source_id, target_id, relation) VALUES ($1, $2, 'mentions'), ($1, $3, 'mentions')`, [hub, pub, sec]);
});

test.afterAll(async () => {
  await query(`DELETE FROM links WHERE source_id IN (SELECT id FROM entries WHERE source_path = $1) OR target_id IN (SELECT id FROM entries WHERE source_path = $1)`, [SRC]);
  await query(`DELETE FROM entries WHERE source_path = $1`, [SRC]);
  for (const id of users) await deleteTestUser(id);
  await closeDbHelpers();
});

test.describe("rules (pure)", () => {
  test("safePortraitUrl accepts site paths and https, and drops everything else", () => {
    expect(safePortraitUrl("/portraits/a.png")).toBe("/portraits/a.png");
    expect(safePortraitUrl("https://example.com/a.png")).toBe("https://example.com/a.png");
    for (const bad of ["javascript:alert(1)", "data:image/png;base64,AAAA", "//evil.example/x.png", "http://example.com/a.png", "", "  ", "/x y.png", "/a\"onerror=1", undefined, null]) {
      expect(safePortraitUrl(bad as string | undefined), String(bad)).toBeNull();
    }
  });

  test("initialsOf takes two letters and skips a leading The", () => {
    expect(initialsOf("The Harbour Master")).toBe("HM");
    expect(initialsOf("Aelith")).toBe("A");
    expect(initialsOf("")).toBe("");
  });

  test("the NPC template carries Appearance and Motivation in the body and Secrets in the DM notes; secrets never go in a body", () => {
    const npc = templateFor("npc");
    expect(npc.body).toContain("## Appearance");
    expect(npc.body).toContain("## Motivation");
    expect(npc.dmNotes).toContain("## Secrets");
    for (const [kind, t] of Object.entries(ENTRY_TEMPLATES)) expect(t.body.toLowerCase(), kind).not.toContain("secret");
    expect(templateFor("note")).toEqual({ body: "", dmNotes: "" });
  });
});

test.describe("hero card and templates (DM)", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("an NPC page opens with a hero card: a portrait slot and an infobox from its fields", async ({ page }) => {
    await page.goto(`/codex/entry/${slugOf(HERO)}`);
    const hero = page.getByTestId("entry-hero");
    await expect(hero).toBeVisible();
    await expect(page.getByTestId("portrait-slot")).toBeVisible();
    await expect(hero.getByText("Race", { exact: true })).toBeVisible();
    await expect(hero.getByText("Half-elf")).toBeVisible();
    await expect(hero.getByText("Harbour-master")).toBeVisible();
    await expect(hero.getByText("Ally")).toBeVisible();
    // Key facts live in the hero only; the rest stay in the properties card.
    await expect(page.getByText("Half-elf")).toHaveCount(1);
    await expect(page.getByText("AC 12")).toBeVisible();
  });

  test("with no portrait the slot shows initials; a site-path or https portrait renders as an image", async ({ page }) => {
    await page.goto(`/codex/entry/${slugOf(NO_PORTRAIT)}`);
    await expect(page.getByTestId("portrait-slot").getByRole("img", { name: /No portrait/ })).toBeVisible();
    await page.goto(`/codex/entry/${slugOf(HTTPS_PORTRAIT)}`);
    await expect(page.getByTestId("portrait-slot").locator("img")).toHaveAttribute("src", "https://example.invalid/face.png");
  });

  test("an unsafe portrait value (javascript:) is never put in the page", async ({ page }) => {
    await page.goto(`/codex/entry/${slugOf(BAD_PORTRAIT)}`);
    await expect(page.getByTestId("portrait-slot").locator("img")).toHaveCount(0);
    expect(await page.content()).not.toContain("javascript:alert");
  });

  test("a kind without a hero (a note) has none", async ({ page }) => {
    await page.goto(`/codex/entry/${slugOf(HUB)}`);
    await expect(page.getByTestId("entry-hero")).toHaveCount(0);
  });

  test("New NPC prefills Appearance and Motivation in the description and Secrets in the DM notes", async ({ page }) => {
    await page.goto("/codex/new?kind=npc");
    const body = page.locator("#body");
    await expect(body).toHaveValue(/## Appearance/);
    await expect(body).toHaveValue(/## Motivation/);
    await expect(page.locator("#dmNotes")).toHaveValue(/## Secrets/);
  });

  test("New Note stays blank, and New Location has its own headings", async ({ page }) => {
    await page.goto("/codex/new?kind=note");
    await expect(page.locator("#body")).toHaveValue("");
    await page.goto("/codex/new?kind=location");
    await expect(page.locator("#body")).toHaveValue(/## At a glance/);
  });

  test("the local graph shows the hub's neighbours to the DM, including the secret one", async ({ page }) => {
    await page.goto(`/codex/entry/${slugOf(HUB)}`);
    const graph = page.getByTestId("local-graph");
    await expect(graph).toBeVisible();
    await expect(graph.locator(`[data-node="${slugOf(PUB_SPOKE)}"]`)).toHaveCount(1);
    await expect(graph.locator(`[data-node="${slugOf(SECRET_SPOKE)}"]`)).toHaveCount(1);
  });

  test("clicking a graph node opens that page; the diagram is hidden from assistive tech and adds no duplicate links", async ({ page }) => {
    await page.goto(`/codex/entry/${slugOf(HUB)}`);
    const graph = page.getByTestId("local-graph");
    // Not in the accessibility tree: none of the diagram's links is announced; the lists below carry them.
    await expect(graph.getByRole("link")).toHaveCount(0);
    await graph.locator(`[data-node="${slugOf(PUB_SPOKE)}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/codex/entry/${slugOf(PUB_SPOKE)}$`));
  });
});

test.describe("what a player sees", () => {
  test("the local graph holds only entries the player may read: the secret spoke is nowhere in the page", async ({ browser }) => {
    const { username } = await playerWith(["note"]);
    const { context, page } = await login(browser, username);
    try {
      await page.goto(`/codex/entry/${slugOf(HUB)}`);
      const graph = page.getByTestId("local-graph");
      await expect(graph.locator(`[data-node="${slugOf(PUB_SPOKE)}"]`)).toHaveCount(1);
      await expect(graph.locator("[data-node]")).toHaveCount(1);
      const html = await page.content();
      expect(html).not.toContain(slugOf(SECRET_SPOKE));
      expect(html).not.toContain(SECRET_SPOKE);
    } finally {
      await context.close();
    }
  });

  test("a player sees the hero but never the DM-only Secrets", async ({ browser }) => {
    const { username } = await playerWith(["npc"]);
    const { context, page } = await login(browser, username);
    try {
      await page.goto(`/codex/entry/${slugOf(HERO)}`);
      await expect(page.getByTestId("entry-hero")).toBeVisible();
      expect(await page.content()).not.toContain("smuggler");
    } finally {
      await context.close();
    }
  });
});

async function openPalette(page: Page) {
  await page.getByRole("button", { name: "Search the codex" }).click();
  await expect(page.getByRole("textbox", { name: "Search query" })).toBeVisible();
}

test.describe("recently viewed", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("the palette's empty box lists the last 8 pages viewed, newest first, and drops the 9th", async ({ page }) => {
    const names: string[] = [];
    for (let i = 1; i <= 9; i++) {
      const name = `Zz Recent ${tag} ${i}`;
      names.push(name);
      await insert({ name, kind: "note" });
    }
    for (const name of names) {
      await page.goto(`/codex/entry/${slugOf(name)}`);
      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    }
    await openPalette(page);
    await expect(page.getByText("Recently viewed", { exact: true })).toBeVisible();
    const shown = await page.locator('[data-row-type="entry"]').allTextContents();
    expect(shown).toHaveLength(8);
    // Newest first: 9, 8, ..., 2. Entry 1 fell off.
    names
      .slice(1)
      .reverse()
      .forEach((name, i) => expect(shown[i]).toContain(name));
    expect(shown.join(" ")).not.toContain(names[0]);
  });

  test("typing replaces the recent list with search results", async ({ page }) => {
    const name = `Zz Typed ${tag}`;
    await insert({ name, kind: "note" });
    await page.goto(`/codex/entry/${slugOf(name)}`);
    await openPalette(page);
    await expect(page.getByText("Recently viewed", { exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: "Search query" }).fill("ab");
    await expect(page.getByText("Recently viewed", { exact: true })).toHaveCount(0);
  });

  test("an entry that later becomes secret disappears from a player's recent list, and its name is never sent", async ({ browser }) => {
    const name = `Zz Fades ${tag}`;
    await insert({ name, kind: "note" });
    const { username } = await playerWith(["note"]);
    const { context, page } = await login(browser, username);
    try {
      await page.goto(`/codex/entry/${slugOf(name)}`);
      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
      await openPalette(page);
      await expect(page.locator('[data-row-type="entry"]', { hasText: name })).toBeVisible();
      await page.keyboard.press("Escape");

      await query(`UPDATE entries SET visibility = 'secret' WHERE slug = $1`, [slugOf(name)]);
      const bodies: string[] = [];
      page.on("response", async (r) => {
        if (r.url().includes("/api/recent")) bodies.push(await r.text());
      });
      await page.goto("/");
      await openPalette(page);
      await expect(page.locator('[data-row-type="action"]').first()).toBeVisible();
      await expect(page.locator('[data-row-type="entry"]', { hasText: name })).toHaveCount(0);
      expect(bodies.join("")).not.toContain(name);
    } finally {
      await context.close();
    }
  });

  test("two people on one browser never see each other's trail: the list is keyed by user", async ({ browser }) => {
    const { username, id } = await playerWith(["note"]);
    const { context, page } = await login(browser, username);
    try {
      const secretish = `Zz Other Trail ${tag}`;
      await insert({ name: secretish, kind: "note" });
      // Someone else's trail already in this browser's storage.
      await page.goto("/");
      await page.evaluate(
        ([key, slug]) => window.localStorage.setItem(key, JSON.stringify([slug])),
        [readRecentKeyForTest("someone-else"), slugOf(secretish)],
      );
      await openPalette(page);
      await expect(page.locator('[data-row-type="entry"]', { hasText: secretish })).toHaveCount(0);
      expect(id).toBeTruthy();
    } finally {
      await context.close();
    }
  });

  test("a garbage or hostile stored value is ignored, never crashes the palette", async ({ page }) => {
    await page.goto("/");
    const me = await page.evaluate(() => Object.keys(window.localStorage));
    expect(Array.isArray(me)).toBe(true);
    await page.evaluate(() => {
      for (const key of Object.keys(window.localStorage)) {
        if (key.startsWith("asetheria:recent:")) window.localStorage.setItem(key, '{"not":"an array"}<script>');
      }
    });
    await page.reload();
    await openPalette(page);
    await expect(page.locator('[data-row-type="action"]').first()).toBeVisible();
  });
});

test.describe("/api/recent", () => {
  test("is not available to someone who is signed out", async ({ request }) => {
    const res = await request.get("/api/recent?slugs=anything", { headers: { cookie: "" } });
    expect(res.status()).toBe(401);
  });

  test("returns only what the caller may read, in the order given, and ignores junk slugs", async ({ browser }) => {
    const { username } = await playerWith(["note"]);
    const { context, page } = await login(browser, username);
    try {
      const url = `/api/recent?slugs=${[slugOf(PUB_SPOKE), slugOf(SECRET_SPOKE), "NOT A SLUG!!", "../etc/passwd", slugOf(HUB)].join(",")}`;
      const res = await page.request.get(url);
      expect(res.status()).toBe(200);
      const data = (await res.json()) as { results: { slug: string }[] };
      expect(data.results.map((r) => r.slug)).toEqual([slugOf(PUB_SPOKE), slugOf(HUB)]);
    } finally {
      await context.close();
    }
  });
});
