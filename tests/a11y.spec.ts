import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * WCAG 2.x A/AA automated audit (axe-core) of the key routes in both themes.
 * Fails on any violation of impact "serious" or "critical". Colour contrast is
 * included, so this is also the check that the real rendered pairs, not just
 * the token values, meet 4.5:1.
 */

const ROUTES: { name: string; path: string; auth: "dm" | "player" | null }[] = [
  { name: "login", path: "/login", auth: null },
  { name: "welcome", path: "/welcome", auth: null },
  { name: "front page", path: "/", auth: "dm" },
  { name: "section list", path: "/codex/npcs", auth: "dm" },
  { name: "entry page", path: "/codex/entry/corinth-city", auth: "dm" },
  { name: "NPC page (hero card, local graph)", path: "/codex/entry/arthur-ramaris", auth: "dm" },
  { name: "new entry form", path: "/codex/new?kind=npc", auth: "dm" },
  { name: "search results", path: "/search?q=bacchus", auth: "dm" },
  { name: "graph", path: "/graph", auth: "dm" },
  { name: "map", path: "/map/wip-map", auth: "dm" },
  { name: "map (player)", path: "/map/wip-map", auth: "player" },
  { name: "dice", path: "/tools/dice", auth: "dm" },
  { name: "random table (rollable)", path: "/codex/entry/herbalists-field-guide-d20", auth: "dm" },
  { name: "new table form", path: "/codex/new?kind=table", auth: "dm" },
  { name: "fauna section", path: "/codex/fauna", auth: "dm" },
  { name: "database view (ores, sorted)", path: "/codex/ores?view=table&sort=costPerLb&dir=desc", auth: "dm" },
  { name: "backup and import", path: "/admin", auth: "dm" },
  { name: "players and access", path: "/admin/rbac", auth: "dm" },
  { name: "player front page", path: "/", auth: "player" },
];

/** Entrance animations (page fade, card stagger) run for under a second; axe must see the settled colours. */
const SETTLE_MS = 1200;

async function audit(page: Page) {
  await page.waitForTimeout(SETTLE_MS);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.impact}: ${v.id} (${v.nodes.length}) ${v.help} -> ${v.nodes[0]?.target.join(" ")}`);
}

for (const theme of ["dark", "light"] as const) {
  for (const route of ROUTES) {
    test(`a11y: ${route.name} (${route.auth ?? "signed out"}) in ${theme} theme has no serious or critical violations`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        storageState: route.auth ? `tests/.auth/${route.auth}.json` : undefined,
        viewport: { width: 1280, height: 900 },
      });
      await context.addInitScript((t) => localStorage.setItem("asetheria-theme", t), theme);
      const page = await context.newPage();
      await page.goto(route.path, { waitUntil: "networkidle" });
      expect(await audit(page)).toEqual([]);
      await context.close();
    });
  }
}

test("a11y: the mobile drawer and the command palette are accessible when open", async ({ browser }) => {
  const context = await browser.newContext({ storageState: "tests/.auth/dm.json", viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Toggle navigation menu" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await audit(page)).toEqual([]);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Search the codex" }).click();
  await expect(page.getByRole("dialog", { name: "Search the codex" })).toBeVisible();
  expect(await audit(page)).toEqual([]);
  await context.close();
});
