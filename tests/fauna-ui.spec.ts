import { expect, test } from "@playwright/test";
import { closeDbHelpers, query } from "./db-helpers";
import { deleteEphemeralEntry, testName } from "./helpers";

/**
 * Fauna (and the place fields shared with flora and ore): a DM can create an
 * animal with every field, see it in its section, and the "Found in" property
 * connects it to the places it names.
 */

test.use({ storageState: "tests/.auth/dm.json" });

test.afterAll(async () => {
  await closeDbHelpers();
});

test("a DM creates an animal with every field and sees it on its page and in the Fauna section", async ({ page }) => {
  test.slow();
  const name = testName("fauna");
  let slug: string | undefined;
  try {
    await page.goto("/codex/new?kind=fauna");
    await expect(page.getByRole("heading", { level: 1, name: "New Animal" })).toBeVisible();
    await page.getByLabel("Name *", { exact: true }).fill(name);
    await page.getByLabel("Summary", { exact: true }).fill("A test animal of the isthmus.");
    const values: Record<string, string> = {
      "Scientific Name": "Testus faunus",
      "Found in": "Corinth City",
      Biome: "Coast",
      Rarity: "Uncommon",
      Habitat: "Salt marsh behind the haulway",
      Diet: "Brine shrimp",
      Behavior: "Nests in dockside timber.",
      Harvest: "Down feathers, once a season.",
      Effects: "Calms seasick sailors.",
      Lore: "Said to follow ships that carry no iron.",
    };
    for (const [label, value] of Object.entries(values)) {
      await page.getByLabel(label, { exact: true }).fill(value);
    }
    await page.getByRole("button", { name: "Create entry" }).click();
    await page.waitForURL(/\/codex\/entry\/.+/);
    slug = decodeURIComponent(page.url().match(/\/codex\/entry\/([^/?#]+)/)![1]);

    for (const value of Object.values(values)) await expect(page.getByText(value, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Animals" })).toHaveCount(0);

    await page.goto("/codex/fauna");
    await expect(page.getByText(name, { exact: true })).toBeVisible();
    const stored = await query<{ kind: string }>(`SELECT kind FROM entries WHERE slug = $1`, [slug]);
    expect(stored[0].kind).toBe("fauna");
  } finally {
    if (slug) await deleteEphemeralEntry(page, slug).catch(() => {});
  }
});

test("'Found in' makes a real connection: plain names and [[links]] both reach the place, unknown names are ignored", async ({ page }) => {
  test.slow();
  const plain = testName("found-plain");
  const bracketed = testName("found-link");
  const slugs: string[] = [];
  try {
    for (const [name, foundIn] of [
      [plain, "Corinth City, Nowhere Land Of Nothing"],
      [bracketed, "[[Corinth City|the isthmus]]"],
    ]) {
      await page.goto("/codex/new?kind=flora");
      await page.getByLabel("Name *", { exact: true }).fill(name);
      await page.getByLabel("Found in", { exact: true }).fill(foundIn);
      await page.getByRole("button", { name: "Create entry" }).click();
      await page.waitForURL(/\/codex\/entry\/.+/);
      slugs.push(decodeURIComponent(page.url().match(/\/codex\/entry\/([^/?#]+)/)![1]));
    }

    const edges = await query<{ relation: string }>(
      `SELECT l.relation FROM links l JOIN entries s ON s.id = l.source_id JOIN entries t ON t.id = l.target_id
       WHERE s.slug = ANY($1) AND t.slug = 'corinth-city' AND l.relation = 'found-in'`,
      [slugs],
    );
    expect(edges).toHaveLength(2);

    await page.goto("/codex/entry/corinth-city");
    await expect(page.getByRole("link", { name: new RegExp(plain) })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(bracketed) })).toBeVisible();
  } finally {
    for (const slug of slugs) await deleteEphemeralEntry(page, slug).catch(() => {});
  }
});

test("ore, flora and fauna forms all offer Found in, Biome and Rarity", async ({ page }) => {
  for (const kind of ["ore", "flora", "fauna"]) {
    await page.goto(`/codex/new?kind=${kind}`);
    for (const label of ["Found in", "Biome", "Rarity"]) {
      await expect(page.getByLabel(label, { exact: true }), `${kind}: ${label}`).toBeVisible();
    }
  }
});

test("the Flora and Fauna sections are separate, and the old combined address still opens", async ({ page }) => {
  await page.goto("/codex/flora");
  await expect(page.getByRole("heading", { level: 1, name: "Flora" })).toBeVisible();
  await page.goto("/codex/fauna");
  await expect(page.getByRole("heading", { level: 1, name: "Fauna" })).toBeVisible();
  const res = await page.goto("/codex/flora-fauna");
  expect(res?.status()).toBe(200);
  await expect(page).toHaveURL(/\/codex\/flora$/);
});
