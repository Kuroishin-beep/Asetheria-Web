/**
 * Fills in tags for entries that have none, deriving every tag from data the
 * entry already carries rather than inventing classifications.
 *
 * The world's three empires are built on Rome (Imperium Invicta), Greece
 * (Hellenoria) and Achaemenid Persia (Acheaoria), but the codex speaks in its
 * own vocabulary — "Invictian", "Hellenorian", "Acheaorian" — so the tags do
 * too. The real-world basis is recorded on the six empire entries, where it is
 * useful reference for the DM, and nowhere else.
 *
 * Existing tags are never replaced; only entries with no tags are touched.
 *
 * Run with:  npx tsx scripts/populate-tags.ts          (dry run)
 *            npx tsx scripts/populate-tags.ts --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq, isNull, sql } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { entries } from "../src/db/schema";

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

/** The standing empires and the kingdoms that came before. */
const EMPIRE_TAGS: Record<string, string[]> = {
  "imperium-invicta": ["Empire", "Standing", "Invictian", "Roman basis"],
  hellenoria: ["Empire", "Standing", "Hellenorian", "Greek basis"],
  acheaoria: ["Empire", "Standing", "Acheaorian", "Persian basis"],
  "mycairos-the-kingdom-of-bronze-and-blood": ["Empire", "Fallen", "Old Empire"],
  "nethrana-the-kingdom-of-mirrors-and-mist": ["Empire", "Fallen", "Old Empire"],
  "the-old-empires": ["Empire", "Fallen", "Old Empire"],
};

/** "Invictian Organization" -> "Invictian"; handles the comma-joined values. */
function spheresToTags(sphere: string): string[] {
  return sphere
    .split(",")
    .map((s) => s.trim().replace(/\s+Organization$/i, ""))
    .filter(Boolean);
}

function tagsFor(e: {
  kind: string;
  slug: string;
  fields: Record<string, string>;
}): string[] {
  const f = e.fields ?? {};
  const out: string[] = [];

  switch (e.kind) {
    case "empire":
      out.push(...(EMPIRE_TAGS[e.slug] ?? ["Empire"]));
      break;

    case "organization": {
      if (f.organization) out.push(...spheresToTags(f.organization));
      if (f.subcategory) out.push(f.subcategory.trim());
      if (f.type) out.push(f.type.trim());
      break;
    }

    case "family":
      out.push("Family");
      if (f.seat) out.push(f.seat.trim());
      if (f.title) out.push(f.title.trim());
      break;

    case "faction":
      out.push("Faction");
      if (f.alignment) out.push(f.alignment.trim());
      break;

    case "pantheon":
      out.push("Pantheon");
      if (f.culture) out.push(f.culture.trim());
      break;

    case "quest":
      out.push("Quest");
      if (f.status) out.push(f.status.trim());
      break;

    case "ore":
      out.push("Ore");
      break;

    case "flora":
      out.push("Flora & Fauna");
      break;

    case "item":
      out.push("Item");
      if (f.rarity) out.push(f.rarity.trim());
      break;

    case "rule":
      out.push("House Rule");
      if (f.category) out.push(f.category.trim());
      break;

    case "lore":
      out.push("Lore");
      if (f.era) out.push(f.era.trim());
      break;

    default:
      break;
  }

  // Tags are a browsing index; a 60-character sentence is not a useful facet.
  const seen = new Set<string>();
  return out
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter((t) => t && t.length <= 40)
    .filter((t) => (seen.has(t.toLowerCase()) ? false : (seen.add(t.toLowerCase()), true)));
}

async function main() {
  const rows = await db
    .select({
      id: entries.id,
      name: entries.name,
      kind: entries.kind,
      slug: entries.slug,
      fields: entries.fields,
      tags: entries.tags,
    })
    .from(entries)
    .where(isNull(entries.archivedAt));

  const plan: { id: string; name: string; kind: string; tags: string[] }[] = [];
  for (const r of rows) {
    const existing = r.tags ?? [];
    const derived = tagsFor(r as never);
    if (!derived.length) continue;

    // Empires are additive: the three standing powers already carry an "Empire"
    // tag from the Notion database, but not the cultural basis, and that is the
    // most useful thing to be able to filter on.
    if (r.kind === "empire") {
      const merged = [...existing];
      const lower = new Set(merged.map((t) => t.toLowerCase()));
      for (const t of derived) if (!lower.has(t.toLowerCase())) merged.push(t);
      if (merged.length !== existing.length) {
        plan.push({ id: r.id, name: r.name, kind: r.kind, tags: merged });
      }
      continue;
    }

    if (existing.length > 0) continue; // never overwrite existing tags
    plan.push({ id: r.id, name: r.name, kind: r.kind, tags: derived });
  }

  const byKind = new Map<string, number>();
  for (const p of plan) byKind.set(p.kind, (byKind.get(p.kind) ?? 0) + 1);

  console.log(`\n  live entries      : ${rows.length}`);
  console.log(`  will gain tags    : ${plan.length}\n`);
  for (const [k, n] of [...byKind].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(n).padStart(4)}  ${k}`);
  }
  console.log("\n  samples:");
  for (const p of plan.slice(0, 10)) {
    console.log(`    ${p.name.slice(0, 34).padEnd(36)} ${JSON.stringify(p.tags)}`);
  }

  if (!APPLY) {
    console.log("\n  Dry run. Re-run with --apply to write these tags.\n");
    return;
  }

  for (const p of plan) {
    await db
      .update(entries)
      .set({ tags: p.tags, updatedAt: new Date() })
      .where(eq(entries.id, p.id));
  }
  console.log(`\n  Applied: ${plan.length} entries tagged.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
