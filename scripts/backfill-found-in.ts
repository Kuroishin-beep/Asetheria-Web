/**
 * Phase 5: connects specimens to the places they are found.
 *
 * Two sources, both additive:
 *  1. Every new natural-world place (source "original: natural-world/places-*")
 *     names the ores, plants and animals found there as [[links]] in its body.
 *     Each such specimen gains that place in its `Found in` property.
 *  2. `data/natural-world/found-in-extra.json` ({ "Entry name": "Place, Place" })
 *     for specimens no new place names.
 *
 * Only `fields.foundIn` is written, only by adding names that are not already
 * there; summaries, bodies and DM notes are never touched, and nothing is
 * removed. Dry run unless --apply. Afterwards: npm run links:rebuild.
 *
 *   npx tsx scripts/backfill-found-in.ts            (report)
 *   npx tsx scripts/backfill-found-in.ts --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { normalizeName, parseRelationValue } from "../src/lib/links";
import { connectScriptDb } from "./lib/script-db";
import { wikiTargets } from "./lib/natural-world";

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

type Row = { id: string; name: string; kind: string; body: string; source_path: string | null; fields: Record<string, string> };
const SPECIMEN_KINDS = new Set(["ore", "flora", "fauna"]);

async function main() {
  const db = connectScriptDb(url!);
  const res = (await db.execute(
    sql`SELECT id, name, kind, body, source_path, fields FROM entries WHERE archived_at IS NULL`,
  )) as unknown as { rows?: Row[] } | Row[];
  const rows: Row[] = Array.isArray(res) ? res : (res.rows ?? []);

  const byName = new Map(rows.map((r) => [normalizeName(r.name), r]));
  const additions = new Map<string, string[]>(); // specimen id -> place/area names to add, in order
  const add = (id: string, place: string) => {
    const list = additions.get(id) ?? [];
    if (!list.some((p) => normalizeName(p) === normalizeName(place))) list.push(place);
    additions.set(id, list);
  };

  const places = rows.filter((r) => r.source_path?.startsWith("original: natural-world/places-"));
  for (const place of places) {
    for (const target of wikiTargets(place.body)) {
      const hit = byName.get(normalizeName(target));
      if (hit && SPECIMEN_KINDS.has(hit.kind)) add(hit.id, place.name);
    }
  }

  const extraFile = path.join(REPO, "data", "natural-world", "found-in-extra.json");
  const unknown: string[] = [];
  if (fs.existsSync(extraFile)) {
    const extra = JSON.parse(fs.readFileSync(extraFile, "utf8")) as Record<string, string>;
    for (const [name, value] of Object.entries(extra)) {
      const hit = byName.get(normalizeName(name));
      if (!hit || !SPECIMEN_KINDS.has(hit.kind)) {
        unknown.push(name);
        continue;
      }
      for (const { name: place } of parseRelationValue(value)) {
        if (!byName.has(normalizeName(place))) unknown.push(`${name} -> ${place}`);
        else add(hit.id, place);
      }
    }
  }
  if (unknown.length) {
    console.error(`\n  ${unknown.length} names in found-in-extra.json do not resolve:\n    ${unknown.join("\n    ")}\n`);
    process.exit(1);
  }

  let changed = 0;
  let namesAdded = 0;
  for (const [id, places2] of additions) {
    const row = rows.find((r) => r.id === id)!;
    const current = row.fields?.foundIn ?? "";
    const have = new Set(parseRelationValue(current).map((p) => normalizeName(p.name)));
    const fresh = places2.filter((p) => !have.has(normalizeName(p)));
    if (fresh.length === 0) continue;
    const next = [current.trim(), ...fresh].filter(Boolean).join(", ");
    changed++;
    namesAdded += fresh.length;
    if (APPLY) {
      await db.execute(
        sql`UPDATE entries SET fields = jsonb_set(fields, '{foundIn}', to_jsonb(${next}::text)), updated_at = now() WHERE id = ${id}`,
      );
    }
  }

  const after = (r: Row) => (additions.get(r.id)?.length ? true : Boolean(r.fields?.foundIn?.trim()));
  const stillEmpty = rows.filter((r) => SPECIMEN_KINDS.has(r.kind) && !after(r));
  console.log(`\n  ${places.length} new places read; ${changed} specimens ${APPLY ? "updated" : "would be updated"} (+${namesAdded} place names)`);
  console.log(`  specimens still without a Found in: ${stillEmpty.length}`);
  for (const r of stillEmpty.slice(0, 20)) console.log(`    ${r.kind.padEnd(6)} ${r.name}`);
  console.log(APPLY ? "\n  Next: npm run links:rebuild\n" : "\n  Re-run with --apply to write.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
