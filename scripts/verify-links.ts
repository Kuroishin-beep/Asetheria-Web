/**
 * Dry-run of the link graph against data/world-seed.json — no database needed.
 *
 * Prints what the quoted-backlink feature will actually produce, so the output
 * quality can be judged before seeding.
 *
 *   npx tsx scripts/verify-links.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildNameIndex,
  resolveLinks,
  resolveProseMentions,
} from "../src/lib/links";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");

type SeedEntry = {
  slug: string;
  name: string;
  kind: string;
  body: string;
  fields: Record<string, string>;
};

const payload = JSON.parse(
  fs.readFileSync(path.join(REPO, "data", "world-seed.json"), "utf8"),
) as { entries: SeedEntry[] };

// Stand-in ids; only identity matters for the dry run.
const all = payload.entries.map((e, i) => ({ ...e, id: String(i) }));
const byId = new Map(all.map((e) => [e.id, e]));
const nameIndex = buildNameIndex(all);

type Edge = { from: string; to: string; relation: string; context: string | null };
const edges: Edge[] = [];

for (const e of all) {
  const seen = new Set<string>();
  for (const l of resolveLinks(e.id, e.body, e.fields ?? {}, nameIndex)) {
    seen.add(`${l.targetId}:${l.relation}`);
    edges.push({
      from: e.id,
      to: l.targetId,
      relation: l.relation,
      context: l.context ?? null,
    });
  }
  for (const l of resolveProseMentions(e.id, e.body, all, seen)) {
    edges.push({
      from: e.id,
      to: l.targetId,
      relation: l.relation,
      context: l.context ?? null,
    });
  }
}

const withContext = edges.filter((e) => e.context);
const byRelation = new Map<string, number>();
for (const e of edges) byRelation.set(e.relation, (byRelation.get(e.relation) ?? 0) + 1);

console.log(`\n  entries          : ${all.length}`);
console.log(`  name index keys  : ${nameIndex.size}  (names + resolved aliases)`);
console.log(`  edges            : ${edges.length}`);
console.log(`  with quoted text : ${withContext.length}\n`);

console.log("  by relation:");
for (const [rel, n] of [...byRelation].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${rel.padEnd(14)} ${n}`);
}

// How many previously-empty entries now show something useful.
const stubs = all.filter((e) => !e.body.trim());
const stubsWithBacklinks = new Set(
  edges.filter((e) => byId.get(e.to) && !byId.get(e.to)!.body.trim()).map((e) => e.to),
);
console.log(
  `\n  stub entries               : ${stubs.length}` +
    `\n  stubs that now show context: ${stubsWithBacklinks.size}\n`,
);

console.log("  ── sample quoted backlinks ──\n");
const samples = withContext
  .filter((e) => {
    const target = byId.get(e.to);
    return target && !target.body.trim();
  })
  .slice(0, 12);

for (const e of samples) {
  const from = byId.get(e.from)!;
  const to = byId.get(e.to)!;
  console.log(`  ${to.name}  ←  ${from.name}`);
  console.log(`     "${e.context}"\n`);
}
