import "server-only";
import { listEntries, listEntriesBySlugs } from "@/lib/entries";
import { CITIZENSHIPS } from "@/lib/character/house-rules";
import { PUBLIC_EMPIRES } from "@/lib/character/public-options";
import type { EmpireInfo } from "@/components/character/steps";
import type { SessionUser } from "@/lib/session";

/**
 * What a signed-in player's creator may offer, read through the ordinary
 * access rules: the three empires with whatever the codex says about them (and
 * a link to the page), and the gods this player may read. Nothing the player
 * cannot open appears here, so a hidden god is not in the list.
 */
export async function memberCreatorOptions(user: SessionUser): Promise<{ empires: EmpireInfo[]; deities: string[] }> {
  const [pages, deities] = await Promise.all([
    listEntriesBySlugs(user, CITIZENSHIPS.map((c) => c.codexSlug)),
    listEntries(user, { kind: "deity", limit: 600 }),
  ]);
  const empires: EmpireInfo[] = CITIZENSHIPS.map((c) => {
    const page = pages.find((p) => p.slug === c.codexSlug);
    const fallback = PUBLIC_EMPIRES.find((e) => e.id === c.id);
    return {
      id: c.id,
      name: c.name,
      summary: page?.summary || fallback?.summary || "",
      benefits: page?.fields?.benefits || undefined,
      weaknesses: page?.fields?.weaknesses || undefined,
      href: page ? `/codex/entry/${page.slug}` : undefined,
    };
  });
  return { empires, deities: deities.map((d) => d.name).sort((a, b) => a.localeCompare(b)) };
}
