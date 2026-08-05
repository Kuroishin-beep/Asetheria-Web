/**
 * Builds a description for an entry from the properties it already carries.
 *
 * The rule this file exists to enforce: **every clause must trace back to a
 * real field value.** Nothing here invents history, geography, motive, or
 * appearance. If an entry has no usable properties, `describeEntry` returns
 * null and the entry is left alone — a stub is better than a fabrication.
 *
 * Output is deterministic: the same entry always produces the same text, so
 * re-running the generator never churns the database.
 */

export type DescribableEntry = {
  slug: string;
  name: string;
  kind: string;
  tags: string[];
  fields: Record<string, string>;
  /** Export path — the only record of which branch a family member sits in. */
  sourcePath?: string | null;
};

// ---------------------------------------------------------------------------
// Deterministic variation
// ---------------------------------------------------------------------------

/** FNV-1a, so phrasing varies between entries but never between runs. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pick<T>(options: T[], seed: string): T {
  return options[hash(seed) % options.length];
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function splitList(value: string): string[] {
  return value
    .split(/,|\band\b/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** "Fire, Craft" -> "fire and craft"; "Earth, Sea, Sky" -> "earth, sea, and sky" */
function joinList(items: string[], lower = true): string {
  const list = lower ? items.map((i) => i.toLowerCase()) : items;
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")}, and ${list[list.length - 1]}`;
}

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

/**
 * Splits "Bacchus, The Bountiful Spirit" into base name and epithet.
 * A few names in the source carry a stray double comma ("Jupiter,, The
 * Stormlord"); trailing punctuation is trimmed so the prose reads cleanly
 * without altering the stored name.
 */
function splitEpithet(name: string): { base: string; epithet: string | null } {
  const m = name.match(/^(.+?)[,.]+\s+(.+)$/);
  if (!m) return { base: name.replace(/[,.\s]+$/, ""), epithet: null };
  const base = m[1].replace(/[,.\s]+$/, "").trim();
  const epithet = m[2].replace(/^[,.\s]+/, "").trim();
  if (!base || !epithet || base.length < 2) return { base: name, epithet: null };
  return { base, epithet };
}

/** "Invictian Organization" -> "the Imperium Invicta" */
const EMPIRE_OF: Record<string, string> = {
  invictian: "the Imperium Invicta",
  hellenorian: "Hellenoria",
  acheaorian: "Acheaoria",
  aetherian: "Asetheria",
  asetherian: "Asetheria",
  continental: "the Continent",
};

function empireFrom(value: string): string | null {
  const key = value.toLowerCase().split(/\s+/)[0];
  return EMPIRE_OF[key] ?? null;
}

// ---------------------------------------------------------------------------
// Deities
// ---------------------------------------------------------------------------

/** Restates an alignment as disposition. No new facts, just plainer language. */
const ALIGNMENT_PHRASE: Record<string, string[]> = {
  "lawful good": [
    "holds to law and mercy in equal measure",
    "is counted a power of order and of kindness",
  ],
  "neutral good": [
    "pursues good without regard for law or liberty",
    "is reckoned benevolent above all else",
  ],
  "chaotic good": [
    "sets liberty above order, and kindness above both",
    "is a power of good unbound by law",
  ],
  "lawful neutral": [
    "keeps to order for its own sake",
    "is a power of law, indifferent to mercy or cruelty",
  ],
  "true neutral": [
    "holds to balance above all",
    "takes no side, keeping the scales level",
  ],
  neutral: ["holds to balance above all", "takes no side in the great contests"],
  "chaotic neutral": [
    "answers to neither law nor settled allegiance",
    "is bound by no order and no cause but its own",
  ],
  "lawful evil": [
    "works cruelty through order and contract",
    "is a power of law turned to harm",
  ],
  "neutral evil": [
    "pursues harm without pretext of law or liberty",
    "is reckoned malevolent without qualification",
  ],
  "chaotic evil": [
    "is a power of ruin, bound by neither law nor mercy",
    "answers to nothing, and spares nothing",
  ],
};

/** Reads the rank out of a tag like "Invictian Lesser God". */
function deityRank(tags: string[], pantheon: string | undefined): string | null {
  const text = [...tags, pantheon ?? ""].join(" ").toLowerCase();
  if (/ancient titan/.test(text)) return "ancient titans";
  if (/\btitan/.test(text)) return "titans";
  if (/ascended/.test(text)) return "ascended";
  if (/greater god/.test(text)) return "greater gods";
  if (/lesser god/.test(text)) return "lesser gods";
  if (/outer god/.test(text)) return "outer gods";
  if (/dreaming god/.test(text)) return "dreaming gods";
  return null;
}

/** Strips the rank words to leave the culture: "Invictian Lesser God" -> "Invictian". */
function pantheonName(pantheon: string): string {
  return (
    pantheon
      .replace(/\b(greater|lesser|ancient|outer|dreaming)\b/gi, "")
      .replace(/\b(gods?|titans?|ascended|pantheon)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim() || pantheon
  );
}

function describeDeity(e: DescribableEntry): string | null {
  const { alignment, domains, race, pantheon } = e.fields;
  if (!alignment && !domains && !race) return null;

  const { base, epithet } = splitEpithet(e.name);
  const rank = deityRank(e.tags, pantheon);
  const culture = pantheon ? pantheonName(pantheon) : null;
  const sentences: string[] = [];

  // -- identity ------------------------------------------------------------
  const place = [
    rank ? `among the ${rank}` : null,
    culture ? `of the ${culture} pantheon` : null,
  ]
    .filter(Boolean)
    .join(" ");

  if (epithet && place) {
    sentences.push(
      pick(
        [
          `${base}, ${epithet}, stands ${place}.`,
          `Known as ${epithet}, ${base} is counted ${place}.`,
          `${base} bears the title ${epithet}, and is numbered ${place}.`,
        ],
        e.slug + "id",
      ),
    );
  } else if (epithet) {
    sentences.push(`${base} bears the title ${epithet}.`);
  } else if (place) {
    sentences.push(`${base} stands ${place}.`);
  } else {
    return null;
  }

  // -- domains -------------------------------------------------------------
  if (domains) {
    const list = joinList(splitList(domains));
    sentences.push(
      pick(
        [
          `Their dominion is ${list}.`,
          `${list.charAt(0).toUpperCase() + list.slice(1)} fall within their portfolio.`,
          `They hold sway over ${list}.`,
        ],
        e.slug + "dom",
      ),
    );
  }

  // -- alignment -----------------------------------------------------------
  if (alignment) {
    const key = alignment.trim().toLowerCase();
    const phrases = ALIGNMENT_PHRASE[key];
    if (phrases) {
      sentences.push(
        `${base} ${pick(phrases, e.slug + "al")} — ${alignment.toLowerCase()} in alignment.`,
      );
    } else {
      sentences.push(`${base} is ${alignment.toLowerCase()} in alignment.`);
    }
  }

  // -- race ----------------------------------------------------------------
  // Skipped when it merely repeats the rank ("Ancient Titan" of the titans).
  if (race && !(rank && rank.toLowerCase().includes(race.toLowerCase().split(" ")[0]))) {
    sentences.push(
      pick(
        [`${race} in form.`, `They take the form of ${article(race)} ${race.toLowerCase()}.`],
        e.slug + "rc",
      ),
    );
  }

  return sentences.join(" ");
}

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

const ALLEGIANCE_PHRASE: Record<string, string> = {
  "the virtuous": "It counts itself among the Virtuous.",
  "the occult": "It belongs to the Occult, and its workings are not conducted in the open.",
  "the impartial":
    "It stands with the Impartial, taking no side between virtue and shadow.",
};

function describeOrganization(e: DescribableEntry): string | null {
  const { type, subcategory, dedicatedTo, organization, category, location, currentGoal } =
    e.fields;
  if (!type && !subcategory && !dedicatedTo) return null;

  const sentences: string[] = [];
  const empire = organization ? empireFrom(organization) : null;

  // "Guild (Apothecaries)" -> "guild of apothecaries"
  let kind = type ? type.trim() : null;
  let parenthetical: string | null = null;
  if (kind) {
    const m = kind.match(/^(.+?)\s*\((.+)\)$/);
    if (m) {
      kind = m[1].trim();
      parenthetical = m[2].trim();
    }
  }

  const bare = e.name.replace(/^The\s+/i, "");

  // Some `type` values are proper noun-phrases ("Military Order") and read
  // naturally after an article. Others are bare labels ("Merchant", "Thieves")
  // that don't — those are quoted as a record rather than forced into a phrase.
  const READS_AS_NOUN =
    /(order|society|sociery|circle|guild|company|college|colleges|syndicate|coven|conclave|cult|pact|court|collective|band|house|clan|tribe|academy|lodge|school)s?$/i;

  if (kind && READS_AS_NOUN.test(kind)) {
    const kindLower = kind.toLowerCase();
    sentences.push(
      [
        `The ${bare} is ${article(kindLower)} ${kindLower}`,
        empire ? ` of ${empire}` : "",
        parenthetical ? `, drawn from its ${parenthetical.toLowerCase()}` : "",
        dedicatedTo ? `, dedicated to ${dedicatedTo}` : "",
        ".",
      ].join(""),
    );
  } else if (kind) {
    sentences.push(
      [
        `The ${bare} is an organization`,
        empire ? ` of ${empire}` : " of the Continent",
        dedicatedTo ? `, dedicated to ${dedicatedTo}` : "",
        `, recorded as ${kind}`,
        parenthetical ? ` (${parenthetical})` : "",
        ".",
      ].join(""),
    );
  } else if (dedicatedTo) {
    sentences.push(
      `The ${e.name.replace(/^The\s+/i, "")} is dedicated to ${dedicatedTo}${empire ? `, and counted among the orders of ${empire}` : ""}.`,
    );
  }

  if (subcategory) {
    const phrase = ALLEGIANCE_PHRASE[subcategory.trim().toLowerCase()];
    if (phrase) sentences.push(phrase);
  }

  if (location) sentences.push(`It is seated at ${location}.`);

  if (category) {
    const c = category.trim().toUpperCase();
    if (c === "UNKNOWN") {
      sentences.push("Its existence is not a matter of public record.");
    } else if (c === "KNOWN") {
      sentences.push("Its existence is openly acknowledged.");
    }
  }

  if (currentGoal) sentences.push(`Its present aim: ${currentGoal}`);

  return sentences.length ? sentences.join(" ") : null;
}

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

/**
 * Tag vocabulary from the Asetherian Database. Only tags listed here can
 * produce a description — an unrecognised tag means we don't actually know
 * what the place is, so nothing is written.
 */
const PLACE_TYPE: [RegExp, string][] = [
  [/underground town/i, "an underground town"],
  [/island village/i, "an island village"],
  [/swamp village/i, "a village of the swamps"],
  [/\bvillage\b/i, "a village"],
  [/neutral hub city/i, "a neutral hub city"],
  [/\bcity\b/i, "a city"],
  [/\btown\b/i, "a town"],
  [/mountain range/i, "a mountain range"],
  [/\bmountain\b/i, "a mountain"],
  [/great forest/i, "a great forest"],
  [/\bforest\b/i, "a forest"],
  [/great desert/i, "a great desert"],
  [/\bdesert\b/i, "a desert"],
  [/great lake/i, "a great lake"],
  [/\blake\b/i, "a lake"],
  [/\bseas?\b/i, "a sea"],
  [/\briver\b/i, "a river"],
  [/\bvalley\b/i, "a valley"],
  [/\bravine\b/i, "a ravine"],
  [/\bplains\b/i, "a stretch of plains"],
  [/\bsteppe\b/i, "a steppe"],
  [/\bswamp\b/i, "a swamp"],
  [/\bgrove\b/i, "a grove"],
  [/\bcitadel\b/i, "a citadel"],
  [/\btemple\b/i, "a temple"],
  [/\blibrary\b/i, "a library"],
  [/\breach\b/i, "a reach"],
  [/\bcanal\b/i, "a canal"],
  [/\batoll\b/i, "an atoll"],
  [/\bisle\b/i, "an isle"],
];

function describeLocation(e: DescribableEntry): string | null {
  const tagText = e.tags.join(" ");
  if (!tagText.trim()) return null;

  // "Middle City" / "Lower City" are districts, not cities — they must be
  // checked before the place-type table or they come out as settlements.
  const district = e.tags.find((t) => /middle city|lower city|upper street/i.test(t));
  if (district) {
    return `${e.name} lies within the ${district.toLowerCase().replace(/streets?$/, "streets")}.`;
  }

  const match = PLACE_TYPE.find(([re]) => re.test(tagText));
  if (!match) return null;
  const kind = match[1];

  const empire = e.tags.map(empireFrom).find(Boolean) ?? null;

  // A tag like "Araucaria Village" names a people or region the export never
  // gave its own column. Keep the qualifier rather than dropping it.
  let qualifier: string | null = null;
  if (!empire) {
    for (const t of e.tags) {
      const m = t.match(/^([A-Z][a-z]+)\s+\S/);
      if (m && !/^(great|island|swamp|neutral|mountain|upper|lower|middle)$/i.test(m[1])) {
        qualifier = m[1];
        break;
      }
    }
  }

  const belongs = empire
    ? ` of ${empire}`
    : qualifier
      ? ` of the ${qualifier}`
      : " of Asetheria";

  const isCapital = /\bcapital\b/i.test(tagText);
  if (isCapital && empire) {
    return `${e.name} is ${kind} of ${empire}, and serves as its capital.`;
  }

  const sentences = [`${e.name} is ${kind}${belongs}.`];
  if (isCapital) sentences.push("It serves as a capital.");

  return sentences.join(" ");
}

// ---------------------------------------------------------------------------
// Noble houses and their members
// ---------------------------------------------------------------------------

/**
 * Surname -> what the source records about that house. Only houses actually
 * described in the export appear here; a name that isn't listed produces no
 * description rather than a guess.
 */
const HOUSES: Record<string, { house: string; seat: string; note: string }> = {
  caesar: {
    house: "House Caerthain, known widely as the Caesars",
    seat: "the Duneforged Citadel and its mountain dominion",
    note: "The house is counted among the guardians of the south — stoic, austere, and held by some of the populace to be half-divine.",
  },
  caerthain: {
    house: "House Caerthain, known widely as the Caesars",
    seat: "the Duneforged Citadel and its mountain dominion",
    note: "The house is counted among the guardians of the south — stoic, austere, and held by some of the populace to be half-divine.",
  },
  merca: {
    house: "the Merca, Marquis of the Vaulted Court",
    seat: "the Vaulted Court, raised above and within the Mithril Reserve",
    note: "Merca standing rests on the ledger rather than the sword.",
  },
  vulkrim: {
    house: "the Vulkrim, Marquis of the Citadel",
    seat: "the Duneforged Citadel",
    note: "",
  },
};

const TITLE_RE =
  /^(Duke|Duchess|Lord|Lady|Prince|Princess|Emperor|Empress|Empress-Lady|Baron|Baroness|Count|Countess|Marquis|Marquess|Sir|Dame)\b/i;

function describeFamilyMember(e: DescribableEntry): string | null {
  // A house page rather than a person — those already carry prose.
  if (/\bfamily\b/i.test(e.name)) return null;

  const words = e.name.replace(/,.*$/, "").trim().split(/\s+/);
  const surname = words[words.length - 1]?.toLowerCase() ?? "";
  const house = HOUSES[surname];
  if (!house) return null;

  const titleMatch = e.name.match(TITLE_RE);
  const title = titleMatch ? titleMatch[1] : null;
  const isHeir = /\bheir\b/i.test(e.name);

  // The export filed each member under "The Head" or "Concubine".
  const path = e.sourcePath ?? "";
  const branch = /the head/i.test(path)
    ? "the direct line of the Head"
    : /concubine/i.test(path)
      ? "the concubine's line"
      : null;

  const sentences: string[] = [];
  const bare = e.name.replace(/,\s*The Heir$/i, "").trim();

  sentences.push(
    title
      ? `${bare} holds title within ${house.house}, the ruling dynasty of ${house.seat}.`
      : `${bare} is of ${house.house}, the ruling dynasty of ${house.seat}.`,
  );

  if (isHeir) sentences.push("Named heir to the house.");
  if (branch) sentences.push(`Recorded in ${branch}.`);
  if (house.note) sentences.push(house.note);

  return sentences.join(" ");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Returns a grounded description, or null when the entry has nothing to ground
 * one in. Callers must treat null as "leave this entry alone".
 */
export function describeEntry(e: DescribableEntry): string | null {
  switch (e.kind) {
    case "deity":
      return describeDeity(e);
    case "organization":
    case "faction":
      return describeOrganization(e);
    case "location":
    case "empire":
      return describeLocation(e);
    case "family":
      return describeFamilyMember(e);
    default:
      // Sessions, notes and the rest carry no descriptive properties — only
      // names and timestamps. Nothing to work from.
      return null;
  }
}

/** Marker stored on `entries.bodySource` for anything this file produced. */
export const GENERATED_MARKER = "generated";
