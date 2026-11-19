import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { closeDbHelpers, createTestPlayer, deleteTestUser, query } from "./db-helpers";

/**
 * Forgot password without email: a player asks, the DM sees the request on the Party page and sets a new
 * password there, which closes the request. The public reply never says whether a name exists.
 */

const ENDPOINT = "/api/auth/forgot";
const PASSWORD = "lantern-and-ledger-7";
const made: string[] = [];
const fromNewAddress = () => ({
  "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
});

async function openRequest(userId: string) {
  const rows = await query<{ note: string }>(`SELECT note FROM password_reset_requests WHERE user_id = $1`, [userId]);
  return rows[0];
}

test.afterAll(async () => {
  for (const id of made) await deleteTestUser(id);
  await closeDbHelpers();
});

test.describe("forgot password: signed out", () => {
  test("[TC-RESET-001] the door and the DM login both link to forgot password", async ({ page }) => {
    await page.goto("/welcome");
    await expect(page.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/forgot-password");
    await page.goto("/login");
    await expect(page.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/forgot-password");
  });

  test("[TC-RESET-002] sign up is offered on the door when registration is open", async ({ page }) => {
    test.skip(!process.env.SIGNUP_CODE?.trim(), "SIGNUP_CODE not set in .env.local");
    await page.goto("/welcome");
    await expect(page.getByRole("link", { name: "New here? Sign up" })).toHaveAttribute("href", "/register");
  });

  test("[TC-RESET-003] a player's request is recorded with their note, and the reply matches an unknown name's", async ({ page, request }) => {
    const name = `zz-reset-${randomUUID().slice(0, 8)}`;
    const id = await createTestPlayer(name, PASSWORD);
    made.push(id);

    await page.goto("/forgot-password");
    await page.getByLabel("Your name").fill(name);
    await page.getByLabel(/Note for the DM/).fill("It's me, the one with the lute");
    await page.getByRole("button", { name: "Ask the DM for a new password" }).click();
    const sent = page.getByTestId("forgot-sent");
    await expect(sent).toBeVisible();
    const known = await sent.getByRole("status").innerText();
    expect((await openRequest(id))?.note).toBe("It's me, the one with the lute");

    const unknown = await request.post(ENDPOINT, { data: { username: `zz-nobody-${randomUUID().slice(0, 8)}` }, headers: fromNewAddress() });
    expect(unknown.status()).toBe(200);
    expect((await unknown.json()).message).toBe(known);
  });

  test("[TC-RESET-004] requests are throttled per address", async ({ request }) => {
    const headers = fromNewAddress();
    for (let i = 0; i < 6; i++) {
      const ok = await request.post(ENDPOINT, { data: { username: "zz-nobody" }, headers });
      expect(ok.status()).toBe(200);
    }
    const blocked = await request.post(ENDPOINT, { data: { username: "zz-nobody" }, headers });
    expect(blocked.status()).toBe(429);
  });

  test("[TC-RESET-005] a missing name is refused", async ({ request }) => {
    const res = await request.post(ENDPOINT, { data: {}, headers: fromNewAddress() });
    expect(res.status()).toBe(400);
  });
});

test.describe("forgot password: DM", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("[TC-RESET-006] the DM sees the request on the Party page, and setting a password closes it", async ({ page, request }) => {
    const name = `zz-reset-${randomUUID().slice(0, 8)}`;
    const id = await createTestPlayer(name, PASSWORD);
    made.push(id);
    const asked = await request.post(ENDPOINT, { data: { username: name, note: "lost it at sea" }, headers: fromNewAddress() });
    expect(asked.status()).toBe(200);

    await page.goto("/characters/party");
    await expect(page.getByTestId("reset-summary")).toContainText(name);
    const card = page.getByTestId("party-account").filter({ hasText: name });
    await expect(card.getByTestId("reset-request")).toContainText("lost it at sea");

    await card.getByLabel("New password").fill("a-brand-new-passphrase");
    await card.getByRole("button", { name: "Set password" }).click();
    await expect(card.getByTestId("reset-request")).toHaveCount(0);
    expect(await openRequest(id)).toBeUndefined();
  });
});
