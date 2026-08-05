/**
 * Writes descriptions for entries that have none, derived from the properties
 * they already carry. See `src/lib/describe.ts` for the groundedness rule.
 *
 *   npm run describe -- --preview    # print what would be written, touch nothing
 *   npm run describe                 # write to the database
 *   npm run describe -- --revert     # remove every generated description
 *
 * Only entries with an empty body are ever touched, and every write is marked
 * `body_source = 'generated'` so it can be reviewed or undone in one command.
 * Anything you have written by hand is never overwritten.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzleNode } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { entries } from "../src/db/schema";
import { describeEntry, GENERATED_MARKER, type DescribableEntry } from "../src/lib/describe";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");

const PREVIEW = process.argv.includes("--preview");
const REVERT = process.argv.includes("--revert");

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

// ---------------------------------------------------------------------------
// Preview: runs against data/world-seed.json, no database required.
// ---------------------------------------------------------------------------

if (PREVIEW) {
  const payload = JSON.parse(
    fs.readFileSync(path.join(REPO, "data", "world-seed.json"), "utf8"),
  ) as { entries: (DescribableEntry & { body: string })[] };

  const stubs = payload.entries.filter((e) => !e.body.trim());
  const written: { e: DescribableEntry; text: string }[] = [];
  const skipped: DescribableEntry[] = [];

  for (const e of stubs) {
    const text = describeEntry(e);
    if (text) written.push({ e, text });
    else skipped.push(e);
  }

  const byKind = new Map<string, number>();
  for (const { e } of written) byKind.set(e.kind, (byKind.get(e.kind) ?? 0) + 1);
  const skipByKind = new Map<string, number>();
  for (const e of skipped) skipByKind.set(e.kind, (skipByKind.get(e.kind) ?? 0) + 1);

  console.log(`\n  stub entries        : ${stubs.length}`);
  console.log(`  would be described  : ${written.length}`);
  console.log(`  left alone          : ${skipped.length}  (no properties to ground a description in)\n`);

  console.log("  described, by kind:");
  for (const [k, n] of [...byKind].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k.padEnd(14)} ${n}`);
  }
  console.log("\n  left alone, by kind:");
  for (const [k, n] of [...skipByKind].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k.padEnd(14)} ${n}`);
  }

  console.log("\n  ── samples ──");
  const seen = new Set<string>();
  for (const { e, text } of written) {
    // A couple of examples per kind is enough to judge the voice.
    const n = [...seen].filter((s) => s === e.kind).length;
    if (n >= 3) continue;
    seen.add(e.kind);
    const count = [...seen].filter((s) => s === e.kind).length;
    if (count > 3) continue;
    console.log(`\n  [${e.kind}] ${e.name}`);
    console.log(`     ${text}`);
  }

  // Print exactly three per kind by re-walking deterministically.
  console.log("\n  ── more samples ──");
  for (const kind of ["deity", "organization", "location"]) {
    const rows = written.filter((w) => w.e.kind === kind).slice(0, 4);
    for (const { e, text } of rows) {
      console.log(`\n  [${kind}] ${e.name}`);
      console.log(`     ${text}`);
    }
  }
  console.log();
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Database modes
// ---------------------------------------------------------------------------

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
  if (REVERT) {
    const removed = await db
      .update(entries)
      .set({ body: "", bodySource: null })
      .where(eq(entries.bodySource, GENERATED_MARKER))
      .returning({ id: entries.id });
    console.log(`\n  Removed ${removed.length} generated descriptions.\n`);
    return;
  }

  // Only ever touch entries with an empty body, or ones we generated before
  // (so re-running picks up template improvements without clobbering writing).
  const candidates = await db
    .select({
      id: entries.id,
      slug: entries.slug,
      name: entries.name,
      kind: entries.kind,
      tags: entries.tags,
      fields: entries.fields,
      sourcePath: entries.sourcePath,
      body: entries.body,
      bodySource: entries.bodySource,
    })
    .from(entries)
    .where(
      or(
        sql`btrim(${entries.body}) = ''`,
        eq(entries.bodySource, GENERATED_MARKER),
      ),
    );

  let written = 0;
  let skipped = 0;

  for (const c of candidates) {
    // Defensive: never overwrite prose that isn't ours.
    if (c.body.trim() && c.bodySource !== GENERATED_MARKER) {
      skipped++;
      continue;
    }
    const text = describeEntry(c as DescribableEntry);
    if (!text) {
      skipped++;
      continue;
    }
    if (text === c.body) continue; // already current
    await db
      .update(entries)
      .set({ body: text, bodySource: GENERATED_MARKER })
      .where(eq(entries.id, c.id));
    written++;
  }

  console.log(`\n  Descriptions written : ${written}`);
  console.log(`  Left alone           : ${skipped}  (nothing to ground a description in)\n`);
}

main()
  .then(async () => {
    await pool?.end();
  })
  .catch(async (err) => {
    console.error("\n  Failed:\n", err);
    await pool?.end();
    process.exit(1);
  });
