/**
 * Rebuilds the whole wiki-link graph from every live entry's text and
 * properties. Run after anything that changes how names resolve — merging
 * duplicates, adding aliases, or a change to the resolution rules — so
 * backlinks everywhere match what the pages now link to.
 *
 * Run with:  npx tsx scripts/rebuild-links.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzleNode } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, isNull } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { entries, links } from "../src/db/schema";
import { buildNameIndex, parseAliases, resolveAllLinks } from "../src/lib/links";

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
  const live = await db
    .select({ id: entries.id, name: entries.name, kind: entries.kind, body: entries.body, fields: entries.fields })
    .from(entries)
    .where(isNull(entries.archivedAt));
  const named = live.map((e) => ({ id: e.id, name: e.name, kind: e.kind, aliases: parseAliases(e.fields) }));
  const index = buildNameIndex(named);

  let edges = 0;
  for (const [i, e] of live.entries()) {
    await db.delete(links).where(eq(links.sourceId, e.id));
    const resolved = resolveAllLinks(e.id, e.body ?? "", e.fields ?? {}, index, named);
    if (resolved.length) {
      await db
        .insert(links)
        .values(resolved.map((l) => ({ sourceId: e.id, targetId: l.targetId, relation: l.relation, context: l.context ?? null })))
        .onConflictDoNothing();
      edges += resolved.length;
    }
    if ((i + 1) % 100 === 0) console.log(`  … ${i + 1}/${live.length}`);
  }
  console.log(`\n  Rebuilt ${edges} links across ${live.length} entries.\n`);
  await pool?.end();
}

main().catch(async (err) => {
  console.error("\n  Link rebuild failed:\n", err);
  await pool?.end();
  process.exit(1);
});
