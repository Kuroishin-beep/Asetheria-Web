import type { EntryKind } from "@/db/schema";
import { LOCATION_TIERS, type LocationTier } from "@/lib/locations";

export type FieldDef = {
  key: string;
  label: string;
  /** `text` renders a single-line input, `textarea` a multi-line one. */
  type?: "text" | "textarea";
  placeholder?: string;
};

export type KindDef = {
  kind: EntryKind;
  /** Plural label used for section headings and nav. */
  label: string;
  /** Singular label used in buttons like "New Deity". */
  singular: string;
  /** URL segment, e.g. /codex/deities */
  slug: string;
  /** One-line description shown on the section header. */
  blurb: string;
  /** Structured properties offered in the editor for this kind. */
  fields: FieldDef[];
};

/**
 * The codex taxonomy. Field lists were derived from the original Notion
 * databases so imported entries land in real inputs rather than a blob.
 * Adding a kind here surfaces it everywhere: nav, browse, editor, search.
 */
export const KINDS: KindDef[] = [
  {
    kind: "empire",
    label: "Empires",
    singular: "Empire",
    slug: "empires",
    blurb: "The three great powers and the kingdoms that came before.",
    fields: [
      { key: "capital", label: "Capital" },
      { key: "ruler", label: "Ruler" },
      { key: "motto", label: "Motto" },
      { key: "status", label: "Status", placeholder: "Standing / Fallen" },
    ],
  },
  {
    kind: "lore",
    label: "Lore",
    singular: "Lore Page",
    slug: "lore",
    blurb: "Histories, myths, and the shape of the world.",
    fields: [{ key: "era", label: "Era" }],
  },
  {
    kind: "location",
    label: "Locations",
    singular: "Location",
    slug: "locations",
    blurb: "Cities, ruins, wilds, and the waters between them.",
    fields: [
      {
        key: "tier",
        label: "Tier",
        placeholder: "capital, city, town, village, district, site, wild",
      },
      { key: "type", label: "Type", placeholder: "City, Valley, Mountain Range…" },
      { key: "region", label: "Region" },
      { key: "ruler", label: "Ruler" },
      { key: "population", label: "Population" },
    ],
  },
  {
    kind: "deity",
    label: "Deities",
    singular: "Deity",
    slug: "deities",
    blurb: "Gods, titans, and ascended powers of the Continent.",
    fields: [
      { key: "pantheon", label: "Pantheon", placeholder: "Invictian, Hellenorian, Titans…" },
      { key: "rank", label: "Rank", placeholder: "Greater God, Lesser God, Titan…" },
      { key: "alignment", label: "Alignment", placeholder: "Chaotic Good" },
      { key: "domains", label: "Domains", placeholder: "War, Trickery" },
      { key: "race", label: "Race", placeholder: "Aarakocra" },
      { key: "symbol", label: "Symbol" },
      { key: "classSubclass", label: "Class & Subclass" },
      { key: "portrait", label: "Portrait", placeholder: "/portraits/name.png or an https:// address" },
    ],
  },
  {
    kind: "pantheon",
    label: "Pantheons",
    singular: "Pantheon",
    slug: "pantheons",
    blurb: "The divine hierarchies worshipped across Asetheria.",
    fields: [{ key: "culture", label: "Culture" }],
  },
  {
    kind: "organization",
    label: "Organizations",
    singular: "Organization",
    slug: "organizations",
    blurb: "Guilds, orders, syndicates, and secret societies.",
    fields: [
      { key: "type", label: "Type", placeholder: "Secret Society, Guild, Military Order…" },
      { key: "subcategory", label: "Allegiance", placeholder: "The Occult, The Virtuous, The Impartial" },
      { key: "organization", label: "Sphere", placeholder: "Invictian Organization" },
      { key: "dedicatedTo", label: "Dedicated To", placeholder: "Patron deity" },
      { key: "location", label: "Location" },
      { key: "category", label: "Category", placeholder: "KNOWN / UNKNOWN" },
      { key: "state", label: "State" },
      { key: "currentGoal", label: "Current Goal", type: "textarea" },
    ],
  },
  {
    kind: "faction",
    label: "Factions",
    singular: "Faction",
    slug: "factions",
    blurb: "The great continental alignments and the powers behind them.",
    fields: [
      { key: "alignment", label: "Alignment" },
      { key: "location", label: "Seat of Power" },
      { key: "currentGoal", label: "Current Goal", type: "textarea" },
    ],
  },
  {
    kind: "npc",
    label: "NPCs",
    singular: "NPC",
    slug: "npcs",
    blurb: "Everyone the party has met — and everyone they haven't.",
    fields: [
      { key: "race", label: "Race" },
      { key: "gender", label: "Gender" },
      { key: "role", label: "Role / Title" },
      { key: "location", label: "Location" },
      { key: "factions", label: "Factions" },
      { key: "gods", label: "Worships" },
      { key: "attitude", label: "Attitude", placeholder: "Ally, Neutral, Hostile" },
      { key: "portrait", label: "Portrait", placeholder: "/portraits/name.png or an https:// address" },
      { key: "statblock", label: "Stat Block", type: "textarea" },
    ],
  },
  {
    kind: "family",
    label: "Families",
    singular: "Family",
    slug: "families",
    blurb: "Noble houses, their crests, and their ambitions.",
    fields: [
      { key: "familyCrest", label: "Family Crest" },
      { key: "familyMotto", label: "Family Motto" },
      { key: "title", label: "Title" },
      { key: "seat", label: "Seat" },
    ],
  },
  {
    kind: "creature",
    label: "Bestiary",
    singular: "Creature",
    slug: "bestiary",
    blurb: "Beasts, horrors, and the things that hunt in the dark.",
    fields: [
      { key: "cr", label: "Challenge Rating" },
      { key: "type", label: "Type" },
      { key: "habitat", label: "Habitat" },
      { key: "statblock", label: "Stat Block", type: "textarea" },
    ],
  },
  {
    kind: "item",
    label: "Items",
    singular: "Item",
    slug: "items",
    blurb: "Homebrew gear, relics, and curiosities.",
    fields: [
      { key: "type", label: "Type" },
      { key: "rarity", label: "Rarity" },
      { key: "price", label: "Price" },
      { key: "attunement", label: "Attunement" },
      { key: "properties", label: "Properties", type: "textarea" },
    ],
  },
  {
    kind: "ore",
    label: "Ores & Materials",
    singular: "Ore",
    slug: "ores",
    blurb: "What the smiths of the Continent work with.",
    fields: [
      { key: "costPerLb", label: "Cost per lb.", placeholder: "5,000 gp" },
      { key: "ferrous", label: "Ferrous?", placeholder: "Ferrous / Non-ferrous" },
      { key: "armorClass", label: "Armor Class", placeholder: "23" },
      { key: "location", label: "Found In (notes)" },
      { key: "foundIn", label: "Found in", placeholder: "Place names, comma separated (they link to those pages)" },
      { key: "biome", label: "Biome", placeholder: "Coast, desert, mountain, forest…" },
      { key: "rarity", label: "Rarity", placeholder: "Common, uncommon, rare, legendary" },
      { key: "properties", label: "Properties", type: "textarea" },
      { key: "uses", label: "Uses", type: "textarea" },
      { key: "lore", label: "Lore", type: "textarea" },
    ],
  },
  {
    kind: "flora",
    label: "Flora",
    singular: "Plant",
    slug: "flora",
    blurb: "Plants, fungi, and herbs worth cataloguing.",
    fields: [
      { key: "scientificName", label: "Scientific Name" },
      { key: "foundIn", label: "Found in", placeholder: "Place names, comma separated (they link to those pages)" },
      { key: "biome", label: "Biome", placeholder: "Coast, desert, mountain, forest…" },
      { key: "rarity", label: "Rarity", placeholder: "Common, uncommon, rare, legendary" },
      { key: "effects", label: "Effects", type: "textarea" },
      { key: "lore", label: "Lore", type: "textarea" },
    ],
  },
  {
    kind: "fauna",
    label: "Fauna",
    singular: "Animal",
    slug: "fauna",
    blurb: "Wildlife and ecology: the animals of the Continent, away from the stat block.",
    fields: [
      { key: "scientificName", label: "Scientific Name" },
      { key: "foundIn", label: "Found in", placeholder: "Place names, comma separated (they link to those pages)" },
      { key: "biome", label: "Biome", placeholder: "Coast, desert, mountain, forest…" },
      { key: "rarity", label: "Rarity", placeholder: "Common, uncommon, rare, legendary" },
      { key: "habitat", label: "Habitat", placeholder: "Where it lives and what it needs" },
      { key: "diet", label: "Diet" },
      { key: "behavior", label: "Behavior", type: "textarea" },
      { key: "harvest", label: "Harvest", type: "textarea" },
      { key: "effects", label: "Effects", type: "textarea" },
      { key: "lore", label: "Lore", type: "textarea" },
    ],
  },
  {
    kind: "quest",
    label: "Quests",
    singular: "Quest",
    slug: "quests",
    blurb: "Hooks, arcs, and unfinished business.",
    fields: [
      { key: "status", label: "Status", placeholder: "Available, Active, Complete" },
      { key: "questGiver", label: "Quest Giver" },
      { key: "reward", label: "Reward" },
      { key: "location", label: "Location" },
    ],
  },
  {
    kind: "session",
    label: "Session Logs",
    singular: "Session",
    slug: "sessions",
    blurb: "What actually happened at the table.",
    fields: [
      { key: "inGameDate", label: "In-Game Date" },
      { key: "playDate", label: "Play Date" },
      { key: "sessionNumber", label: "Session #" },
    ],
  },
  {
    kind: "rule",
    label: "House Rules",
    singular: "Rule",
    slug: "rules",
    blurb: "Homebrew mechanics and table rulings.",
    fields: [{ key: "category", label: "Category" }],
  },
  {
    kind: "system",
    label: "Systems",
    singular: "System",
    slug: "systems",
    blurb: "Economy, politics, banking — how the world runs.",
    fields: [{ key: "category", label: "Category" }],
  },
  {
    kind: "table",
    label: "Random Tables",
    singular: "Table",
    slug: "tables",
    blurb: "Roll for names, loot, weather, rumours, forage: whatever you need mid-session.",
    fields: [{ key: "dice", label: "Dice", placeholder: "1d20" }],
  },
  {
    kind: "note",
    label: "Notes",
    singular: "Note",
    slug: "notes",
    blurb: "Everything that doesn't fit anywhere else — yet.",
    fields: [],
  },
];

/**
 * The three standing powers, in the order the front page leads with them. The
 * other three `empire` entries are the kingdoms that came before.
 */
export const STANDING_EMPIRE_SLUGS = [
  "imperium-invicta",
  "hellenoria",
  "acheaoria",
] as const;

export const KIND_BY_KEY: Record<EntryKind, KindDef> = Object.fromEntries(
  KINDS.map((k) => [k.kind, k]),
) as Record<EntryKind, KindDef>;

export const KIND_BY_SLUG: Record<string, KindDef> = Object.fromEntries(
  KINDS.map((k) => [k.slug, k]),
);

/**
 * Section addresses that used to exist and now live elsewhere. "Flora & Fauna"
 * became two sections when `fauna` split off from `flora`.
 */
export const LEGACY_SECTION_SLUGS: Record<string, string> = {
  "flora-fauna": "flora",
};

export function kindLabel(kind: EntryKind): string {
  return KIND_BY_KEY[kind]?.singular ?? kind;
}

export function kindSlug(kind: EntryKind): string {
  return KIND_BY_KEY[kind]?.slug ?? "notes";
}

/**
 * The listing an entry of this kind lives under. Locations have no flat
 * section (they split into tiers), so they go to their tier's section, or
 * home when the tier is unknown.
 */
export function sectionPath(kind: EntryKind, tier?: string | null): string {
  if (kind !== "location") return `/codex/${kindSlug(kind)}`;
  const def = LOCATION_TIERS.find((t) => t.tier === tier);
  return def ? `/codex/${def.slug}` : "/";
}

/** Every listing path that can show an entry of this kind, for revalidation. */
export function sectionPaths(kind: EntryKind): string[] {
  if (kind !== "location") return [`/codex/${kindSlug(kind)}`];
  return LOCATION_TIERS.map((t) => `/codex/${t.slug}`);
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

/**
 * A section is what the reader sees as a tab: nav item, browse tile, and a
 * `/codex/<slug>` listing.
 *
 * Sections are mostly one per kind, but "Locations" would otherwise pile
 * capitals, cities, towns, villages, city districts and open wilderness into a
 * single list of 106. Locations therefore expand into one section per tier,
 * and the flat Locations tab is dropped rather than duplicating all of them.
 */
export type SectionDef = {
  slug: string;
  label: string;
  singular: string;
  blurb: string;
  kind: EntryKind;
  /** Present only on the location tier sections. */
  tier?: LocationTier;
};

export const SECTIONS: SectionDef[] = KINDS.flatMap((k): SectionDef[] => {
  if (k.kind !== "location") {
    return [
      {
        slug: k.slug,
        label: k.label,
        singular: k.singular,
        blurb: k.blurb,
        kind: k.kind,
      },
    ];
  }
  return LOCATION_TIERS.map((t) => ({
    slug: t.slug,
    label: t.label,
    singular: t.singular,
    blurb: t.blurb,
    kind: "location" as const,
    tier: t.tier,
  }));
});

export const SECTION_BY_SLUG: Record<string, SectionDef> = Object.fromEntries(
  SECTIONS.map((s) => [s.slug, s]),
);
