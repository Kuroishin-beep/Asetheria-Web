import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { closeDbHelpers, createTestPlayer, deleteTestUser, query } from "./db-helpers";

/**
 * Player logins on the Party page: the DM gives each player a name and password, the player signs in at the
 * party door with them and lands on their own characters, and the DM can hand characters between players.
 */

const ENDPOINT = "/api/party/accounts";
const PASSWORD = "lantern-and-ledger-7";
const made: string[] = [];

async function userIdByName(username: string) {
  const rows = await query<{ id: string }>(`SELECT id FROM users WHERE lower(username) = lower($1)`, [username]);
  return rows[0]?.id;
}

test.afterAll(async () => {
  for (const id of made) await deleteTestUser(id);
  await closeDbHelpers();
});

test.describe("player logins: DM", () => {
  test.use({ storageState: "tests/.auth/dm.json" });

  test("[TC-PLOG-001] the DM adds a player login, seeing the password before saving it", async ({ page }) => {
    const name = `zz-plog-${randomUUID().slice(0, 8)}`;
    await page.goto("/characters/party");
    const panel = page.getByTestId("party-accounts");
    await expect(panel.getByRole("heading", { name: "Player logins" })).toBeVisible();
    await panel.getByLabel("Name").fill(name);
    const field = panel.locator("#new-player-password");
    await field.fill(PASSWORD);
    await expect(field).toHaveAttribute("type", "password");
    await panel.getByRole("button", { name: "Show password" }).first().click();
    await expect(field).toHaveAttribute("type", "text");
    await panel.getByRole("button", { name: "Add player" }).click();
    await expect(panel.getByTestId("party-account").filter({ hasText: name })).toBeVisible();
    const id = await userIdByName(name);
    expect(id).toBeTruthy();
    made.push(id!);
    const [row] = await query<{ role: string }>(`SELECT role FROM users WHERE id = $1`, [id]);
    expect(row.role).toBe("player");
  });

  test("[TC-PLOG-002] a short password or a taken name is refused", async ({ request }) => {
    const short = await request.post(ENDPOINT, { data: { action: "create", username: `zz-plog-${randomUUID().slice(0, 8)}`, password: "short" } });
    expect(short.status()).toBe(400);
    const name = `zz-plog-${randomUUID().slice(0, 8)}`;
    const first = await request.post(ENDPOINT, { data: { action: "create", username: name, password: PASSWORD } });
    expect(first.status()).toBe(201);
    made.push((await first.json()).id);
    const again = await request.post(ENDPOINT, { data: { action: "create", username: name.toUpperCase(), password: PASSWORD } });
    expect(again.status()).toBe(409);
  });

  test("[TC-PLOG-003] the DM hands a character to a player and resets their password", async ({ request }) => {
    const from = await createTestPlayer(`zz-plog-${randomUUID().slice(0, 8)}`, PASSWORD);
    const to = await createTestPlayer(`zz-plog-${randomUUID().slice(0, 8)}`, PASSWORD);
    made.push(from, to);
    const [c] = await query<{ id: string }>(
      `INSERT INTO characters (user_id, name, input, sheet) VALUES ($1, 'Test Wanderer', '{}', '{}') RETURNING id`,
      [from],
    );
    const give = await request.post(ENDPOINT, { data: { action: "giveCharacter", playerId: to, characterId: c.id } });
    expect(give.status()).toBe(200);
    const [owner] = await query<{ user_id: string }>(`SELECT user_id FROM characters WHERE id = $1`, [c.id]);
    expect(owner.user_id).toBe(to);

    const reset = await request.post(ENDPOINT, { data: { action: "resetPassword", playerId: to, password: "a-brand-new-passphrase" } });
    expect(reset.status()).toBe(200);
    const [epoch] = await query<{ session_epoch: number }>(`SELECT session_epoch FROM users WHERE id = $1`, [to]);
    expect(epoch.session_epoch).toBeGreaterThan(0);
  });
});

test.describe("player logins: player", () => {
  test("[TC-PLOG-004] a player signs in at the party door with their own name and lands on their characters", async ({ page }) => {
    const name = `zz-plog-${randomUUID().slice(0, 8)}`;
    const player = await createTestPlayer(name, PASSWORD);
    made.push(player);
    await page.goto("/welcome");
    await page.getByLabel("Your name").fill(name);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Enter as a player" }).click();
    await page.waitForURL((url) => url.pathname !== "/welcome");
    expect(["/characters", "/onboarding"]).toContain(new URL(page.url()).pathname);
  });

  test("[TC-PLOG-005] a player can neither see nor call the DM's login panel", async ({ browser }) => {
    const context = await browser.newContext({ storageState: "tests/.auth/player.json" });
    const page = await context.newPage();
    await page.goto("/characters/party");
    await expect(page.getByTestId("party-accounts")).toHaveCount(0);
    const res = await page.request.post(ENDPOINT, { data: { action: "create", username: "zz-sneaky", password: PASSWORD } });
    expect(res.status()).toBe(403);
    await context.close();
  });
});
