/**
 * Location tiers.
 *
 * The Notion database already classified every settlement through its tags —
 * "Invictian City", "Hellenorian Town", "Island Village" and so on — so the
 * tier is derived from those rather than stored by hand. Deriving it keeps a
 * re-import authoritative while still leaving `tier` editable per entry for the
 * handful of places the tags do not describe.
 */

export type LocationTier =
  | "capital"
  | "city"
  | "town"
  | "village"
  | "district"
  | "site"
  | "wild";

export type TierDef = {
  tier: LocationTier;
  label: string;
  singular: string;
  slug: string;
  icon: string;
  blurb: string;
};

/** Order here is the order the sections appear in nav and on the front page. */
export const LOCATION_TIERS: TierDef[] = [
  {
    tier: "capital",
    label: "Capitals",
    singular: "Capital",
    slug: "capitals",
    icon: "★",
    blurb: "The seats of the three empires.",
  },
  {
    tier: "city",
    label: "Major Cities",
    singular: "City",
    slug: "cities",
    icon: "🏛",
    blurb: "The great cities of Invicta, Hellenoria, and Acheaoria.",
  },
  {
    tier: "town",
    label: "Towns",
    singular: "Town",
    slug: "towns",
    icon: "⌂",
    blurb: "Smaller settlements under imperial rule.",
  },
  {
    tier: "village",
    label: "Villages",
    singular: "Village",
    slug: "villages",
    icon: "⛺",
    blurb: "Island, swamp, and Araucarian holdings on the margins.",
  },
  {
    tier: "district",
    label: "City Districts",
    singular: "District",
    slug: "districts",
    icon: "🧱",
    blurb: "Quarters and streets within the Duneforged Citadel.",
  },
  {
    tier: "site",
    label: "Sites",
    singular: "Site",
    slug: "sites",
    icon: "⌖",
    blurb: "Temples, halls, mines, and other places of note.",
  },
  {
    tier: "wild",
    label: "The Wilds",
    singular: "Wild",
    slug: "wilds",
    icon: "⛰",
    blurb: "Mountains, seas, plains, and everything between the walls.",
  },
];

export const TIER_BY_KEY: Record<LocationTier, TierDef> = Object.fromEntries(
  LOCATION_TIERS.map((t) => [t.tier, t]),
) as Record<LocationTier, TierDef>;

export const TIER_BY_SLUG: Record<string, TierDef> = Object.fromEntries(
  LOCATION_TIERS.map((t) => [t.slug, t]),
);

export function isLocationTier(v: string): v is LocationTier {
  return v in TIER_BY_KEY;
}

/**
 * Districts are checked before cities because "Middle City" and "Lower City"
 * are quarters of the Duneforged Citadel, not cities in their own right — a
 * plain `endsWith("City")` test would file them alongside Aeterna.
 */
const DISTRICT_TAGS = new Set([
  "Middle City",
  "Lower City",
  "Upper Streets",
  "Noble Districts",
]);

const WILD_TAGS = new Set([
  "Mountain Range",
  "Valley",
  "Seas",
  "Plains",
  "River",
  "Great Forest",
  "Great Desert",
  "Great Lake",
  "Swamp",
  "Araucaria Citadel Mountain",
  "South",
]);

const SITE_TAGS = new Set(["Library", "Temple"]);

/** Names that are Notion folder or index pages rather than real places. */
const INDEX_PAGE_NAMES = new Set([
  "location",
  "introduction",
  "the 3 empires",
  "the temples",
  "lower city streets",
  "middle city streets",
  "noble districts",
]);

export function isIndexPageName(name: string): boolean {
  return INDEX_PAGE_NAMES.has(name.trim().toLowerCase());
}

/**
 * Returns the tier for a location, or null when nothing in the tags or the
 * name says what kind of place it is.
 */
export function deriveLocationTier(
  tags: readonly string[],
  name = "",
): LocationTier | null {
  if (tags.includes("Capital")) return "capital";
  for (const t of tags) if (DISTRICT_TAGS.has(t)) return "district";
  for (const t of tags) {
    if (t.endsWith("City")) return "city";
    if (t.endsWith("Town")) return "town";
    if (t.endsWith("Village")) return "village";
  }
  for (const t of tags) if (WILD_TAGS.has(t)) return "wild";
  for (const t of tags) if (SITE_TAGS.has(t)) return "site";

  // Untagged pages: the empire folders name their cities plainly, and the
  // Citadel's interior pages are temples, forges, and halls.
  const n = name.trim().toLowerCase();
  if (isIndexPageName(n)) return null;
  if (/\bcity$/.test(n)) return "city";
  if (/\b(temple|shrine|sanctum|sanctuary|forge|vault|crucible|mines?|grounds|pass)\b/.test(n))
    return "site";
  return null;
}
