import { randomUUID } from "node:crypto";
import { expect, test, type Browser } from "@playwright/test";
import { closeDbHelpers, createTestPlayer, deleteTestUser, query } from "./db-helpers";

/**
 * Granting a city to a player shows the places inside it (forum, harbour,
 * temples) without granting each one. An explicit row on a place — or on a
 * nearer ancestor — still decides.
 */

const PASSWORD = "correct horse battery staple 42";

async function entryId(slug: string) {
  const rows = await query<{ id: string }>(`SELECT id FROM entries WHERE slug = $1`, [slug]);
  if (!rows[0]) throw new Error(`fixture missing: ${slug}`);
  return rows[0].id;
}

async function grant(userId: string, slug: string, granted: boolean) {
  await query(
    `INSERT INTO entry_grants (user_id, entry_id, granted) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, entry_id) DO UPDATE SET granted = EXCLUDED.granted`,
    [userId, await entryId(slug), granted],
  );
}

async function playerSession(browser: Browser) {
  const username = `zz-inherit-${randomUUID().slice(0, 8)}`;
  const userId = await createTestPlayer(username, PASSWORD);
  // Named already, so the onboarding gate doesn't intercept the visits below.
  await query(`UPDATE users SET display_name = $1 WHERE id = $2`, ["Inheritance Tester", userId]);
  const context = await browser.newContext();
  const page = await context.newPage();
  const res = await page.request.post("/api/auth/login", { data: { username, password: PASSWORD } });
  expect(res.ok()).toBe(true);
  return { userId, context, page };
}

test.afterAll(async () => {
  await closeDbHelpers();
});

test("granting a city shows its places; an explicit denial on a place still hides it", async ({ browser }) => {
  const { userId, context, page } = await playerSession(browser);
  try {
    // No grants at all: neither the city nor its agora.
    expect((await page.goto("/codex/entry/the-agora-of-corinth"))?.status()).toBe(404);

    await grant(userId, "corinth-city", true);
    expect((await page.goto("/codex/entry/the-agora-of-corinth"))?.status()).toBe(200);
    await page.goto("/codex/entry/corinth-city");
    const within = page.locator("section", { has: page.getByRole("heading", { name: "Within Corinth City" }) });
    await expect(within.getByRole("link", { name: /The Haulway of Corinth/ })).toBeVisible();

    // The DM can still hold one place back.
    await grant(userId, "the-haulway-of-corinth", false);
    expect((await page.goto("/codex/entry/the-haulway-of-corinth"))?.status()).toBe(404);
    expect((await page.goto("/codex/entry/the-agora-of-corinth"))?.status()).toBe(200);
  } finally {
    await context.close();
    await deleteTestUser(userId);
  }
});

test("inheritance passes through levels, and the nearest explicit row decides", async ({ browser }) => {
  const { userId, context, page } = await playerSession(browser);
  try {
    // Duneforged → Citadel Cathedral → Forge of Vulcan.
    await grant(userId, "duneforged-citadel", true);
    expect((await page.goto("/codex/entry/forge-of-vulcan"))?.status()).toBe(200);

    // Denying the cathedral hides its temples, though the city stays granted.
    await grant(userId, "citadel-cathedral", false);
    expect((await page.goto("/codex/entry/forge-of-vulcan"))?.status()).toBe(404);
    expect((await page.goto("/codex/entry/the-ju-colliseum"))?.status()).toBe(200);
  } finally {
    await context.close();
    await deleteTestUser(userId);
  }
});
