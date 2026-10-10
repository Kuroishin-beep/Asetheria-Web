import fs from "node:fs";
import path from "node:path";

/**
 * Case ids for tests whose titles are generated in a loop (one source line,
 * many tests), where the id cannot be written into the title by hand. The ids
 * come from `test-cases/ids.json`, the same table `scripts/build-test-cases.ts`
 * keeps, keyed by spec file, describe path and title.
 */
const ids = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "test-cases", "ids.json"), "utf8")) as Record<string, string>;

export function tc(file: string, describe: string, title: string): string {
  const id = ids[`${file}::${describe}::${title}`];
  if (!id) throw new Error(`No case id for "${file} › ${describe} › ${title}". Run: npx tsx scripts/build-test-cases.ts`);
  return `[${id}] ${title}`;
}
