/**
 * Finds `[[Wiki Links]]` that point at nothing.
 *
 * Reads every non-archived entry from the database, pulls `[[Target]]` and
 * `[[Target|label]]` out of `body`, `dmNotes` and every `fields` value, and
 * resolves each against the same name index the app uses (titles, explicit
 * `aliases`, derived short forms). Anything that does not resolve is reported
 * with the page it appears on.
 *
 * Unlike `verify-links.ts` (a dry run over the seed file), this checks the real
 * database, so it also covers entries added by later content batches.
 *
 * Exit code: 0 when the number of unresolved links is within `--max` (default
 * 0), 1 otherwise, so CI and phase gates can use it directly.
 *
 * Run with:  npx tsx scripts/check-links.ts
 *            npx tsx scripts/check-links.ts --max 12      (tolerate a known baseline)
 *            npx tsx scripts/check-links.ts --json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isNull } from "drizzle-orm";
import { connectScriptDb } from "./lib/script-db";
import { entries } from "../src/db/schema";
import { buildNameIndex, extractWikiLinks, normalizeName, parseAliases } from "../src/lib/links";

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

const args = process.argv.slice(2);
const AS_JSON = args.includes("--json");
const maxFlag = args.indexOf("--max");
const MAX = maxFlag >= 0 ? Number(args[maxFlag + 1]) : 0;
if (!Number.isInteger(MAX) || MAX < 0) {
  console.error("\n  --max needs a whole number.\n");
  process.exit(1);
}

type Broken = { source: string; slug: string; kind: string; target: string; where: string };

async function main() {
  const db = connectScriptDb(url!);
  const rows = await db
    .select({
      id: entries.id,
      slug: entries.slug,
      name: entries.name,
      kind: entries.kind,
      body: entries.body,
      dmNotes: entries.dmNotes,
      summary: entries.summary,
      fields: entries.fields,
    })
    .from(entries)
    .where(isNull(entries.archivedAt));

  const index = buildNameIndex(
    rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, aliases: parseAliases(r.fields) })),
  );

  const broken: Broken[] = [];
  for (const row of rows) {
    const sources: [string, string][] = [
      ["body", row.body],
      ["dmNotes", row.dmNotes],
      ["summary", row.summary],
      ...Object.entries(row.fields ?? {}).map(([k, v]): [string, string] => [`fields.${k}`, v]),
    ];
    for (const [where, text] of sources) {
      for (const raw of extractWikiLinks(text)) {
        const target = raw.split("#")[0].trim();
        if (!target || index.has(normalizeName(target))) continue;
        broken.push({ source: row.name, slug: row.slug, kind: row.kind, target: raw, where });
      }
    }
  }

  if (AS_JSON) {
    console.log(JSON.stringify({ entries: rows.length, unresolved: broken.length, broken }, null, 2));
  } else {
    console.log(`\n  ${rows.length} active entries scanned.`);
    console.log(`  ${broken.length} unresolved [[links]] (allowed: ${MAX}).`);
    for (const b of broken) console.log(`    ${b.source} (${b.kind}, ${b.where}) -> [[${b.target}]]`);
    console.log("");
  }
  process.exit(broken.length > MAX ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
