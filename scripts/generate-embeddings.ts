/**
 * Backfills the `entries.embedding` vector column for semantic search.
 *
 * Deliberately a standalone script, never run on a request path — loading
 * the local ONNX model costs several seconds on a cold start, which is fine
 * once here but would be a bad tradeoff on every search request.
 *
 *   npm run embeddings:generate            # only entries missing an embedding
 *   npm run embeddings:generate -- --all   # re-embed everything (e.g. after a model change)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzleNode } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { isNull, sql, eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { entries } from "../src/db/schema";
import { embed, entryEmbeddingText } from "../src/lib/embeddings";

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

const refreshAll = process.argv.includes("--all");

async function main() {
  console.log(`\n  Generating embeddings (${refreshAll ? "all entries" : "missing only"})\n`);

  const rows = await db
    .select({
      id: entries.id,
      name: entries.name,
      summary: entries.summary,
      body: entries.body,
      fields: entries.fields,
    })
    .from(entries)
    .where(refreshAll ? isNull(entries.archivedAt) : isNull(entries.embedding));

  console.log(`  ${rows.length} entries to embed.`);

  let done = 0;
  for (const row of rows) {
    const text = entryEmbeddingText({
      name: row.name,
      summary: row.summary,
      body: row.body,
      fields: row.fields as Record<string, string>,
    });
    const vector = await embed(text);
    await db.update(entries).set({ embedding: vector }).where(eq(entries.id, row.id));
    done++;
    if (done % 50 === 0 || done === rows.length) {
      console.log(`  ... ${done}/${rows.length}`);
    }
  }

  console.log(`\n  Done — ${done} entries embedded.\n`);
  await pool?.end();
}

main().catch(async (err) => {
  console.error("\n  Embedding generation failed:\n", err);
  await pool?.end();
  process.exit(1);
});
