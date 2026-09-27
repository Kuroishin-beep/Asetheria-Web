/**
 * One-time data migration for the RBAC feature (PLAN.md Phase 0).
 *
 * Before per-player grants existed, every player account saw every
 * non-secret entry. Introducing `entry_grants` as a default-deny allowlist
 * would silently strip that access from any player account that already
 * existed — this script grandfathers them by inserting a "granted" row for
 * every entry kind, replicating their old effective access exactly.
 *
 * Run once per database (idempotent — `onConflictDoNothing`, safe to re-run):
 *
 *   npx tsx scripts/migrate-legacy-players.ts
 *
 * Do NOT run this for brand-new player accounts — they should go through
 * the normal `/welcome` onboarding flow instead, which grants only the
 * default subset (empires + major cities), not everything.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzleNode } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, sql } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { users, entryGrants, entryKind } from "../src/db/schema";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");

for (const file of [".env.local", ".env"]) {
  const p = path.join(REPO, file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["'](.*)["']$/s, "$1");
    }
  }
}

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!url) {
  console.error("\n  DATABASE_URL is not set.\n");
  process.exit(1);
}

const isNeon = /neon\.tech|neon\.build/.test(url);
const pool = isNeon ? null : new Pool({ connectionString: url, max: 5 });
const db = (
  isNeon ? drizzleNeon(neon(url), { schema }) : drizzleNode(pool!, { schema })
) as ReturnType<typeof drizzleNeon<typeof schema>>;

async function main() {
  const players = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.role, "player"));

  if (players.length === 0) {
    console.log("  No player accounts found — nothing to migrate.");
    return;
  }

  let inserted = 0;
  for (const player of players) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(entryGrants)
      .where(eq(entryGrants.userId, player.id));

    if (count > 0) {
      console.log(`  · "${player.username}" already has grants — skipped.`);
      continue;
    }

    for (const kind of entryKind.enumValues) {
      await db
        .insert(entryGrants)
        .values({ userId: player.id, kind, granted: true })
        .onConflictDoNothing();
      inserted++;
    }
    console.log(
      `  ✓ "${player.username}" grandfathered — granted all ${entryKind.enumValues.length} kinds.`,
    );
  }

  console.log(`\n  Done — ${inserted} grant rows inserted.\n`);
  await pool?.end();
}

main().catch(async (err) => {
  console.error("\n  Migration failed:\n", err);
  await pool?.end();
  process.exit(1);
});
