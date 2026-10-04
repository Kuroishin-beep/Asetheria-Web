/**
 * Runs one of the repo's idempotent .sql files against whichever database
 * DATABASE_URL points at (local Postgres or Neon), one statement at a time.
 * Only plain statements ending in ";" are supported, which is all the files in
 * scripts/sql/ use for schema changes.
 *
 *   npx tsx scripts/apply-sql.ts scripts/sql/maps.sql
 *   npx tsx scripts/apply-sql.ts scripts/sql/maps-rollback.sql
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { connectScriptDb } from "./lib/script-db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");

for (const file of [".env.local", ".env"]) {
  const p = path.join(REPO, file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["'](.*)["']$/s, "$1");
  }
}

const target = process.argv[2];
const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!target || !url) {
  console.error("\n  Usage: DATABASE_URL=... tsx scripts/apply-sql.ts <file.sql>\n");
  process.exit(1);
}

(async () => {
  const text = fs
    .readFileSync(path.resolve(REPO, target), "utf8")
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  const statements = text
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
  const db = connectScriptDb(url);
  for (const statement of statements) await db.execute(sql.raw(statement));
  console.log(`  ${path.basename(target)}: ${statements.length} statements applied`);
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
