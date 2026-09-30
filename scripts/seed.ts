/**
 * Loads `data/world-seed.json` into Postgres and creates the initial accounts.
 *
 * Safe to re-run: entries are matched by slug and updated in place, so the
 * script never duplicates or deletes anything you have edited in the app.
 * Existing entries keep their body unless the DB copy is empty.
 *
 *   npm run db:seed            # seed data only
 *   npm run db:setup           # run schema push + setup.sql + seed
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzleNode } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, sql } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { entries, links, users, revisions } from "../src/db/schema";
import { hashPassword } from "../src/lib/password";
import { resolveLinks, resolveProseMentions, buildNameIndex } from "../src/lib/links";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");

loadEnv();

/**
 * Let the export's classification overwrite a kind that was changed in the app.
 * Off by default so re-filing a page here survives the next re-import.
 */
const RECLASSIFY = process.argv.includes("--reclassify");

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!url) {
  console.error(
    "\n  DATABASE_URL is not set.\n" +
      "  Copy .env.example to .env.local and paste your Neon connection string.\n",
  );
  process.exit(1);
}

// Mirrors src/db/index.ts: Neon over HTTP in the cloud, node-postgres locally.
const isNeon = /neon\.tech|neon\.build/.test(url);
const pool = isNeon ? null : new Pool({ connectionString: url, max: 5 });
const db = (
  isNeon ? drizzleNeon(neon(url), { schema }) : drizzleNode(pool!, { schema })
) as ReturnType<typeof drizzleNeon<typeof schema>>;

type SeedEntry = {
  slug: string;
  kind: schema.EntryKind;
  name: string;
  summary: string;
  body: string;
  dmNotes: string;
  fields: Record<string, string>;
  tags: string[];
  visibility: "public" | "secret";
  sourcePath: string | null;
  parentSlug: string | null;
};

/** Minimal .env loader so the script works without extra dependencies. */
function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const p = path.join(REPO, file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const [, key, rawValue] = m;
      if (process.env[key] !== undefined) continue;
      process.env[key] = rawValue.replace(/^["'](.*)["']$/s, "$1");
    }
  }
}

/**
 * Splits a SQL file into statements on top-level semicolons, stepping over
 * line/block comments, single-quoted strings, and `$tag$ … $tag$` bodies (which
 * legitimately contain semicolons).
 */
function splitSqlStatements(text: string): string[] {
  const statements: string[] = [];
  let current = "";
  let i = 0;

  while (i < text.length) {
    const rest = text.slice(i);

    if (rest.startsWith("--")) {
      const end = text.indexOf("\n", i);
      i = end === -1 ? text.length : end;
      continue;
    }
    if (rest.startsWith("/*")) {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 2;
      continue;
    }
    if (text[i] === "'") {
      const end = text.indexOf("'", i + 1);
      const stop = end === -1 ? text.length : end + 1;
      current += text.slice(i, stop);
      i = stop;
      continue;
    }
    const dollar = rest.match(/^\$[A-Za-z_]*\$/);
    if (dollar) {
      const tag = dollar[0];
      const end = text.indexOf(tag, i + tag.length);
      const stop = end === -1 ? text.length : end + tag.length;
      current += text.slice(i, stop);
      i = stop;
      continue;
    }
    if (text[i] === ";") {
      if (current.trim()) statements.push(current.trim());
      current = "";
      i++;
      continue;
    }
    current += text[i];
    i++;
  }

  if (current.trim()) statements.push(current.trim());
  return statements;
}

async function runSetupSql() {
  const sqlPath = path.join(REPO, "scripts", "sql", "setup.sql");
  const statements = splitSqlStatements(fs.readFileSync(sqlPath, "utf8"));
  for (const stmt of statements) {
    await db.execute(sql.raw(stmt));
  }
  console.log(`  ✓ extensions, search vector, and indexes ready (${statements.length} statements)`);
}

async function seedUsers() {
  const accounts = [
    {
      username: process.env.DM_USERNAME || "dm",
      password: process.env.DM_PASSWORD,
      role: "dm" as const,
      displayName: "Dungeon Master",
    },
    {
      username: process.env.PLAYER_USERNAME || "party",
      password: process.env.PLAYER_PASSWORD,
      role: "player" as const,
      displayName: "The Party",
    },
  ];

  for (const acct of accounts) {
    if (!acct.password) {
      console.log(`  · skipped ${acct.role} account (no password in env)`);
      continue;
    }
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.username}) = lower(${acct.username})`)
      .limit(1);

    if (existing) {
      console.log(`  · ${acct.role} account "${acct.username}" already exists`);
      continue;
    }
    await db.insert(users).values({
      username: acct.username,
      passwordHash: await hashPassword(acct.password),
      role: acct.role,
      displayName: acct.displayName,
    });
    console.log(`  ✓ created ${acct.role} account "${acct.username}"`);
  }
}

async function seedEntries() {
  const seedPath = path.join(REPO, "data", "world-seed.json");
  if (!fs.existsSync(seedPath)) {
    console.error("  world-seed.json missing — run: npm run import:notion");
    process.exit(1);
  }
  const payload = JSON.parse(fs.readFileSync(seedPath, "utf8")) as {
    entries: SeedEntry[];
  };

  const existing = await db
    .select({
      id: entries.id,
      slug: entries.slug,
      kind: entries.kind,
      summary: entries.summary,
      body: entries.body,
      fields: entries.fields,
      tags: entries.tags,
    })
    .from(entries);
  const bySlug = new Map(existing.map((e) => [e.slug, e]));

  let created = 0;
  let updated = 0;
  let keptKind = 0;

  for (const e of payload.entries) {
    const found = bySlug.get(e.slug);
    if (found) {
      // Never clobber prose you have written in the app: only fill a gap. The
      // same rule applies per-property — an imported value fills a field that is
      // missing or blank, but anything edited in the app wins. Without this a
      // re-import would silently revert edits such as a location's tier.
      const mergedFields = { ...e.fields };
      for (const [key, value] of Object.entries(found.fields ?? {})) {
        if (typeof value === "string" && value.trim()) mergedFields[key] = value;
      }

      // Kind follows the same rule, with one difference: every entry always
      // has one, so there is no blank to fill. The import classifies from the
      // export's folder tree, which cannot know that a page was deliberately
      // re-filed here — "The 3 Empires" is 3,769 characters of empire history
      // that lives under a location folder but belongs in Lore. So the stored
      // kind wins, and `--reclassify` is the way to take the import's instead.
      const keepKind = !RECLASSIFY && found.kind !== e.kind;
      if (keepKind) keptKind++;

      await db
        .update(entries)
        .set({
          name: e.name,
          kind: keepKind ? found.kind : e.kind,
          // A summary written here is the one-liner shown in every list and
          // search result; the export's is often blank or the child database's
          // name, so it fills a gap rather than replacing one.
          summary: found.summary?.trim() ? found.summary : e.summary,
          body: found.body?.trim() ? found.body : e.body,
          fields: mergedFields,
          // Tags follow the same rule: they are curated in the app (derived
          // from an entry's own properties, then hand-corrected), and the
          // export carries none for most kinds. Replacing them on every seed
          // would throw that away.
          tags: found.tags?.length ? found.tags : e.tags,
          sourcePath: e.sourcePath,
        })
        .where(eq(entries.id, found.id));
      updated++;
    } else {
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
          sourcePath: e.sourcePath,
        })
        .returning({
          id: entries.id,
          slug: entries.slug,
          kind: entries.kind,
          summary: entries.summary,
          body: entries.body,
          fields: entries.fields,
          tags: entries.tags,
        });
      bySlug.set(row.slug, row);
      created++;
    }
  }
  console.log(`  ✓ entries: ${created} created, ${updated} updated`);
  if (keptKind) {
    console.log(
      `  · kept ${keptKind} kind${keptKind === 1 ? "" : "s"} set in the app (pass --reclassify to take the export's)`,
    );
  }

  // -- parents --------------------------------------------------------------
  let parented = 0;
  for (const e of payload.entries) {
    if (!e.parentSlug) continue;
    const self = bySlug.get(e.slug);
    const parent = bySlug.get(e.parentSlug);
    if (!self || !parent || self.id === parent.id) continue;
    await db
      .update(entries)
      .set({ parentId: parent.id })
      .where(eq(entries.id, self.id));
    parented++;
  }
  console.log(`  ✓ hierarchy: ${parented} parent links`);

  return payload.entries;
}

/**
 * Entries written for names that appear in the source material but never got a
 * page of their own. Kept in a separate file from the Notion import so the
 * authored content stays clearly distinguishable, and marked
 * `body_source = 'generated'` so `npm run describe -- --revert` clears it.
 */
async function seedExpansion() {
  const file = path.join(REPO, "data", "expansion.json");
  if (!fs.existsSync(file)) return;

  const payload = JSON.parse(fs.readFileSync(file, "utf8")) as {
    entries: (SeedEntry & { sourceNote?: string })[];
  };

  const existing = await db
    .select({
      id: entries.id,
      slug: entries.slug,
      body: entries.body,
      bodySource: entries.bodySource,
    })
    .from(entries);
  const bySlug = new Map(existing.map((e) => [e.slug, e]));

  let created = 0;
  let refreshed = 0;
  let untouched = 0;

  for (const e of payload.entries) {
    const found = bySlug.get(e.slug);
    if (found) {
      // Some authored entries fill an imported stub rather than adding a new
      // page. Write into it only while it is still empty — or while it holds
      // text we generated. Anything you have written by hand is left alone.
      const isEmpty = !found.body.trim();
      if (!isEmpty && found.bodySource !== "generated") {
        untouched++;
        continue;
      }
      await db
        .update(entries)
        .set({
          name: e.name,
          kind: e.kind,
          summary: e.summary,
          body: e.body,
          // Merge rather than replace: keep any properties the import captured.
          fields: { ...(e.fields ?? {}) },
          tags: e.tags ?? [],
          visibility: e.visibility ?? "public",
          bodySource: "generated",
        })
        .where(eq(entries.id, found.id));
      refreshed++;
      continue;
    }

    await db.insert(entries).values({
      slug: e.slug,
      kind: e.kind,
      name: e.name,
      summary: e.summary ?? "",
      body: e.body ?? "",
      dmNotes: "",
      fields: e.fields ?? {},
      tags: e.tags ?? [],
      visibility: e.visibility ?? "public",
      bodySource: "generated",
      sourcePath: e.sourceNote ? `authored: ${e.sourceNote}` : "authored",
    });
    created++;
  }

  console.log(
    `  ✓ expansion: ${created} added, ${refreshed} refreshed` +
      (untouched ? `, ${untouched} left alone (edited by you)` : ""),
  );
}

async function buildLinkGraph() {
  const all = await db
    .select({
      id: entries.id,
      name: entries.name,
      body: entries.body,
      fields: entries.fields,
    })
    .from(entries);

  const nameIndex = buildNameIndex(all);

  await db.delete(links);

  const rows: {
    sourceId: string;
    targetId: string;
    relation: string;
    context: string | null;
  }[] = [];
  for (const e of all) {
    const seen = new Set<string>();
    const explicit = resolveLinks(e.id, e.body, e.fields ?? {}, nameIndex);
    for (const l of explicit) {
      seen.add(`${l.targetId}:${l.relation}`);
      rows.push({
        sourceId: e.id,
        targetId: l.targetId,
        relation: l.relation,
        context: l.context ?? null,
      });
    }
    const prose = resolveProseMentions(e.id, e.body, all, seen);
    for (const l of prose) {
      rows.push({
        sourceId: e.id,
        targetId: l.targetId,
        relation: l.relation,
        context: l.context ?? null,
      });
    }
  }

  // Insert in chunks — Neon's HTTP driver has a per-statement size limit.
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.insert(links).values(rows.slice(i, i + CHUNK)).onConflictDoNothing();
  }
  console.log(`  ✓ link graph: ${rows.length} connections`);
}

async function main() {
  console.log("\n  Seeding the Asetheria codex\n");

  if (process.argv.includes("--push")) {
    console.log("  · pushing schema with drizzle-kit…");
    execSync("npx drizzle-kit push --force", {
      cwd: REPO,
      stdio: "inherit",
      env: process.env,
    });
  }

  await runSetupSql();
  await seedUsers();
  await seedEntries();
  await seedExpansion();
  await buildLinkGraph();

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(entries);
  console.log(`\n  Done — ${count} entries in the codex.\n`);
  await pool?.end();
}

main().catch(async (err) => {
  console.error("\n  Seed failed:\n", err);
  await pool?.end();
  process.exit(1);
});
