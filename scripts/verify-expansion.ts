/**
 * Offline validation of data/expansion.json against data/world-seed.json.
 * No database required.
 *
 *   npm run verify:expansion
 *
 * Checks that every authored entry has the required shape, that no slug
 * collides with an imported entry, and — most importantly — that every
 * [[wiki link]] resolves to a real entry, so the new pages actually connect to
 * the world instead of dangling.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildNameIndex, extractWikiLinks, normalizeName } from "../src/lib/links";
import { describeEntry } from "../src/lib/describe";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");

const seed = JSON.parse(
  fs.readFileSync(path.join(REPO, "data", "world-seed.json"), "utf8"),
) as { entries: any[] };
const expansion = JSON.parse(
  fs.readFileSync(path.join(REPO, "data", "expansion.json"), "utf8"),
) as { entries: any[] };

const problems: string[] = [];

// Combined world: imported entries plus the authored ones.
const all = [
  ...seed.entries.map((e, i) => ({ id: `s${i}`, name: e.name, slug: e.slug })),
  ...expansion.entries.map((e, i) => ({ id: `x${i}`, name: e.name, slug: e.slug })),
];
const nameIndex = buildNameIndex(all);

const seedSlugs = new Set(seed.entries.map((e) => e.slug));
const seenSlugs = new Set<string>();

const VALID_KINDS = new Set([
  "deity", "pantheon", "organization", "faction", "location", "empire", "npc",
  "family", "creature", "item", "ore", "flora", "lore", "quest", "session",
  "rule", "system", "note",
]);

let linkCount = 0;

for (const e of expansion.entries) {
  const where = `"${e.name ?? e.slug}"`;
  if (!e.slug) problems.push(`${where}: missing slug`);
  if (!e.name) problems.push(`${where}: missing name`);
  if (!e.kind || !VALID_KINDS.has(e.kind)) problems.push(`${where}: bad kind "${e.kind}"`);
  if (!e.summary?.trim()) problems.push(`${where}: missing summary`);
  if (!e.body?.trim()) problems.push(`${where}: missing body`);
  if (!e.sourceNote?.trim()) problems.push(`${where}: missing sourceNote (provenance)`);
  if (e.visibility && !["public", "secret", "revealed"].includes(e.visibility)) {
    problems.push(`${where}: bad visibility "${e.visibility}"`);
  }
  // Entries that deliberately fill an imported stub reuse its slug and say so.
  const fillsStub = /fills an existing entry/i.test(e.sourceNote ?? "");
  if (seedSlugs.has(e.slug) && !fillsStub) {
    problems.push(
      `${where}: slug "${e.slug}" collides with an imported entry (say "Fills an existing entry" in sourceNote if intended)`,
    );
  }
  if (fillsStub && !seedSlugs.has(e.slug)) {
    problems.push(`${where}: claims to fill a stub, but slug "${e.slug}" matches no imported entry`);
  }
  if (seenSlugs.has(e.slug)) problems.push(`${where}: duplicate slug "${e.slug}"`);
  seenSlugs.add(e.slug);

  for (const target of extractWikiLinks(e.body ?? "")) {
    linkCount++;
    if (!nameIndex.get(normalizeName(target))) {
      problems.push(`${where}: [[${target}]] does not resolve to any entry`);
    }
  }
}

// Stub coverage: an imported stub is covered either by the property-derived
// describe pass or by an authored entry that fills its slug.
const filledSlugs = new Set(
  expansion.entries
    .filter((e) => /fills an existing entry/i.test(e.sourceNote ?? ""))
    .map((e) => e.slug),
);
const covered = (e: any) => Boolean(describeEntry(e)) || filledSlugs.has(e.slug);

const stubs = seed.entries.filter((e) => !e.body.trim());
const described = stubs.filter(covered);
const stillEmpty = stubs.filter((e) => !covered(e));

console.log(`\n  authored entries : ${expansion.entries.length}`);
console.log(`  wiki links       : ${linkCount}`);
console.log(`  problems         : ${problems.length}\n`);
for (const p of problems.slice(0, 40)) console.log(`    ! ${p}`);

console.log(`\n  imported stubs   : ${stubs.length}`);
console.log(`  now described    : ${described.length}`);
console.log(`  still empty      : ${stillEmpty.length}`);
if (stillEmpty.length) {
  console.log("\n  left empty (nothing to ground a description in):");
  for (const e of stillEmpty) console.log(`    ${e.kind.padEnd(10)} ${e.name}`);
}

const byKind = new Map<string, number>();
for (const e of expansion.entries) byKind.set(e.kind, (byKind.get(e.kind) ?? 0) + 1);
console.log("\n  authored by kind:");
for (const [k, n] of [...byKind].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${k.padEnd(14)} ${n}`);
}
console.log();

if (problems.length) process.exitCode = 1;
