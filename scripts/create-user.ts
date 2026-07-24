/**
 * Adds or updates an account.
 *
 *   npm run user:add -- --username alice --password "s3cret pass" --role player
 *
 * Re-running with an existing username resets that account's password and
 * invalidates its outstanding sessions.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { users } from "../src/db/schema";
import { hashPassword, passwordProblem } from "../src/lib/password";

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

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const username = arg("username");
const password = arg("password");
const role = (arg("role") ?? "player") as "dm" | "player";

if (!username || !password) {
  console.error(
    '\n  Usage: npm run user:add -- --username NAME --password "PASS" [--role dm|player]\n',
  );
  process.exit(1);
}
if (role !== "dm" && role !== "player") {
  console.error("\n  --role must be 'dm' or 'player'\n");
  process.exit(1);
}
const problem = passwordProblem(password);
if (problem) {
  console.error(`\n  ${problem}\n`);
  process.exit(1);
}

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!url) {
  console.error("\n  DATABASE_URL is not set.\n");
  process.exit(1);
}

const db = drizzle(neon(url), { schema });

async function main() {
  const hash = await hashPassword(password!);
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username!})`)
    .limit(1);

  if (existing) {
    await db
      .update(users)
      .set({
        passwordHash: hash,
        role,
        // Force every existing session for this account to re-authenticate.
        sessionEpoch: sql`${users.sessionEpoch} + 1`,
      })
      .where(sql`id = ${existing.id}`);
    console.log(`\n  Updated "${username}" (role: ${role}). Existing sessions revoked.\n`);
  } else {
    await db.insert(users).values({ username: username!, passwordHash: hash, role });
    console.log(`\n  Created "${username}" (role: ${role}).\n`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
