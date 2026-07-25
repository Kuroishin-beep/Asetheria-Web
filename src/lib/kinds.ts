import type { EntryKind } from "@/db/schema";

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
  icon: string;
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
    icon: "👑",
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
    icon: "📜",
    blurb: "Histories, myths, and the shape of the world.",
    fields: [{ key: "era", label: "Era" }],
  },
  {
    kind: "location",
    label: "Locations",
    singular: "Location",
    slug: "locations",
    icon: "⛰",
    blurb: "Cities, ruins, wilds, and the waters between them.",
    fields: [
      { key: "tier", label: "Tier", placeholder: "major or minor" },
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
    icon: "☀",
    blurb: "Gods, titans, and ascended powers of the Continent.",
    fields: [
      { key: "pantheon", label: "Pantheon", placeholder: "Invictian, Hellenorian, Titans…" },
      { key: "rank", label: "Rank", placeholder: "Greater God, Lesser God, Titan…" },
      { key: "alignment", label: "Alignment", placeholder: "Chaotic Good" },
      { key: "domains", label: "Domains", placeholder: "War, Trickery" },
      { key: "race", label: "Race", placeholder: "Aarakocra" },
      { key: "symbol", label: "Symbol" },
      { key: "classSubclass", label: "Class & Subclass" },
    ],
  },
  {
    kind: "pantheon",
    label: "Pantheons",
    singular: "Pantheon",
    slug: "pantheons",
    icon: "⛩",
    blurb: "The divine hierarchies worshipped across Asetheria.",
    fields: [{ key: "culture", label: "Culture" }],
  },
  {
    kind: "organization",
    label: "Organizations",
    singular: "Organization",
    slug: "organizations",
    icon: "⚜",
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
    icon: "⚔",
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
    icon: "☗",
    blurb: "Everyone the party has met — and everyone they haven't.",
    fields: [
      { key: "race", label: "Race" },
      { key: "gender", label: "Gender" },
      { key: "role", label: "Role / Title" },
      { key: "location", label: "Location" },
      { key: "factions", label: "Factions" },
      { key: "gods", label: "Worships" },
      { key: "attitude", label: "Attitude", placeholder: "Ally, Neutral, Hostile" },
      { key: "statblock", label: "Stat Block", type: "textarea" },
    ],
  },
  {
    kind: "family",
    label: "Families",
    singular: "Family",
    slug: "families",
    icon: "🛡",
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
    icon: "🐉",
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
    icon: "⚗",
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
    icon: "⛏",
    blurb: "What the smiths of the Continent work with.",
    fields: [
      { key: "location", label: "Found In" },
      { key: "properties", label: "Properties", type: "textarea" },
      { key: "uses", label: "Uses", type: "textarea" },
      { key: "lore", label: "Lore", type: "textarea" },
    ],
  },
  {
    kind: "flora",
    label: "Flora & Fauna",
    singular: "Specimen",
    slug: "flora-fauna",
    icon: "🌿",
    blurb: "Living things worth cataloguing.",
    fields: [
      { key: "scientificName", label: "Scientific Name" },
      { key: "effects", label: "Effects", type: "textarea" },
      { key: "lore", label: "Lore", type: "textarea" },
    ],
  },
  {
    kind: "quest",
    label: "Quests",
    singular: "Quest",
    slug: "quests",
    icon: "🗝",
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
    icon: "🕮",
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
    icon: "⚖",
    blurb: "Homebrew mechanics and table rulings.",
    fields: [{ key: "category", label: "Category" }],
  },
  {
    kind: "system",
    label: "Systems",
    singular: "System",
    slug: "systems",
    icon: "⚙",
    blurb: "Economy, politics, banking — how the world runs.",
    fields: [{ key: "category", label: "Category" }],
  },
  {
    kind: "note",
    label: "Notes",
    singular: "Note",
    slug: "notes",
    icon: "✎",
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

export function kindLabel(kind: EntryKind): string {
  return KIND_BY_KEY[kind]?.singular ?? kind;
}

export function kindIcon(kind: EntryKind): string {
  return KIND_BY_KEY[kind]?.icon ?? "✦";
}

export function kindSlug(kind: EntryKind): string {
  return KIND_BY_KEY[kind]?.slug ?? "notes";
}
