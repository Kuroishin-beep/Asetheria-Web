import { request, type FullConfig } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "./load-env";

loadEnv();

/**
 * Logs in as the DM and player test accounts once and saves each session's
 * cookie jar to tests/.auth/*.json, so individual specs can start already
 * authenticated instead of re-driving the login form every time (the login
 * form itself is exercised directly by tests/auth.spec.ts).
 *
 * Credentials come from .env.local (DM_USERNAME/DM_PASSWORD/
 * PLAYER_USERNAME/PLAYER_PASSWORD) — the same accounts scripts/seed.ts
 * created in the local test database.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL ?? "http://localhost:3000";
  const authDir = path.join(__dirname, ".auth");
  fs.mkdirSync(authDir, { recursive: true });

  const accounts = [
    {
      file: "dm.json",
      username: process.env.DM_USERNAME ?? "playwright-dm",
      password: process.env.DM_PASSWORD,
    },
    {
      file: "player.json",
      username: process.env.PLAYER_USERNAME ?? "playwright-player",
      password: process.env.PLAYER_PASSWORD,
    },
  ];

  for (const acct of accounts) {
    if (!acct.password) {
      throw new Error(
        `Missing password env var for "${acct.username}" — is .env.local loaded? ` +
          `Set DM_PASSWORD / PLAYER_PASSWORD before running the suite.`,
      );
    }
    const ctx = await request.newContext({ baseURL });
    const res = await ctx.post("/api/auth/login", {
      data: { username: acct.username, password: acct.password },
    });
    if (!res.ok()) {
      throw new Error(
        `Login failed for "${acct.username}" (${res.status()}): ${await res.text()}`,
      );
    }
    await ctx.storageState({ path: path.join(authDir, acct.file) });
    await ctx.dispose();
  }
}
