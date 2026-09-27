/**
 * Loads player-supplied homebrew reference content (metals/materials,
 * herbalism) from data/homebrew/*.json into the codex.
 *
 * Safe to re-run: new entries are matched by slug (skipped if they already
 * exist), and "enrichments" only ever add new keys to an existing entry's
 * `fields` — they never touch `body`, `summary`, or any field the entry
 * already has, so a hand-authored page (e.g. the setting's own "Cold Iron")
 * is never overwritten.
 *
 *   npm run import:homebrew
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
import { entries, rollTables, type EntryKind, type Visibility } from "../src/db/schema";

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

type HomebrewEntry = {
  slug: string;
  kind: EntryKind;
  name: string;
  summary: string;
  body: string;
  fields: Record<string, string>;
  tags: string[];
  visibility: Visibility;
  sourcePath: string;
};

type HomebrewFile = {
  note: string;
  entries: HomebrewEntry[];
  enrichments?: { slug: string; fields: Record<string, string> }[];
  rollTable?: {
    name: string;
    slug: string;
    description: string;
    dice: string;
    visibility: Visibility;
    items: { min: number; max: number; result: string }[];
  };
};

async function importFile(fileName: string) {
  const filePath = path.join(REPO, "data", "homebrew", fileName);
  const data = JSON.parse(fs.readFileSync(filePath, "utf8")) as HomebrewFile;

  let created = 0;
  let skipped = 0;
  for (const e of data.entries) {
    const [existing] = await db
      .select({ id: entries.id })
      .from(entries)
      .where(eq(entries.slug, e.slug))
      .limit(1);
    if (existing) {
      skipped++;
      continue;
    }
    await db.insert(entries).values({
      slug: e.slug,
      kind: e.kind,
      name: e.name,
      summary: e.summary,
      body: e.body,
      dmNotes: "",
      fields: e.fields,
      tags: e.tags,
      visibility: e.visibility,
      sourcePath: e.sourcePath,
    });
    created++;
  }
  console.log(`  ✓ ${fileName}: ${created} created, ${skipped} already existed`);

  let enriched = 0;
  for (const en of data.enrichments ?? []) {
    const [existing] = await db
      .select({ id: entries.id, fields: entries.fields })
      .from(entries)
      .where(eq(entries.slug, en.slug))
      .limit(1);
    if (!existing) {
      console.log(`  · enrichment skipped — no entry with slug "${en.slug}"`);
      continue;
    }
    // Only fills keys the entry doesn't already have — never overwrites
    // hand-authored data, even if this script runs again.
    const merged = { ...en.fields, ...(existing.fields as Record<string, string>) };
    await db
      .update(entries)
      .set({ fields: merged })
      .where(eq(entries.id, existing.id));
    enriched++;
  }
  if (enriched) console.log(`  ✓ ${fileName}: ${enriched} existing entries enriched with new stats`);

  if (data.rollTable) {
    const rt = data.rollTable;
    const [existing] = await db
      .select({ id: rollTables.id })
      .from(rollTables)
      .where(eq(rollTables.slug, rt.slug))
      .limit(1);
    if (existing) {
      console.log(`  · roll table "${rt.slug}" already exists — skipped`);
    } else {
      await db.insert(rollTables).values({
        name: rt.name,
        slug: rt.slug,
        description: rt.description,
        dice: rt.dice,
        visibility: rt.visibility,
        items: rt.items,
      });
      console.log(`  ✓ roll table "${rt.name}" created`);
    }
  }
}

async function main() {
  console.log("\n  Importing homebrew content\n");
  await importFile("metals.json");
  await importFile("flora.json");
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(entries);
  console.log(`\n  Done — ${count} entries in the codex.\n`);
  await pool?.end();
}

main().catch(async (err) => {
  console.error("\n  Import failed:\n", err);
  await pool?.end();
  process.exit(1);
});
