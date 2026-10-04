/**
 * Validates the original natural-world batches (data/natural-world/*.json)
 * without touching a database: shape, required fields, provenance notes, the
 * licence denylist and the promised counts. Exits 1 on any problem.
 *
 *   npx tsx scripts/verify-natural-world.ts
 */
import { PLACE_TARGET, TABLE_TARGET, TARGETS, check, loadAll, loadPlaces, loadTables } from "./lib/natural-world";

const problems = check();
const all = loadAll().flatMap((f) => f.entries);
const counts = (kind: string) => all.filter((e) => e.kind === kind).length;

console.log(`\n  ore ${counts("ore")}/${TARGETS.ore}   flora ${counts("flora")}/${TARGETS.flora}   fauna ${counts("fauna")}/${TARGETS.fauna}   places ${loadPlaces().flatMap((f) => f.entries).length}/${PLACE_TARGET}   tables ${loadTables().length}/${TABLE_TARGET}`);
if (problems.length === 0) {
  console.log("  natural-world data: 0 problems.\n");
} else {
  for (const p of problems) console.error(`    ${p}`);
  console.error(`\n  ${problems.length} problem(s).\n`);
  process.exit(1);
}
