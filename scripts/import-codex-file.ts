/**
 * Loads an `asetheria-codex` JSON file (the format /api/export writes and
 * `data/foundry-world.json` / `data/lore-population.json` use) into whichever
 * database DATABASE_URL points at — local Postgres or Neon.
 *
 * Safe by default:
 *  - an entry whose slug already exists is left alone;
 *  - `--fill-empty` additionally fills an existing entry's *blank* summary,
 *    body or fields from the file — anything already written stays untouched;
 *  - nothing is ever deleted.
 *
 * Afterwards the wiki-link graph is rebuilt for every entry that was written
 * and every entry whose text names one of them, so backlinks show up at once.
 *
 * Run with:  npx tsx scripts/import-codex-file.ts data/foundry-world.json
 *            npx tsx scripts/import-codex-file.ts data/lore-population.json --fill-empty
 *            (add --dry-run to only report)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzleNode } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
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

const fileArg = process.argv.slice(2).find((a) => !a.startsWith("--"));
const FILL_EMPTY = process.argv.includes("--fill-empty");
const DRY_RUN = process.argv.includes("--dry-run");

if (!fileArg) {
  console.error("\n  Usage: npx tsx scripts/import-codex-file.ts <file.json> [--fill-empty] [--dry-run]\n");
  process.exit(1);
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

const entrySchema = z.object({
  slug: z.string().min(1),
  kind: z.enum(schema.entryKind.enumValues),
  name: z.string().min(1),
  summary: z.string().default(""),
  body: z.string().default(""),
  dmNotes: z.string().default(""),
  fields: z.record(z.string()).default({}),
  tags: z.array(z.string()).default([]),
  visibility: z.enum(schema.visibility.enumValues).default("public"),
  sourcePath: z.string().nullable().optional(),
  /** The page this one belongs under (a district under its city). */
  parentSlug: z.string().nullable().optional(),
  /** Only file an existing page under its parent; never create it. */
  attachOnly: z.boolean().optional(),
  /**
   * With --fill-empty, also replace a body shorter than this many characters —
   * for one-line stubs that the file supersedes. Off unless set per entry.
   */
  replaceBodyShorterThan: z.number().int().positive().optional(),
});
const fileSchema = z.object({ entries: z.array(entrySchema) });

const blank = (s: string | null | undefined) => !s || !s.trim();

async function rebuildLinks(ids: string[]) {
  const all = await db
    .select({ id: entries.id, name: entries.name, kind: entries.kind, fields: entries.fields })
    .from(entries)
    .where(isNull(entries.archivedAt));
  const named = all.map((e) => ({ id: e.id, name: e.name, kind: e.kind, aliases: parseAliases(e.fields) }));
  const nameIndex = buildNameIndex(named);
  const rows = await db
    .select({ id: entries.id, body: entries.body, fields: entries.fields })
    .from(entries)
    .where(inArray(entries.id, ids));
  for (const row of rows) {
    await db.delete(links).where(eq(links.sourceId, row.id));
    const resolved = resolveAllLinks(row.id, row.body ?? "", row.fields ?? {}, nameIndex, named);
    if (resolved.length) {
      await db
        .insert(links)
        .values(
          resolved.map((l) => ({
            sourceId: row.id,
            targetId: l.targetId,
            relation: l.relation,
            context: l.context ?? null,
          })),
        )
        .onConflictDoNothing();
    }
  }
}

async function main() {
  const file = path.resolve(REPO, fileArg!);
  const parsed = fileSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
  console.log(`\n  ${path.relative(REPO, file)}: ${parsed.entries.length} entries${FILL_EMPTY ? " (fill-empty)" : ""}${DRY_RUN ? " — DRY RUN" : ""}\n`);

  const wanted = [
    ...parsed.entries.map((e) => e.slug),
    ...parsed.entries.flatMap((e) => (e.parentSlug ? [e.parentSlug] : [])),
  ];
  const existing = await db
    .select({
      id: entries.id,
      slug: entries.slug,
      summary: entries.summary,
      body: entries.body,
      fields: entries.fields,
      parentId: entries.parentId,
    })
    .from(entries)
    .where(inArray(entries.slug, wanted));
  const bySlug = new Map(existing.map((e) => [e.slug, e]));
  const idOf = (slug: string | null | undefined) => (slug ? bySlug.get(slug)?.id ?? null : null);

  const touched: string[] = [];
  let created = 0;
  let filled = 0;
  let skipped = 0;

  for (const e of parsed.entries) {
    const found = bySlug.get(e.slug);
    if (!found && e.attachOnly) {
      console.log(`  ! ${e.slug}: not in the database, nothing to attach`);
      skipped++;
      continue;
    }
    if (!found) {
      if (!DRY_RUN) {
        const [row] = await db
          .insert(entries)
          .values({
            slug: e.slug,
            kind: e.kind,
            name: e.name,
            summary: e.summary,
            body: e.body,
            dmNotes: e.dmNotes,
            fields: e.fields,
            tags: e.tags,
            visibility: e.visibility,
            sourcePath: e.sourcePath ?? null,
            parentId: idOf(e.parentSlug),
          })
          .returning({ id: entries.id, slug: entries.slug });
        touched.push(row.id);
        // Later entries in the same file may name this one as their parent.
        bySlug.set(row.slug, { id: row.id, slug: row.slug, summary: e.summary, body: e.body, fields: e.fields, parentId: idOf(e.parentSlug) });
      }
      console.log(`  + ${e.kind.padEnd(13)} ${e.name}`);
      created++;
      continue;
    }

    if (!FILL_EMPTY) {
      skipped++;
      continue;
    }

    const patch: Partial<typeof entries.$inferInsert> = {};
    if (blank(found.summary) && !blank(e.summary)) patch.summary = e.summary;
    const stub = e.replaceBodyShorterThan && (found.body ?? "").trim().length < e.replaceBodyShorterThan;
    if ((blank(found.body) || stub) && !blank(e.body)) patch.body = e.body;
    const missingFields = Object.fromEntries(
      Object.entries(e.fields).filter(([k, v]) => !blank(v) && blank(found.fields?.[k])),
    );
    if (Object.keys(missingFields).length) patch.fields = { ...found.fields, ...missingFields };
    const parentId = idOf(e.parentSlug);
    if (!found.parentId && parentId && parentId !== found.id) patch.parentId = parentId;

    if (Object.keys(patch).length === 0) {
      skipped++;
      continue;
    }
    if (!DRY_RUN) {
      // The text changed, so the old search vector is stale; null it so
      // `npm run embeddings:generate` re-embeds this entry.
      await db.update(entries).set({ ...patch, embedding: null }).where(eq(entries.id, found.id));
      touched.push(found.id);
    }
    console.log(`  ~ ${e.kind.padEnd(13)} ${e.name}  (${Object.keys(patch).join(", ")})`);
    filled++;
  }

  if (!DRY_RUN && touched.length) {
    // Entries that already named one of these in [[brackets]] gain a backlink too.
    const names = parsed.entries.map((e) => e.name.toLowerCase());
    const mentioners = (
      await db.select({ id: entries.id, body: entries.body }).from(entries)
    )
      .filter((r) => {
        const body = (r.body ?? "").toLowerCase();
        return body.includes("[[") && names.some((n) => body.includes(`[[${n}`));
      })
      .map((r) => r.id);
    const ids = [...new Set([...touched, ...mentioners])];
    console.log(`\n  Rebuilding wiki links for ${ids.length} entries…`);
    await rebuildLinks(ids);
  }

  console.log(`\n  ${created} created, ${filled} filled, ${skipped} unchanged.\n`);
  if (created || filled) {
    console.log("  Next: npm run embeddings:generate  (so semantic search sees the new text)\n");
  }
  await pool?.end();
}

main().catch(async (err) => {
  console.error("\n  Import failed:\n", err);
  await pool?.end();
  process.exit(1);
});
