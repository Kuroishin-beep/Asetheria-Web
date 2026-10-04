/**
 * Runs the static design-system gates (see scripts/lib/design-gates.ts) and
 * prints every violation. Exits 1 if there are any.
 *
 *   npx tsx scripts/check-design-system.ts
 */
import { RULES, scan } from "./lib/design-gates";

const violations = scan();
if (violations.length === 0) {
  console.log(`\n  Design-system gates: ${RULES.length} rules, 0 violations.\n`);
} else {
  const byRule = new Map<string, typeof violations>();
  for (const v of violations) byRule.set(v.rule, [...(byRule.get(v.rule) ?? []), v]);
  for (const [rule, list] of byRule) {
    console.error(`\n  ${rule} (${list.length})`);
    for (const v of list.slice(0, 40)) console.error(`    ${v.file}:${v.line}  ${v.text}`);
    if (list.length > 40) console.error(`    ... ${list.length - 40} more`);
  }
  console.error(`\n  ${violations.length} violation(s).\n`);
  process.exit(1);
}
