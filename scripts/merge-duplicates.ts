/**
 * Merges the settlements the Notion import brought in twice, and archives the
 * Notion index pages that came in as empty entries.
 *
 * Why there are twins: every settlement exists once as a page under "The 3
 * Empires" (the curated hierarchy) and once as a row of the Asetherian
 * Database, and the two are often spelled differently — "Helarchon" and
 * "Hellarchon City", "Thessalonikan" and "Thessalonika City". The settlement
 * write-ups landed on the database rows, leaving the hierarchy pages as empty
 * twins that show up in lists and search as dead ends.
 * `reclassify-locations.ts` catches the pairs that differ only by " City";
 * the misspelled pairs below need to be named.
 *
 * For each pair: the entry with text is kept (the database row on a tie), the
 * other is archived only if it is empty, and its spelling is added to the
 * keeper's `aliases`, so `[[Helarchon]]` still resolves. Nothing is deleted;
 * everything archived is restorable from /archive.
 *
 * Run with:  npx tsx scripts/merge-duplicates.ts           (dry run)
 *            npx tsx scripts/merge-duplicates.ts --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzleNode } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { and, eq, inArray, isNull } from "drizzle-orm";
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

const APPLY = process.argv.includes("--apply");
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

/** [hierarchy-page slug, database-row slug] for the same settlement. */
const TWINS: [string, string][] = [
  ["helarchon", "hellarchon-city"],
  ["thessalonikan", "thessalonika-city"],
  ["xerastir", "xerastri-city"],
  ["thebeseieas-city", "thebesieas-city"],
  ["carianaea", "carianea"],
  ["anticasta", "anticata"],
  ["qazshahrin", "qazshahrvin"],
  // Differ only by " City" — reclassify-locations.ts archives these too; listed
  // so this script also records the alias.
  ["aeterna", "aeterna-city"],
  ["atarabad", "atarabad-city"],
  ["delphara", "delphara-city"],
  ["mithratal", "mithratal-city"],
  ["persemenid", "persemenid-city"],
  ["persevalis", "persevalis-city"],
];

/**
 * Spellings an entry should also answer to. The four noble houses were titled
 * "The Merca Family - Marquis" until Notion renamed them to ", Marquis", and
 * text written before the rename still links the old way.
 */
const EXTRA_ALIASES: Record<string, string[]> = {
  "the-merca-family-marquis": ["The Merca Family - Marquis"],
  "the-virellarion-family-count": ["The Virellarion Family - Count"],
  "the-vulkrim-family-marquis": ["The Vulkrim Family - Marquis"],
  "the-zayida-family-count": ["The Zayida Family - Count"],
};

/** Notion section headers that imported as entries. Archived only while empty and childless. */
const INDEX_PAGES = [
  "after-this-to-delete-for-players",
  "location",
  "introduction",
  "adventures",
  "loots",
  "systems",
  "pantheons",
];

const blank = (s: string | null | undefined) => !s || !s.trim();

async function rebuildLinksFor(names: string[]) {
  const live = await db
    .select({ id: entries.id, name: entries.name, kind: entries.kind, body: entries.body, fields: entries.fields })
    .from(entries)
    .where(isNull(entries.archivedAt));
  const named = live.map((e) => ({ id: e.id, name: e.name, kind: e.kind, aliases: parseAliases(e.fields) }));
  const index = buildNameIndex(named);
  const needles = names.map((n) => n.toLowerCase());
  const affected = live.filter((e) => needles.some((n) => (e.body ?? "").toLowerCase().includes(n)));
  for (const e of affected) {
    await db.delete(links).where(eq(links.sourceId, e.id));
    const resolved = resolveAllLinks(e.id, e.body ?? "", e.fields ?? {}, index, named);
    if (resolved.length) {
      await db
        .insert(links)
        .values(resolved.map((l) => ({ sourceId: e.id, targetId: l.targetId, relation: l.relation, context: l.context ?? null })))
        .onConflictDoNothing();
    }
  }
  return affected.length;
}

async function main() {
  console.log(`\n  Merging duplicate settlements${APPLY ? "" : " — DRY RUN (pass --apply)"}\n`);
  const slugs = [...TWINS.flat(), ...INDEX_PAGES, ...Object.keys(EXTRA_ALIASES)];
  const rows = await db
    .select({
      id: entries.id,
      slug: entries.slug,
      name: entries.name,
      body: entries.body,
      summary: entries.summary,
      fields: entries.fields,
      archivedAt: entries.archivedAt,
    })
    .from(entries)
    .where(inArray(entries.slug, slugs));
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const touchedNames: string[] = [];

  for (const [pageSlug, rowSlug] of TWINS) {
    const page = bySlug.get(pageSlug);
    const row = bySlug.get(rowSlug);
    if (!page || !row) continue;
    const [keep, drop] =
      (page.body ?? "").trim().length > (row.body ?? "").trim().length ? [page, row] : [row, page];
    const aliases = parseAliases(keep.fields);
    const needsAlias = !aliases.some((a) => a.toLowerCase() === drop.name.toLowerCase());
    const canArchive = !drop.archivedAt && blank(drop.body);

    if (!needsAlias && !canArchive) continue;
    console.log(
      `  ${keep.name}  ⟵  ${drop.name}` +
        `${needsAlias ? "  (+alias)" : ""}${canArchive ? "  (archive twin)" : drop.archivedAt ? "" : "  (twin has text — kept)"}`,
    );
    touchedNames.push(drop.name, keep.name);
    if (!APPLY) continue;

    if (needsAlias) {
      await db
        .update(entries)
        .set({ fields: { ...keep.fields, aliases: [...aliases, drop.name].join(", ") } })
        .where(eq(entries.id, keep.id));
    }
    if (canArchive) {
      await db
        .update(entries)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(entries.id, drop.id), isNull(entries.archivedAt)));
    }
  }

  for (const [slug, extra] of Object.entries(EXTRA_ALIASES)) {
    const r = bySlug.get(slug);
    if (!r) continue;
    const aliases = parseAliases(r.fields);
    const missing = extra.filter((a) => !aliases.some((x) => x.toLowerCase() === a.toLowerCase()));
    if (!missing.length) continue;
    console.log(`  ${r.name}  (+alias ${missing.join(", ")})`);
    touchedNames.push(...missing);
    if (APPLY) {
      await db
        .update(entries)
        .set({ fields: { ...r.fields, aliases: [...aliases, ...missing].join(", ") } })
        .where(eq(entries.id, r.id));
    }
  }

  for (const slug of INDEX_PAGES) {
    const r = bySlug.get(slug);
    if (!r || r.archivedAt || !blank(r.body)) continue;
    const [child] = await db
      .select({ id: entries.id })
      .from(entries)
      .where(and(eq(entries.parentId, r.id), isNull(entries.archivedAt)))
      .limit(1);
    if (child) {
      console.log(`  keep index page "${r.name}" — it has live children`);
      continue;
    }
    console.log(`  archive Notion index page "${r.name}"`);
    if (APPLY) {
      await db.update(entries).set({ archivedAt: new Date(), updatedAt: new Date() }).where(eq(entries.id, r.id));
    }
  }

  if (APPLY && touchedNames.length) {
    const n = await rebuildLinksFor(touchedNames);
    console.log(`\n  Rebuilt wiki links for ${n} entries that mention a merged name.`);
  }
  console.log("");
  await pool?.end();
}

main().catch(async (err) => {
  console.error("\n  Merge failed:\n", err);
  await pool?.end();
  process.exit(1);
});
