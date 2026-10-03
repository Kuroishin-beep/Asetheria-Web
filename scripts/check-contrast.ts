/**
 * Prints the WCAG contrast of every token pair in both themes and exits
 * non-zero if any pair is under its minimum. `--markdown` prints the table
 * used in docs/design-tokens.md.
 *
 *   npx tsx scripts/check-contrast.ts
 *   npx tsx scripts/check-contrast.ts --markdown
 */
import { measureAll } from "./lib/contrast";

const rows = measureAll();
const markdown = process.argv.includes("--markdown");
let failed = 0;

if (markdown) {
  console.log("| Pair | Role | Min | Light | Dark |");
  console.log("|---|---|---|---|---|");
}
const byKey = new Map<string, { light?: number; dark?: number; min: number; role: string }>();
for (const r of rows) {
  const key = `${r.fg} on ${r.bg}`;
  const cur = byKey.get(key) ?? { min: r.min, role: r.role };
  cur[r.theme] = r.ratio;
  byKey.set(key, cur);
  if (r.ratio < r.min) failed++;
}
for (const [key, v] of byKey) {
  const l = v.light ?? 0;
  const d = v.dark ?? 0;
  const flag = (n: number) => (n < v.min ? " FAIL" : "");
  if (markdown) {
    console.log(`| ${key} | ${v.role} | ${v.min}:1 | ${l.toFixed(2)}${flag(l)} | ${d.toFixed(2)}${flag(d)} |`);
  } else {
    console.log(`${key.padEnd(44)} min ${String(v.min).padEnd(4)} light ${l.toFixed(2)}${flag(l)}  dark ${d.toFixed(2)}${flag(d)}`);
  }
}
if (failed) {
  console.error(`\n  ${failed} pair(s) below their minimum.\n`);
  process.exit(1);
}
