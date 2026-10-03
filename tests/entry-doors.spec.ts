import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  countGrantsForUser,
  deleteTestUser,
  getUserDisplayName,
  query,
  closeDbHelpers,
} from "./db-helpers";

/**
 * The entry paths merged in from main: the /welcome door page, the
 * password-gated party door, and invite-code registration. Registration tests
 * need SIGNUP_CODE in .env.local (the dev server must see it too).
 */
const SIGNUP_CODE = process.env.SIGNUP_CODE?.trim();
// The party door opens the shared player account with that account's password.
const PARTY_PASSWORD = process.env.PLAYER_PASSWORD ?? "";

async function userIdByName(username: string) {
  const rows = await query<{ id: string; role: string }>(
    `SELECT id, role FROM users WHERE lower(username) = lower($1)`,
    [username],
  );
  return rows[0];
}

test.afterAll(async () => {
  await closeDbHelpers();
});

test.describe("welcome doors", () => {
  test("/welcome offers both the party door and the DM sign-in", async ({ page }) => {
    await page.goto("/welcome?next=%2Fsearch");
    await expect(page.getByRole("button", { name: "Enter as a player" })).toBeVisible();
    const dmLink = page.getByRole("link", { name: /sign in/i }).first();
    await expect(dmLink).toHaveAttribute("href", "/login?next=%2Fsearch");
  });

  test("the party door signs in as a player, honors next, and hides DM controls", async ({ page }) => {
    await page.goto("/welcome?next=%2Fsearch");
    await page.getByLabel("Party password").fill(PARTY_PASSWORD);
    await page.getByRole("button", { name: "Enter as a player" }).click();
    await page.waitForURL((url) => url.pathname !== "/welcome");
    // A shared player account without a name is sent to /onboarding first.
    expect(["/search", "/onboarding"]).toContain(new URL(page.url()).pathname);
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin$/);
  });

  test("the party door refuses a wrong or missing password", async ({ page, request }) => {
    const missing = await request.post("/api/auth/player", { data: {} });
    expect(missing.status()).toBe(400);
    await page.goto("/welcome");
    await expect(page.getByRole("button", { name: "Enter as a player" })).toBeDisabled();
    await page.getByLabel("Party password").fill(`wrong-${randomUUID()}`);
    await page.getByRole("button", { name: "Enter as a player" }).click();
    await expect(page.locator("#door-error")).toContainText("party password");
    await expect(page).toHaveURL(/\/welcome/);
  });

  test("the party door ignores a cross-site next", async ({ page }) => {
    await page.goto("/welcome?next=//evil.example.com");
    await page.getByLabel("Party password").fill(PARTY_PASSWORD);
    await page.getByRole("button", { name: "Enter as a player" }).click();
    await page.waitForURL((url) => url.pathname !== "/welcome");
    expect(page.url()).not.toContain("evil.example.com");
  });
});

test.describe("registration", () => {
  test("a wrong invite code is refused", async ({ request }) => {
    test.skip(!SIGNUP_CODE, "SIGNUP_CODE not set in .env.local");
    const res = await request.post("/api/auth/register", {
      data: { username: `zz-reg-${randomUUID().slice(0, 8)}`, password: "correct horse battery staple", code: "nope" },
    });
    expect(res.status()).toBe(403);
  });

  test("registering via the form creates a named player with default grants", async ({ page }) => {
    test.skip(!SIGNUP_CODE, "SIGNUP_CODE not set in .env.local");
    const username = `zz-reg-${randomUUID().slice(0, 8)}`;
    const password = "correct horse battery staple";
    try {
      await page.goto("/register");
      await page.fill("#username", username);
      await page.fill("#password", password);
      await page.fill("#confirm", password);
      await page.fill("#code", SIGNUP_CODE!);
      await page.getByRole("button", { name: "Join the party" }).click();
      await page.waitForURL("/");

      const user = await userIdByName(username);
      expect(user.role).toBe("player");
      expect(await getUserDisplayName(user.id)).toBe(username);
      // Skips /onboarding, so the defaults must be granted at registration.
      expect(await countGrantsForUser(user.id)).toBeGreaterThan(0);
      await page.goto("/search");
      await expect(page).toHaveURL(/\/search/);
    } finally {
      const user = await userIdByName(username);
      if (user) await deleteTestUser(user.id);
    }
  });

  test("the request body cannot choose the DM role", async ({ request }) => {
    test.skip(!SIGNUP_CODE, "SIGNUP_CODE not set in .env.local");
    const username = `zz-reg-${randomUUID().slice(0, 8)}`;
    try {
      const res = await request.post("/api/auth/register", {
        data: { username, password: "correct horse battery staple", code: SIGNUP_CODE, role: "dm" },
      });
      expect(res.ok()).toBe(true);
      expect((await userIdByName(username)).role).toBe("player");
    } finally {
      const user = await userIdByName(username);
      if (user) await deleteTestUser(user.id);
    }
  });
});
