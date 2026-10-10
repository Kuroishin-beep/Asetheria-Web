import { BACKGROUND_NAMES, CLASSES, RACES } from "@/lib/character/srd";

/**
 * "Learn more" links for the character creator. They point at
 * dnd5e.wikidot.com and are LINKS ONLY: nothing from that site is copied,
 * embedded or fetched by the app (the codex takes no content from Wikidot).
 * Every URL here was checked to exist when it was added; `isAllowedWikidotUrl`
 * and the tests keep the table to that one host and to known page shapes.
 */

export const WIKIDOT_HOST = "dnd5e.wikidot.com";
const BASE = `https://${WIKIDOT_HOST}`;

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Wikidot's own site search, for rules topics that have no page of their own. */
export const wikidotSearch = (query: string) => `${BASE}/search:site/q/${encodeURIComponent(query)}`;

export type LearnLink = { label: string; href: string };

/** A subrace's page is its parent lineage's page. */
const LINEAGE_PAGE: Record<string, string> = {
  dragonborn: "dragonborn",
  "hill-dwarf": "dwarf",
  "high-elf": "elf",
  "rock-gnome": "gnome",
  "half-elf": "half-elf",
  "half-orc": "half-orc",
  "lightfoot-halfling": "halfling",
  human: "human",
  tiefling: "tiefling",
};

export const heritageLink = (raceId: string): LearnLink | null => {
  const page = LINEAGE_PAGE[raceId];
  const race = RACES.find((r) => r.id === raceId);
  return page && race ? { label: `${race.name} on Wikidot`, href: `${BASE}/lineage:${page}` } : null;
};

export const classLink = (classId: string): LearnLink | null => {
  const c = CLASSES.find((k) => k.id === classId);
  return c ? { label: `${c.name} on Wikidot`, href: `${BASE}/${c.id}` } : null;
};

export const backgroundLink = (name: string): LearnLink | null =>
  (BACKGROUND_NAMES as readonly string[]).includes(name) ? { label: `${name} on Wikidot`, href: `${BASE}/background:${slug(name)}` } : null;

/** Steps with a general explainer: a list of links shown under the step. */
export const STEP_LINKS: Record<string, LearnLink[]> = {
  who: [{ label: "Wikidot D&D 5e home", href: `${BASE}/` }],
  heritage: [{ label: "All lineages on Wikidot", href: `${BASE}/lineage` }],
  class: [
    { label: "Wizard (an example class page)", href: `${BASE}/wizard` },
    { label: "Proficiency bonus", href: wikidotSearch("proficiency bonus") },
  ],
  background: [{ label: "Backgrounds: search Wikidot", href: wikidotSearch("background") }],
  scores: [
    { label: "Ability scores", href: wikidotSearch("ability scores") },
    { label: "Point buy", href: wikidotSearch("point buy") },
    { label: "Standard array", href: wikidotSearch("standard array") },
  ],
  skills: [
    { label: "Skills", href: wikidotSearch("skills") },
    { label: "Saving throws", href: wikidotSearch("saving throws") },
  ],
  hp: [{ label: "Hit points and hit dice", href: wikidotSearch("hit points") }],
  equipment: [
    { label: "Weapons", href: `${BASE}/weapons` },
    { label: "Armor", href: `${BASE}/armor` },
    { label: "Adventuring gear", href: `${BASE}/adventuring-gear` },
  ],
  citizenship: [],
  worship: [],
  personality: [],
  review: [
    { label: "Spells", href: `${BASE}/spells` },
    { label: "Flanking", href: wikidotSearch("flanking") },
    { label: "Death saving throws", href: wikidotSearch("death saving throws") },
  ],
};

/** Every link the creator can show, for tests and for the link-check script. */
export function allWikidotLinks(): string[] {
  const out = new Set<string>();
  for (const r of RACES) {
    const l = heritageLink(r.id);
    if (l) out.add(l.href);
  }
  for (const c of CLASSES) {
    const l = classLink(c.id);
    if (l) out.add(l.href);
  }
  for (const b of BACKGROUND_NAMES) {
    const l = backgroundLink(b);
    if (l) out.add(l.href);
  }
  for (const list of Object.values(STEP_LINKS)) for (const l of list) out.add(l.href);
  return [...out];
}

/** The only shapes of address the creator may link to. */
const PATHS = [
  /^\/$/,
  /^\/lineage$/,
  /^\/lineage:[a-z-]+$/,
  /^\/(barbarian|bard|cleric|druid|fighter|monk|paladin|ranger|rogue|sorcerer|warlock|wizard)$/,
  /^\/background:[a-z-]+$/,
  /^\/(spells|armor|weapons|adventuring-gear)$/,
  /^\/search:site\/q\/[A-Za-z0-9%._~-]+$/,
];

export function isAllowedWikidotUrl(href: string): boolean {
  try {
    const url = new URL(href);
    return url.protocol === "https:" && url.hostname === WIKIDOT_HOST && !url.port && !url.username && !url.search && !url.hash && PATHS.some((p) => p.test(url.pathname));
  } catch {
    return false;
  }
}
