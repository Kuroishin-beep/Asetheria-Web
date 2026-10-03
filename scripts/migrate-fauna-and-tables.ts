/**
 * Phase 1 data migration: the `fauna` and `table` entry kinds.
 *
 *   1. Adds `fauna` and `table` to the `entry_kind` enum (additive, idempotent;
 *      Postgres cannot drop enum values, so a rollback leaves them unused).
 *   2. Retags the eight original fauna entries from `flora` to `fauna`, by an
 *      explicit name list. No heuristics: a name not on the list is never moved.
 *   3. Copies every `roll_tables` row into a `table` entry (dice in
 *      `fields.dice`, rows as a Markdown table in `body`). The old table is left
 *      untouched and read-only in spirit; nothing is deleted.
 *
 * Safe to re-run: step 1 uses IF NOT EXISTS, step 2 only touches rows still
 * tagged `flora`, step 3 skips any roll table already copied (matched by
 * `fields.migratedFromRollTableId`). Before writing anything it proves that
 * every roll table survives the Markdown round trip with identical dice and
 * rows, and refuses to continue if one does not.
 *
 * Run with:  npx tsx scripts/migrate-fauna-and-tables.ts            (dry run)
 *            npx tsx scripts/migrate-fauna-and-tables.ts --apply
 *            npx tsx scripts/migrate-fauna-and-tables.ts --revert   (undo; soft)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { connectScriptDb } from "./lib/script-db";
import { checkCoverage, parseRollTable, serializeRollTable } from "../src/lib/roll-table";

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
const REVERT = process.argv.includes("--revert");
const db = connectScriptDb(url);

/** The eight animals that were stored as `flora` before `fauna` existed. */
const ORIGINAL_FAUNA_NAMES = [
  "Aeolian Petrel",
  "The Geese of Juno",
  "Qanat Newt",
  "Malaunian Saiga",
  "Tabrishi'ir Silkmoth",
  "The Numbfish",
  "Acheaorian Hunting Cheetah",
  "The Watching Ibis",
] as const;

/** Constant, quote-escaped literal: drizzle expands a JS array param into a value list, not a Postgres array. */
const FAUNA_NAME_LIST = sql.raw(
  `ARRAY[${ORIGINAL_FAUNA_NAMES.map((n) => `'${n.replace(/'/g, "''")}'`).join(",")}]`,
);

type RollTableRow = {
  id: string;
  name: string;
  slug: string;
  description: string;
  dice: string;
  items: { min: number; max: number; result: string }[];
  visibility: "public" | "secret" | "revealed";
  archived_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

async function rows<T>(query: ReturnType<typeof sql>): Promise<T[]> {
  const res = (await db.execute(query)) as unknown as { rows?: T[] } | T[];
  return Array.isArray(res) ? res : (res.rows ?? []);
}

async function enumValues(): Promise<string[]> {
  const found = await rows<{ enumlabel: string }>(
    sql`SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'entry_kind'`,
  );
  return found.map((r) => r.enumlabel);
}

function describeTarget(connection: string): string {
  try {
    const u = new URL(connection);
    return `${u.hostname}:${u.port || "(default)"}${u.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

async function revert() {
  console.log("\n  Reverting (soft): fauna back to flora, migrated table entries archived.\n");
  const moved = await rows<{ name: string }>(
    sql`UPDATE entries SET kind = 'flora', updated_at = now()
        WHERE kind = 'fauna' AND name = ANY(${FAUNA_NAME_LIST})
        RETURNING name`,
  );
  const archived = await rows<{ name: string }>(
    sql`UPDATE entries SET archived_at = now(), updated_at = now()
        WHERE kind = 'table' AND archived_at IS NULL AND fields ? 'migratedFromRollTableId'
        RETURNING name`,
  );
  console.log(`  fauna -> flora : ${moved.length}`);
  console.log(`  tables archived: ${archived.length}\n`);
}

async function main() {
  console.log(`\n  Target database: ${describeTarget(url!)}`);
  if (REVERT) {
    if (!APPLY) {
      console.log("  --revert needs --apply as well. Nothing changed.\n");
      return;
    }
    await revert();
    return;
  }

  const have = await enumValues();
  const needEnum = ["fauna", "table"].filter((v) => !have.includes(v));
  console.log(`  entry_kind enum: ${needEnum.length ? `missing ${needEnum.join(", ")}` : "fauna + table present"}`);

  // ---- step 3 prerequisite: prove the round trip before writing anything ----
  const tables = await rows<RollTableRow>(sql`SELECT * FROM roll_tables ORDER BY created_at`);
  const refusals: string[] = [];
  const warnings: string[] = [];
  for (const t of tables) {
    const parsed = parseRollTable(serializeRollTable(t.items));
    const same =
      parsed.problems.length === 0 &&
      parsed.rows.length === t.items.length &&
      parsed.rows.every(
        (r, i) =>
          r.min === t.items[i].min && r.max === t.items[i].max && r.result === t.items[i].result.trim(),
      );
    if (!same) refusals.push(`"${t.name}" does not survive the Markdown round trip.`);
    for (const problem of checkCoverage(t.dice, t.items)) warnings.push(`"${t.name}" (${t.dice}): ${problem}`);
  }
  console.log(`  roll_tables rows: ${tables.length}`);
  if (warnings.length) {
    console.log("  coverage notes (carried over as-is, not changed):");
    for (const w of warnings) console.log(`    - ${w}`);
  }
  if (refusals.length) {
    console.error("\n  Refusing to continue:");
    for (const r of refusals) console.error(`    - ${r}`);
    process.exit(1);
  }

  const toRetag = await rows<{ name: string }>(
    sql`SELECT name FROM entries WHERE kind = 'flora' AND archived_at IS NULL
        AND name = ANY(${FAUNA_NAME_LIST})`,
  );
  console.log(`  fauna to retag  : ${toRetag.length} of ${ORIGINAL_FAUNA_NAMES.length}`);

  const already = have.includes("table")
    ? await rows<{ rt: string }>(sql`SELECT fields->>'migratedFromRollTableId' AS rt FROM entries WHERE fields ? 'migratedFromRollTableId'`)
    : [];
  const done = new Set(already.map((r) => r.rt));
  const pending = tables.filter((t) => !done.has(t.id));
  console.log(`  tables to copy  : ${pending.length} (${tables.length - pending.length} already copied)`);

  if (!APPLY) {
    console.log("\n  Dry run. Re-run with --apply to write.\n");
    return;
  }

  // ---- step 1: enum values (each statement commits on its own) ----
  for (const value of needEnum) {
    await db.execute(sql.raw(`ALTER TYPE entry_kind ADD VALUE IF NOT EXISTS '${value}'`));
  }

  // ---- step 2: retag by name ----
  const moved = await rows<{ name: string }>(
    sql`UPDATE entries SET kind = 'fauna', updated_at = now()
        WHERE kind = 'flora' AND archived_at IS NULL
        AND name = ANY(${FAUNA_NAME_LIST})
        RETURNING name`,
  );
  console.log(`\n  retagged to fauna: ${moved.length}`);

  // ---- step 3: roll tables -> table entries ----
  let created = 0;
  for (const t of pending) {
    const clash = await rows<{ id: string }>(sql`SELECT id FROM entries WHERE slug = ${t.slug}`);
    const slug = clash.length ? `${t.slug}-table` : t.slug;
    if (clash.length) console.log(`    slug "${t.slug}" is taken; using "${slug}"`);
    const table = serializeRollTable(t.items);
    const body = t.description.trim() ? `${t.description.trim()}\n\n${table}` : table;
    await db.execute(sql`
      INSERT INTO entries (slug, kind, name, summary, body, fields, tags, visibility, source_path, archived_at, created_at, updated_at)
      VALUES (
        ${slug}, 'table', ${t.name}, ${t.description.slice(0, 600)}, ${body},
        ${JSON.stringify({ dice: t.dice, migratedFromRollTableId: t.id })}::jsonb,
        ARRAY['random-table']::text[], ${t.visibility}::visibility, 'migrated: roll_tables',
        ${t.archived_at}, ${t.created_at}, ${t.updated_at}
      )`);
    created++;
  }
  console.log(`  table entries created: ${created}`);

  // ---- verification: every roll table has an identical entry ----
  const failures: string[] = [];
  for (const t of tables) {
    const found = await rows<{ body: string; dice: string }>(
      sql`SELECT body, fields->>'dice' AS dice FROM entries WHERE kind = 'table' AND fields->>'migratedFromRollTableId' = ${t.id}`,
    );
    if (found.length !== 1) {
      failures.push(`"${t.name}": expected 1 table entry, found ${found.length}`);
      continue;
    }
    const parsed = parseRollTable(found[0].body);
    if (found[0].dice !== t.dice) failures.push(`"${t.name}": dice ${found[0].dice} != ${t.dice}`);
    if (parsed.rows.length !== t.items.length) {
      failures.push(`"${t.name}": ${parsed.rows.length} rows != ${t.items.length}`);
    }
  }
  if (failures.length) {
    console.error("\n  VERIFICATION FAILED:");
    for (const f of failures) console.error(`    - ${f}`);
    process.exit(1);
  }
  console.log(`  verified: ${tables.length} roll tables <-> ${tables.length} table entries (dice and row counts equal)`);
  console.log("\n  Next: npm run embeddings:generate (new entries have no vector yet).\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
