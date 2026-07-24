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
    .select({ id: entries.id, slug: entries.slug, body: entries.body })
    .from(entries);
  const bySlug = new Map(existing.map((e) => [e.slug, e]));

  let created = 0;
  let updated = 0;

  for (const e of payload.entries) {
    const found = bySlug.get(e.slug);
    if (found) {
      // Never clobber prose you have written in the app: only fill a gap.
      await db
        .update(entries)
        .set({
          name: e.name,
          kind: e.kind,
          summary: e.summary,
          body: found.body?.trim() ? found.body : e.body,
          fields: e.fields,
          tags: e.tags,
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
        .returning({ id: entries.id, slug: entries.slug, body: entries.body });
      bySlug.set(row.slug, row);
      created++;
    }
  }
  console.log(`  ✓ entries: ${created} created, ${updated} updated`);

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

  const rows: { sourceId: string; targetId: string; relation: string }[] = [];
  for (const e of all) {
    const seen = new Set<string>();
    const explicit = resolveLinks(e.id, e.body, e.fields ?? {}, nameIndex);
    for (const l of explicit) {
      seen.add(`${l.targetId}:${l.relation}`);
      rows.push({ sourceId: e.id, targetId: l.targetId, relation: l.relation });
    }
    const prose = resolveProseMentions(e.id, e.body, all, seen);
    for (const l of prose) {
      rows.push({ sourceId: e.id, targetId: l.targetId, relation: l.relation });
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
