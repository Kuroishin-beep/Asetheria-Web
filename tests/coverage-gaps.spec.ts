import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { closeDbHelpers, createTestPlayer, deleteTestUser, query } from "./db-helpers";
import { createEntryViaUI, deleteEphemeralEntry, testName } from "./helpers";

/**
 * Coverage-floor additions: the cases the older specs did not cover. For every
 * user action the catalogue wants one happy, one invalid-input, one
 * unauthorized and one boundary case; these fill the slots that were empty.
 * Everything runs against the real app and the real (test) database.
 */

const SIGNUP_CODE = process.env.SIGNUP_CODE?.trim() ?? "";
const PASSWORD = "correct horse battery staple 42";
const users: string[] = [];

/** Each request pretends to come from its own address so the per-address throttles never couple tests. */
const fromNewAddress = () => ({ "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });

test.afterAll(async () => {
  for (const id of users) await deleteTestUser(id);
  await query(`DELETE FROM users WHERE username LIKE 'zz-cov-%'`);
  await closeDbHelpers();
});

async function playerRequest(browser: import("@playwright/test").Browser) {
  const username = `zz-cov-${randomUUID().slice(0, 8)}`;
  users.push(await createTestPlayer(username, PASSWORD));
  const context = await browser.newContext();
  const res = await context.request.post("/api/auth/login", { data: { username, password: PASSWORD }, headers: fromNewAddress() });
  expect(res.ok()).toBe(true);
  return { context, request: context.request as APIRequestContext };
}

test.describe("party door and registration: input limits", () => {
  test("[TC-COV-001] the party door refuses a 201-character password as bad input (400), and a 200-character wrong one as wrong (401)", async ({ request }) => {
    const tooLong = await request.post("/api/auth/player", { data: { password: "x".repeat(201) }, headers: fromNewAddress() });
    expect(tooLong.status()).toBe(400);
    const atLimit = await request.post("/api/auth/player", { data: { password: "x".repeat(200) }, headers: fromNewAddress() });
    expect(atLimit.status()).toBe(401);
    const noBody = await request.post("/api/auth/player", { data: {}, headers: fromNewAddress() });
    expect(noBody.status()).toBe(400);
  });

  test("[TC-COV-002] registration names: 2 characters refused, 3 and 32 accepted, 33 refused (the edges of the 3 to 32 rule)", async ({ request }) => {
    expect(SIGNUP_CODE, "SIGNUP_CODE must be set in .env.local for the registration checks").not.toBe("");
    const stem = `zz-cov-${randomUUID().slice(0, 6)}`;
    const attempt = (username: string) => request.post("/api/auth/register", { data: { username, password: PASSWORD, code: SIGNUP_CODE }, headers: fromNewAddress() });
    expect((await attempt("zz")).status()).toBe(400);
    expect((await attempt("z".repeat(33))).status()).toBe(400);
    const three = `z${stem.slice(-2)}`; // 3 characters
    const thirtyTwo = `${stem}${"x".repeat(32 - stem.length)}`; // exactly 32
    expect(thirtyTwo.length).toBe(32);
    for (const name of [three, thirtyTwo]) {
      const res = await attempt(name);
      expect(res.ok(), `${name.length} characters should be accepted`).toBe(true);
    }
    const rows = await query<{ id: string }>(`SELECT id FROM users WHERE lower(username) = ANY($1)`, [[three.toLowerCase(), thirtyTwo.toLowerCase()]]);
    expect(rows).toHaveLength(2);
    users.push(...rows.map((r) => r.id));
  });

  test("[TC-COV-003] a bad character in a registration name is refused with the reason, and nothing is created", async ({ request }) => {
    expect(SIGNUP_CODE).not.toBe("");
    const name = `zz-cov-<b>${randomUUID().slice(0, 4)}`;
    const res = await request.post("/api/auth/register", { data: { username: name, password: PASSWORD, code: SIGNUP_CODE }, headers: fromNewAddress() });
    expect(res.status()).toBe(400);
    expect(JSON.stringify(await res.json())).toMatch(/letters, numbers/i);
    expect(await query(`SELECT 1 FROM users WHERE username = $1`, [name])).toHaveLength(0);
  });
});

test.describe("signing out", () => {
  test("[TC-COV-004] signing out twice is harmless, and the protected pages stay protected", async ({ browser }) => {
    const { context, request } = await playerRequest(browser);
    try {
      expect((await request.post("/api/auth/logout")).ok()).toBe(true);
      expect((await request.post("/api/auth/logout")).ok()).toBe(true);
      const page = await context.newPage();
      await page.goto("/search");
      await expect(page).toHaveURL(/\/welcome/);
    } finally {
      await context.close();
    }
  });
});

test.describe("signed-out visitors and non-DMs on the data routes", () => {
  test("[TC-COV-005] a signed-out visitor to the dice tool is sent to the door and keeps the way back", async ({ page }) => {
    await page.goto("/tools/dice");
    await expect(page).toHaveURL(/\/welcome\?next=%2Ftools%2Fdice/);
  });

  test("[TC-COV-006] palette search is 401 signed out, and refuses to search for fewer than 2 characters", async ({ request, browser }) => {
    expect((await request.get("/api/find?q=ab")).status()).toBe(401);
    const { context, request: player } = await playerRequest(browser);
    try {
      const one = await player.get("/api/find?q=a");
      expect(one.status()).toBe(200);
      expect((await one.json()).results).toEqual([]);
      const two = await player.get("/api/find?q=ab");
      expect(two.status()).toBe(200);
      expect(Array.isArray((await two.json()).results)).toBe(true);
    } finally {
      await context.close();
    }
  });

  test("[TC-COV-007] restoring a backup is 401 signed out and 403 for a player, and a valid-looking file changes nothing for them", async ({ request, browser }) => {
    const body = { format: "asetheria-codex", entries: [{ name: `Zz Not Allowed ${randomUUID().slice(0, 6)}` }] };
    expect((await request.post("/api/import", { data: body })).status()).toBe(401);
    const { context, request: player } = await playerRequest(browser);
    try {
      expect((await player.post("/api/import", { data: body })).status()).toBe(403);
      expect(await query(`SELECT 1 FROM entries WHERE name = $1`, [body.entries[0].name])).toHaveLength(0);
      expect((await player.get("/api/export")).status()).toBe(403);
    } finally {
      await context.close();
    }
  });
});

test.describe("searching with extreme input", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("[TC-COV-008] a 5,000-character query and a query of symbols give a normal page, never a server error", async ({ page, request }) => {
    for (const q of ["x".repeat(5000), "%%%___\\\\''\"\"<>&;--", "   "]) {
      const res = await page.goto(`/search?q=${encodeURIComponent(q)}`);
      expect(res?.status(), `/search for ${q.slice(0, 10)}…`).toBeLessThan(500);
      await expect(page.getByRole("main")).toBeVisible();
    }
    const palette = await request.get(`/api/find?q=${encodeURIComponent("y".repeat(5000))}`);
    expect(palette.status()).toBeLessThan(500);
  });
});

test.describe("managing player access: bad requests", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("[TC-COV-009] the access API refuses an unknown action, an unknown kind, a bad id and an empty entry list, and changes nothing", async ({ request }) => {
    const before = await query<{ n: string }>(`SELECT count(*)::text AS n FROM entry_grants`);
    const id = randomUUID();
    const bad: Record<string, unknown>[] = [
      { action: "teleport", playerId: id },
      { action: "toggleKind", playerId: id, kind: "not-a-kind", granted: true },
      { action: "toggleKind", playerId: "not-a-uuid", kind: "npc", granted: true },
      { action: "bulkEntries", playerId: id, entryIds: [], granted: true },
      { action: "bulkEntries", playerId: id, entryIds: ["nope"], granted: true },
      {},
    ];
    for (const data of bad) {
      const res = await request.post("/api/rbac", { data });
      expect(res.status(), JSON.stringify(data)).toBe(400);
    }
    const after = await query<{ n: string }>(`SELECT count(*)::text AS n FROM entry_grants`);
    expect(after[0].n).toBe(before[0].n);
  });
});

test.describe("entry names: the 300-character boundary and editing to blank", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("[TC-COV-012] a 300-character name is accepted; the field holds no more than 300, and the server refuses 301 even when that limit is bypassed", async ({ page }) => {
    test.slow();
    const stem = testName("limit");
    const ok = `${stem}${"a".repeat(300 - stem.length)}`;
    const over = `${stem}${"b".repeat(301 - stem.length)}`;
    let slug: string | undefined;
    try {
      slug = await createEntryViaUI(page, { name: ok });
      expect((await query<{ name: string }>(`SELECT name FROM entries WHERE slug = $1`, [slug]))[0].name).toHaveLength(300);

      await page.goto("/codex/new?kind=note");
      const field = page.locator("#name");
      await field.fill(over);
      expect((await field.inputValue()).length).toBe(300); // the browser stops at the limit

      // Bypass the browser's limit: the server must still refuse.
      await field.evaluate((el) => el.removeAttribute("maxlength"));
      await field.fill(over);
      expect((await field.inputValue()).length).toBe(301);
      await page.getByRole("button", { name: "Create entry" }).click();
      await expect(page.locator('p[role="alert"]')).toBeVisible();
      await expect(page).toHaveURL(/\/codex\/new/);
      expect(await query(`SELECT 1 FROM entries WHERE name = $1`, [over])).toHaveLength(0);
    } finally {
      // The archive page's purge helper has to find a 300-character name on screen, which takes longer than the
      // test may run; this row is test data in the local test database, so it is removed directly.
      if (slug) await query(`DELETE FROM entries WHERE slug = $1 AND name LIKE 'zz-playwright-limit-%'`, [slug]);
    }
  });

  test("[TC-COV-011] saving an existing entry with a blank name is refused, and the stored name is unchanged", async ({ page }) => {
    test.slow();
    const name = testName("blank-edit");
    let slug: string | undefined;
    try {
      slug = await createEntryViaUI(page, { name });
      await page.goto(`/codex/entry/${slug}/edit`);
      await page.getByLabel("Name *", { exact: true }).fill("   ");
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect(page.locator('p[role="alert"]')).toContainText("Every entry needs a name.");
      expect((await query<{ name: string }>(`SELECT name FROM entries WHERE slug = $1`, [slug]))[0].name).toBe(name);
    } finally {
      if (slug) await deleteEphemeralEntry(page, slug).catch(() => undefined);
    }
  });
});
