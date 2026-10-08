/**
 * Copies the codex content from one Postgres database to another EMPTY one:
 * entries (with their embeddings), links, the legacy roll tables and the maps.
 * Built for first-time loading of a production database from the tested local
 * build, instead of re-running every import and regenerating embeddings.
 *
 * What it does NOT copy: users, entry grants, login attempts, revision history
 * and map pins (people and permissions are created on the target itself), and
 * anything that is test scaffolding (`zz-` slugs, `test:` sources).
 *
 * Safety:
 *  - the source must NOT be a Neon URL, and the target must not be the source;
 *  - the target must have zero entries (it never merges into existing data);
 *  - one transaction on the target: all of it or none of it;
 *  - dry run unless --apply; nothing is deleted anywhere.
 *
 *   SOURCE_DATABASE_URL=... TARGET_DATABASE_URL=... npx tsx scripts/clone-content.ts
 *   ... npx tsx scripts/clone-content.ts --apply
 */
import { Pool } from "pg";

const APPLY = process.argv.includes("--apply");
const source = process.env.SOURCE_DATABASE_URL;
const target = process.env.TARGET_DATABASE_URL;

function fail(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

if (!source || !target) fail("Set SOURCE_DATABASE_URL (the local database) and TARGET_DATABASE_URL (the empty one).");
if (/neon\.tech|neon\.build/.test(source)) fail("The source must be the local database, not Neon.");
if (source === target) fail("Source and target are the same database.");

const TEST_ENTRY = `slug NOT LIKE 'zz-%' AND coalesce(source_path, '') NOT LIKE 'test:%'`;

/** Column casts the driver cannot infer: enums, vectors, json, arrays. */
const CASTS: Record<string, string> = {
  kind: "::entry_kind",
  visibility: "::visibility",
  embedding: "::vector",
  fields: "::jsonb",
  items: "::jsonb",
  tags: "::text[]",
};

type Row = Record<string, unknown>;

async function columnsOf(pool: Pool, table: string): Promise<string[]> {
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND is_generated = 'NEVER'
     ORDER BY ordinal_position`,
    [table],
  );
  return rows.map((r) => r.column_name as string);
}

/** Reads rows with the vector as text so it survives the trip. */
async function readAll(pool: Pool, table: string, cols: string[], where = "true"): Promise<Row[]> {
  const select = cols.map((c) => (c === "embedding" ? `embedding::text AS embedding` : `"${c}"`)).join(", ");
  const { rows } = await pool.query(`SELECT ${select} FROM ${table} WHERE ${where}`);
  return rows;
}

function param(col: string, value: unknown): unknown {
  if ((col === "fields" || col === "items") && value !== null && typeof value !== "string") return JSON.stringify(value);
  return value;
}

async function insertRows(client: import("pg").PoolClient, table: string, cols: string[], rows: Row[], batch: number) {
  for (let i = 0; i < rows.length; i += batch) {
    const slice = rows.slice(i, i + batch);
    const params: unknown[] = [];
    const tuples = slice.map((row) => {
      const placeholders = cols.map((c) => {
        params.push(param(c, row[c]));
        return `$${params.length}${CASTS[c] ?? ""}`;
      });
      return `(${placeholders.join(", ")})`;
    });
    await client.query(`INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(", ")}) VALUES ${tuples.join(", ")}`, params);
  }
}

/** Parents before children, so the self-referencing foreign key is satisfied without a later UPDATE (which would touch updated_at). */
function parentsFirst(rows: Row[]): Row[] {
  const byId = new Map(rows.map((r) => [r.id as string, r]));
  const depth = new Map<string, number>();
  const depthOf = (id: string, guard = 0): number => {
    if (depth.has(id)) return depth.get(id)!;
    const parent = byId.get(id)?.parent_id as string | null | undefined;
    const d = !parent || !byId.has(parent) || guard > 50 ? 0 : depthOf(parent, guard + 1) + 1;
    depth.set(id, d);
    return d;
  };
  return [...rows].sort((a, b) => depthOf(a.id as string) - depthOf(b.id as string));
}

async function main() {
  const src = new Pool({ connectionString: source, max: 2 });
  const dst = new Pool({ connectionString: target, max: 2 });
  try {
    const existing = Number((await dst.query(`SELECT count(*)::int AS n FROM entries`)).rows[0].n);
    if (existing !== 0) fail(`The target already has ${existing} entries. This tool only loads an empty database.`);

    const entryCols = await columnsOf(src, "entries");
    const linkCols = await columnsOf(src, "links");
    const rollCols = await columnsOf(src, "roll_tables");
    const mapCols = await columnsOf(src, "maps");

    const entries = parentsFirst(await readAll(src, "entries", entryCols, TEST_ENTRY));
    const ids = new Set(entries.map((e) => e.id as string));
    const links = (await readAll(src, "links", linkCols)).filter((l) => ids.has(l.source_id as string) && ids.has(l.target_id as string));
    const rolls = await readAll(src, "roll_tables", rollCols, `slug NOT LIKE 'zz-%'`);
    const maps = await readAll(src, "maps", mapCols, `slug NOT LIKE 'zz-%'`);

    const live = entries.filter((e) => e.archived_at === null).length;
    console.log(`\n  to copy: ${entries.length} entries (${live} live, ${entries.length - live} archived, ${entries.filter((e) => e.embedding).length} embedded), ${links.length} links, ${rolls.length} roll tables, ${maps.length} maps`);
    console.log(`  target: empty (0 entries). ${APPLY ? "Applying in one transaction." : "Dry run: nothing written."}`);
    if (!APPLY) {
      console.log("\n  Re-run with --apply to write.\n");
      return;
    }

    const client = await dst.connect();
    try {
      await client.query("BEGIN");
      await insertRows(client, "entries", entryCols, entries, 20);
      await insertRows(client, "links", linkCols, links, 250);
      await insertRows(client, "roll_tables", rollCols, rolls, 50);
      await insertRows(client, "maps", mapCols, maps, 50);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    const after = await dst.query(
      `SELECT (SELECT count(*) FROM entries)::int AS entries, (SELECT count(*) FROM entries WHERE embedding IS NOT NULL)::int AS embedded,
              (SELECT count(*) FROM links)::int AS links, (SELECT count(*) FROM roll_tables)::int AS roll_tables, (SELECT count(*) FROM maps)::int AS maps`,
    );
    console.log(`\n  copied. target now: ${JSON.stringify(after.rows[0])}\n`);
  } finally {
    await src.end();
    await dst.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
