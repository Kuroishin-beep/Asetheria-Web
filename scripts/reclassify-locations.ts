/**
 * Re-derives every location's `tier` from its tags and archives the Notion
 * artefacts that are not real places.
 *
 * `db:seed` deliberately never overwrites a field the app already has a value
 * for, which is right for hand-edited prose but means the earlier major/minor
 * tiers cannot be replaced by a re-import. This does that one job directly.
 *
 * Nothing is deleted. Archiving sets `archived_at`; the rows stay in the table
 * and can be restored from /archive.
 *
 * Run with:  npx tsx scripts/reclassify-locations.ts          (dry run)
 *            npx tsx scripts/reclassify-locations.ts --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq, isNull, sql } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { entries } from "../src/db/schema";
import { deriveLocationTier, isIndexPageName } from "../src/lib/locations";

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

const APPLY = process.argv.includes("--apply");
const db = drizzle(neon(url), { schema });

/**
 * True when an entry carries no prose of its own. Notion folder pages export a
 * body that is nothing but a markdown link to the child database, so those
 * count as empty too — otherwise a 70-character link keeps an index page alive
 * in a section forever.
 */
function isEmpty(e: { body: string; summary: string; tags: string[] }) {
  if (e.tags.length) return false;
  const prose = e.body
    .replace(/\[[^\]]*\]\([^)]*\)/g, "") // markdown links
    .replace(/[\s*_#>-]/g, "");
  if (prose) return false;
  // "Untitled" and the child database's own name are not real summaries.
  return !e.summary.trim() || /^(untitled|.*locations?)$/i.test(e.summary.trim());
}

async function main() {
  const rows = await db
    .select({
      id: entries.id,
      name: entries.name,
      slug: entries.slug,
      body: entries.body,
      summary: entries.summary,
      tags: entries.tags,
      fields: entries.fields,
    })
    .from(entries)
    .where(and(eq(entries.kind, "location"), isNull(entries.archivedAt)));

  const retier: { id: string; name: string; from: string; to: string }[] = [];
  const archive: { id: string; name: string; why: string }[] = [];

  // Anything an empty page duplicates, matched on the name without its suffix.
  const realNames = new Map<string, string>();
  const key = (n: string) =>
    n.toLowerCase().replace(/\s+(city|town|village)$/, "").replace(/[^a-z]/g, "");
  for (const r of rows) {
    if (!isEmpty(r)) realNames.set(key(r.name), r.name);
  }

  for (const r of rows) {
    const tier = deriveLocationTier(r.tags, r.name);
    if (tier) {
      const current = (r.fields as Record<string, string>).tier ?? "";
      if (current !== tier) {
        retier.push({ id: r.id, name: r.name, from: current || "(none)", to: tier });
      }
      continue;
    }
    if (!isEmpty(r)) continue; // Unclassified but has content — leave it alone.

    if (isIndexPageName(r.name)) {
      archive.push({ id: r.id, name: r.name, why: "Notion index page" });
    } else if (realNames.has(key(r.name))) {
      archive.push({
        id: r.id,
        name: r.name,
        why: `empty duplicate of "${realNames.get(key(r.name))}"`,
      });
    } else {
      archive.push({ id: r.id, name: r.name, why: "empty, no tags, no prose" });
    }
  }

  console.log(`\n  locations examined : ${rows.length}`);
  console.log(`  tier changes       : ${retier.length}`);
  console.log(`  to archive         : ${archive.length}\n`);

  const byMove = new Map<string, number>();
  for (const r of retier) {
    const k = `${r.from} -> ${r.to}`;
    byMove.set(k, (byMove.get(k) ?? 0) + 1);
  }
  for (const [k, n] of [...byMove].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(n).padStart(3)}  ${k}`);
  }

  console.log("");
  for (const a of archive) console.log(`    archive: ${a.name}  — ${a.why}`);

  if (!APPLY) {
    console.log("\n  Dry run. Re-run with --apply to write these changes.\n");
    return;
  }

  for (const r of retier) {
    await db
      .update(entries)
      .set({
        fields: sql`jsonb_set(coalesce(${entries.fields}, '{}'::jsonb), '{tier}', ${JSON.stringify(r.to)}::jsonb, true)`,
        updatedAt: new Date(),
      })
      .where(eq(entries.id, r.id));
  }
  for (const a of archive) {
    await db
      .update(entries)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(entries.id, a.id));
  }

  console.log(`\n  Applied: ${retier.length} re-tiered, ${archive.length} archived.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
