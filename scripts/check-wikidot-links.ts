/**
 * Checks that every outbound "Learn more" link the character creator can show
 * still answers on dnd5e.wikidot.com. Run by hand (it needs the network):
 *
 *   npx tsx scripts/check-wikidot-links.ts
 *
 * Search links are skipped (they always answer); the rest must return 200.
 */
import { allWikidotLinks } from "../src/lib/character/links";

async function main(): Promise<void> {
  const links = allWikidotLinks().filter((l) => !l.includes("/search:site/"));
  const bad: string[] = [];
  for (const href of links) {
    try {
      const res = await fetch(href, { method: "GET", redirect: "follow", headers: { "user-agent": "asetheria-link-check" } });
      if (res.status !== 200) bad.push(`${res.status} ${href}`);
    } catch (error) {
      bad.push(`ERR ${href} ${(error as Error).message}`);
    }
  }
  process.stdout.write(`${links.length} links checked, ${bad.length} not OK\n`);
  for (const line of bad) process.stdout.write(`  ${line}\n`);
  process.exit(bad.length === 0 ? 0 : 1);
}

void main();
