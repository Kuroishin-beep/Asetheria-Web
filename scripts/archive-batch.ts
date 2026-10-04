/**
 * Archives (or restores) every entry from one content batch, identified by the
 * `source_path` the importer stamped on it, e.g. "original: natural-world/ores-1".
 * Nothing is deleted: archived entries leave the codex and can be restored.
 *
 *   npx tsx scripts/archive-batch.ts "original: natural-world/ores-1"            (dry run)
 *   npx tsx scripts/archive-batch.ts "original: natural-world/ores-1" --apply
 *   npx tsx scripts/archive-batch.ts "original: natural-world/ores-1" --restore --apply
 *   npx tsx scripts/archive-batch.ts "original: natural-world" --apply            (a prefix takes the whole set)
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
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["'](.*)["']$/s, "$1");
    }
  }
}

const args = process.argv.slice(2);
const prefix = args.find((a) => !a.startsWith("--"));
const APPLY = args.includes("--apply");
const RESTORE = args.includes("--restore");

if (!prefix || prefix.trim().length < 8) {
  console.error('\n  Usage: tsx scripts/archive-batch.ts "<source_path prefix>" [--restore] [--apply]\n  (the prefix must be at least 8 characters, so a stray argument cannot match everything)\n');
  process.exit(1);
}
const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!url) {
  console.error("\n  DATABASE_URL is not set.\n");
  process.exit(1);
}

async function main() {
  const db = connectScriptDb(url!);
  const like = `${prefix!.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const wantArchived = RESTORE ? sql`archived_at IS NOT NULL` : sql`archived_at IS NULL`;
  const res = (await db.execute(
    sql`SELECT name, kind FROM entries WHERE source_path LIKE ${like} AND ${wantArchived} ORDER BY kind, name`,
  )) as unknown as { rows?: { name: string; kind: string }[] } | { name: string; kind: string }[];
  const rows = Array.isArray(res) ? res : (res.rows ?? []);

  console.log(`\n  ${rows.length} entries with source "${prefix}*" to ${RESTORE ? "restore" : "archive"}${APPLY ? "" : " (dry run)"}`);
  for (const r of rows.slice(0, 10)) console.log(`    ${r.kind.padEnd(7)} ${r.name}`);
  if (rows.length > 10) console.log(`    ... ${rows.length - 10} more`);

  if (!APPLY) {
    console.log("\n  Re-run with --apply to write.\n");
    return;
  }
  const set = RESTORE ? sql`archived_at = NULL` : sql`archived_at = now()`;
  await db.execute(sql`UPDATE entries SET ${set}, updated_at = now() WHERE source_path LIKE ${like} AND ${wantArchived}`);
  console.log(`\n  Done. ${rows.length} entries ${RESTORE ? "restored" : "archived"}.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
