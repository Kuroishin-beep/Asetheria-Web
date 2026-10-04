/**
 * Phase 6: makes the tables and the places cite each other.
 *
 * Every authored table (source "original: natural-world/tables") names places
 * in its introduction. This appends, to each of those places, a short "Tables"
 * section that links back, so a table's backlinks list the places that cite it.
 *
 * Additive and idempotent: only the 100 new natural-world places are touched,
 * only a trailing section is appended, and a table already linked in the body
 * is never added twice. Dry run unless --apply. Afterwards: npm run links:rebuild.
 *
 *   npx tsx scripts/link-tables-to-places.ts
 *   npx tsx scripts/link-tables-to-places.ts --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { normalizeName } from "../src/lib/links";
import { connectScriptDb } from "./lib/script-db";
import { wikiTargets } from "./lib/natural-world";

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

const APPLY = process.argv.includes("--apply");
const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!url) {
  console.error("\n  DATABASE_URL is not set.\n");
  process.exit(1);
}

type Row = { id: string; name: string; kind: string; body: string; source_path: string | null };

async function main() {
  const db = connectScriptDb(url!);
  const res = (await db.execute(
    sql`SELECT id, name, kind, body, source_path FROM entries WHERE archived_at IS NULL`,
  )) as unknown as { rows?: Row[] } | Row[];
  const rows: Row[] = Array.isArray(res) ? res : (res.rows ?? []);

  const places = new Map(
    rows.filter((r) => r.source_path?.startsWith("original: natural-world/places-")).map((r) => [normalizeName(r.name), r]),
  );
  const tables = rows.filter((r) => r.kind === "table" && r.source_path === "original: natural-world/tables");

  const toAdd = new Map<string, string[]>(); // place id -> table names
  for (const table of tables) {
    for (const target of wikiTargets(table.body)) {
      const place = places.get(normalizeName(target));
      if (!place) continue;
      const list = toAdd.get(place.id) ?? [];
      if (!list.includes(table.name)) list.push(table.name);
      toAdd.set(place.id, list);
    }
  }

  let touched = 0;
  for (const [id, names] of toAdd) {
    const place = rows.find((r) => r.id === id)!;
    const fresh = names.filter((n) => !place.body.includes(`[[${n}]]`));
    if (fresh.length === 0) continue;
    touched++;
    const section = `\n\n## Tables\n\nRoll here: ${fresh.map((n) => `[[${n}]]`).join(", ")}.`;
    const next = place.body.includes("\n## Tables\n")
      ? place.body.replace(/(\n## Tables\n\nRoll here: [^\n]*?)\.$/, (_m, head: string) => `${head}, ${fresh.map((n) => `[[${n}]]`).join(", ")}.`)
      : place.body + section;
    if (APPLY) await db.execute(sql`UPDATE entries SET body = ${next}, updated_at = now() WHERE id = ${id}`);
  }
  console.log(`\n  ${tables.length} tables read; ${touched} places ${APPLY ? "updated" : "would be updated"}`);
  console.log(APPLY ? "\n  Next: npm run links:rebuild\n" : "\n  Re-run with --apply to write.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
