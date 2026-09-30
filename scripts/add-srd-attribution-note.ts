/**
 * Creates the public attribution note that every SRD-derived creature entry
 * links back to. Must be run before `import-srd-monsters.ts`, which checks
 * for this note by name and refuses to run without it.
 *
 * This is a public Note, not a DM-only one: the Creative Commons license the
 * SRD is released under requires attribution to be given, and a note only the
 * DM can see would not satisfy that.
 *
 * Idempotent: does nothing if the note already exists.
 *
 * Run with:  npx tsx scripts/add-srd-attribution-note.ts          (dry run)
 *            npx tsx scripts/add-srd-attribution-note.ts --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { entries } from "../src/db/schema";
import { slugify } from "../src/lib/links";

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

const NAME = "System Reference Document (SRD 5.1)";

const BODY = `This bestiary's base layer — every entry tagged **SRD 5.1** — is reproduced from the *System Reference Document* (SRD 5.1), a limited slice of the D&D 5th Edition rules that Wizards of the Coast releases specifically so it can be reused this way.

## Source

System Reference Document 5.1, © 2023 Wizards of the Coast LLC.
Available at: https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf

## License

Creative Commons Attribution 4.0 International (CC BY 4.0).
Full text: https://creativecommons.org/licenses/by/4.0/legalcode

## Changes made

Stat blocks were reformatted from the SRD's structured data into the Markdown used throughout this codex. No mechanical content — numbers, traits, actions — was altered.

## What this is not

This is not the full Monster Manual. Wizards of the Coast's fuller bestiaries, and creatures identified as their Product Identity rather than open content — beholders, mind flayers, displacer beasts, and others — are not included here. Where this codex has creatures like those, they are original, written for Asetheria rather than reproduced from any book.

---

This project is not affiliated with, endorsed, sponsored, or specifically approved by Wizards of the Coast LLC.`;

async function main() {
  const [existing] = await db
    .select({ id: entries.id })
    .from(entries)
    .where(sql`lower(${entries.name}) = lower(${NAME})`)
    .limit(1);

  if (existing) {
    console.log(`\n  "${NAME}" already exists. Nothing to do.\n`);
    return;
  }

  console.log(`\n  will create: "${NAME}"`);
  console.log(`  body length: ${BODY.length} chars\n`);

  if (!APPLY) {
    console.log("  Dry run. Re-run with --apply to create it.\n");
    return;
  }

  await db.insert(entries).values({
    slug: slugify(NAME),
    kind: "note",
    name: NAME,
    summary: "Source and license for the SRD-derived entries in the Bestiary.",
    body: BODY,
    tags: ["SRD 5.1", "Attribution"],
    visibility: "public",
  });

  console.log("  Created.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
