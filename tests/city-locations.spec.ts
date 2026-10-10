import { expect, test } from "@playwright/test";

/**
 * The places inside each city (data/city-locations.json): every capital and
 * major city lists its common institutions and unique landmarks under
 * "Within …", and each place links back to its city.
 */
test.describe("places within cities", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("[TC-CITY-001] a Hellenorian city lists its shared institutions and its own landmarks", async ({ page }) => {
    await page.goto("/codex/entry/corinth-city");
    const within = page.locator("section", { has: page.getByRole("heading", { name: "Within Corinth City" }) });
    await expect(within.getByRole("link", { name: /The Agora of Corinth/ })).toBeVisible();
    await expect(within.getByRole("link", { name: /The Theatre of Corinth/ })).toBeVisible();
    await expect(within.getByRole("link", { name: /The Haulway of Corinth/ })).toBeVisible();
  });

  test("[TC-CITY-002] a common institution explains the type, then the city's own version, and points back to the city", async ({ page }) => {
    await page.goto("/codex/entry/the-bazaar-of-atarabad");
    const body = page.locator(".prose-codex");
    await expect(body).toContainText("An Acheaorian bazaar is a district");
    await expect(body.getByRole("heading", { name: "In Atarabad" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: /Atarabad City/ })).toBeVisible();
  });

  test("[TC-CITY-003] Duneforged's existing districts and temples are filed under it", async ({ page }) => {
    await page.goto("/codex/entry/duneforged-citadel");
    const within = page.locator("section", { has: page.getByRole("heading", { name: "Within Duneforged Citadel" }) });
    await expect(within.getByRole("link", { name: /The Ju Colliseum/ })).toBeVisible();
    await expect(within.getByRole("link", { name: /The Molten Crucible/ })).toBeVisible();
    await page.goto("/codex/entry/citadel-cathedral");
    const temples = page.locator("section", { has: page.getByRole("heading", { name: "Within Citadel Cathedral" }) });
    await expect(temples.getByRole("link", { name: /Forge of Vulcan/ })).toBeVisible();
  });

  test("[TC-CITY-004] Romulo has no garrison page, because its write-up says it keeps none", async ({ page }) => {
    const res = await page.goto("/codex/entry/the-romulo-garrison");
    expect(res?.status()).toBe(404);
  });
});
