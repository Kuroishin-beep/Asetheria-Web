/**
 * Imports the custom Asetheria Foundry VTT world compendium into the codex.
 *
 * Foundry compendium packs are LevelDB directories (Foundry v10+), not JSON
 * files, so this reads them with `classic-level` — the same library Foundry
 * itself uses — in read-only fashion. Close Foundry before running this: a
 * running server holds the LevelDB lock and the open() call below will fail.
 *
 * Scope (deliberate, see PLAN.md ENH-05): only the **custom** pack,
 * `asetheira-compendium`, is imported automatically. The `ddb-asetheria-*`
 * and `beneos_module_*` packs in the same `packs/` folder are D&D Beyond /
 * commercial third-party content and are left out — re-publishing licensed
 * content into a self-hosted database needs an explicit decision, not an
 * automatic import. See IMPLEMENTATION_TRACKER.md.
 *
 * Safe to re-run: matched by slug, existing entries are never overwritten.
 *
 *   npm run import:foundry
 *   npm run import:foundry -- --path "D:\Foundry\Data\worlds\asetheria\packs\asetheira-compendium"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ClassicLevel } from "classic-level";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzleNode } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, sql } from "drizzle-orm";
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

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const DEFAULT_PACK_PATH =
  "E:\\FoundryVTT\\Data\\worlds\\asetheria\\packs\\asetheira-compendium";
const packPath = arg("path") ?? process.env.FOUNDRY_COMPENDIUM_PATH ?? DEFAULT_PACK_PATH;

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

/** Foundry biography fields are stored as HTML from its rich-text editor. */
function htmlToPlainText(html: string | undefined | null): string {
  if (!html) return "";
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/&rsquo;/gi, "\u2019")
    .replace(/&lsquo;/gi, "\u2018")
    .replace(/&rdquo;/gi, "\u201d")
    .replace(/&ldquo;/gi, "\u201c")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function slugify(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "foundry-actor"
  );
}

type FoundryDoc = { _id: string; name: string; type: string; [k: string]: unknown };

async function readCompendium(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Compendium path does not exist: ${dirPath}`);
  }
  const level = new ClassicLevel<string, FoundryDoc>(dirPath, { valueEncoding: "json" });
  await level.open();

  const actors: FoundryDoc[] = [];
  const itemsByActor = new Map<string, FoundryDoc[]>();

  for await (const [key, value] of level.iterator()) {
    const actorMatch = key.match(/^!actors\.items!([^.]+)\./);
    if (actorMatch) {
      const list = itemsByActor.get(actorMatch[1]) ?? [];
      list.push(value);
      itemsByActor.set(actorMatch[1], list);
      continue;
    }
    if (key.startsWith("!actors!")) {
      actors.push(value);
    }
  }

  await level.close();
  return { actors, itemsByActor };
}

function describeActor(actor: FoundryDoc, items: FoundryDoc[]) {
  const system = (actor as any).system ?? {};
  const details = system.details ?? {};
  const findItem = (id: unknown) => items.find((i) => i._id === id);

  const race = findItem(details.race)?.name as string | undefined;
  const background = findItem(details.background)?.name as string | undefined;
  const classes = items
    .filter((i) => i.type === "class")
    .map((i) => `${i.name} ${((i as any).system?.levels ?? "").toString()}`.trim());

  const hp = system.attributes?.hp;
  const ac = system.attributes?.ac;
  const statblock = [
    classes.length ? `Class: ${classes.join(", ")}` : null,
    hp?.max ?? hp?.value ? `HP: ${hp.value}${hp.max ? `/${hp.max}` : ""}` : null,
    ac?.flat ? `AC: ${ac.flat}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  const bio = htmlToPlainText(details.biography?.value as string | undefined);

  return {
    race,
    background,
    role: [classes.join(", "), background ? `Background: ${background}` : null]
      .filter(Boolean)
      .join(" — "),
    statblock,
    summary: [race, classes.join(", ")].filter(Boolean).join(" "),
    body: bio,
  };
}

async function main() {
  console.log(`\n  Importing Foundry compendium\n  Source: ${packPath}\n`);

  const { actors, itemsByActor } = await readCompendium(packPath);
  console.log(`  Found ${actors.length} actor(s) in the pack.`);

  let created = 0;
  let skipped = 0;

  for (const actor of actors) {
    if (actor.type !== "character") {
      skipped++;
      continue;
    }
    const items = itemsByActor.get(actor._id) ?? [];
    const desc = describeActor(actor, items);
    const slug = slugify(actor.name);

    const [existing] = await db
      .select({ id: entries.id })
      .from(entries)
      .where(eq(entries.slug, slug))
      .limit(1);
    if (existing) {
      console.log(`  · "${actor.name}" already exists — skipped`);
      skipped++;
      continue;
    }

    await db.insert(entries).values({
      slug,
      kind: "npc",
      name: actor.name,
      summary: desc.summary || "Imported from the Foundry VTT world.",
      body: desc.body,
      dmNotes: "",
      fields: {
        ...(desc.race ? { race: desc.race } : {}),
        ...(desc.role ? { role: desc.role } : {}),
        ...(desc.statblock ? { statblock: desc.statblock } : {}),
      },
      tags: ["foundry-import", "player-character"],
      visibility: "public",
      sourcePath: `Foundry VTT: asetheira-compendium/${actor._id}`,
    });
    console.log(`  ✓ imported "${actor.name}"`);
    created++;
  }

  console.log(`\n  ${created} created, ${skipped} skipped.\n`);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(entries);
  console.log(`  Done — ${count} entries in the codex.\n`);
  await pool?.end();
}

main().catch(async (err) => {
  console.error("\n  Foundry import failed:\n", err);
  await pool?.end();
  process.exit(1);
});
