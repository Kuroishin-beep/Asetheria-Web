/**
 * Static checks for the original natural-world batches in
 * `data/natural-world/*.json`: shape, required fields per kind, provenance,
 * the content denylist, and the counts Phase 4 promised. Used by
 * `scripts/verify-natural-world.ts` and `tests/natural-world-data.spec.ts`.
 */
import fs from "node:fs";
import path from "node:path";
import { slugify } from "../../src/lib/links";

export const DATA_DIR = path.resolve(__dirname, "..", "..", "data", "natural-world");

export type NaturalEntry = {
  slug: string;
  kind: "ore" | "flora" | "fauna";
  name: string;
  summary: string;
  body: string;
  dmNotes: string;
  fields: Record<string, string>;
  tags: string[];
  visibility: string;
  sourcePath?: string | null;
};

export const TARGETS = { ore: 40, flora: 60, fauna: 60 } as const;

export const RARITIES = ["Common", "Uncommon", "Rare", "Legendary"] as const;
export const EMPIRE_TAGS = ["Hellenorian", "Acheaorian", "Invictian"] as const;

const REQUIRED_FIELDS: Record<NaturalEntry["kind"], string[]> = {
  ore: ["costPerLb", "ferrous", "foundIn", "biome", "rarity", "location", "properties", "uses", "lore"],
  flora: ["scientificName", "foundIn", "biome", "rarity", "effects", "lore"],
  fauna: ["scientificName", "foundIn", "biome", "rarity", "habitat", "diet", "behavior", "harvest", "effects", "lore"],
};

/**
 * Words that would mean third-party game material or a scraped source slipped
 * in (Q1: licence-safe sources only). The batches are original writing grounded
 * in public-domain facts.
 */
export const DENYLIST = [
  "wikidot",
  "reddit.com",
  "gmbinder",
  "gm binder",
  "dndbeyond",
  "d&d beyond",
  "forgotten realms",
  "faerun",
  "faerûn",
  "greyhawk",
  "eberron",
  "tome of beasts",
  "kobold press",
  "wizards of the coast",
  "open game licen",
];

export function loadAll(): { file: string; entries: NaturalEntry[] }[] {
  return fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => {
      const parsed = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8")) as {
        format?: string;
        entries: NaturalEntry[];
      };
      return { file, entries: parsed.entries };
    });
}

/** Every `[[Name]]` or `[[Name|label]]` target in a text. */
export function wikiTargets(text: string): string[] {
  return [...text.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)].map((m) => m[1].trim());
}

/** The comma-separated place names of a `foundIn` property, with any [[ ]] stripped. */
export function foundInNames(value: string): string[] {
  return value
    .split(",")
    .map((p) => p.replace(/^\s*\[\[|\]\]\s*$/g, "").split("|")[0].trim())
    .filter(Boolean);
}

export function check(): string[] {
  const problems: string[] = [];
  const all = loadAll();
  const flat = all.flatMap((f) => f.entries.map((e) => ({ ...e, file: f.file })));

  const counts = { ore: 0, flora: 0, fauna: 0 };
  const slugs = new Set<string>();
  const names = new Set<string>();

  for (const e of flat) {
    const where = `${e.file}: ${e.name ?? e.slug}`;
    if (!(e.kind in counts)) {
      problems.push(`${where}: kind "${e.kind}" is not ore, flora or fauna`);
      continue;
    }
    counts[e.kind]++;

    if (e.slug !== slugify(e.name)) problems.push(`${where}: slug "${e.slug}" should be "${slugify(e.name)}"`);
    if (slugs.has(e.slug)) problems.push(`${where}: duplicate slug "${e.slug}"`);
    slugs.add(e.slug);
    const nameKey = e.name.trim().toLowerCase();
    if (names.has(nameKey)) problems.push(`${where}: duplicate name`);
    names.add(nameKey);

    if (e.visibility !== "public") problems.push(`${where}: visibility must be public`);
    if (!e.summary || e.summary.length < 40 || e.summary.length > 300) problems.push(`${where}: summary should be 40 to 300 characters (is ${e.summary?.length ?? 0})`);
    if (!e.body || e.body.length < 450) problems.push(`${where}: body is too short (${e.body?.length ?? 0} characters)`);
    if (!/## Where it is found/.test(e.body) || !/## In play/.test(e.body)) problems.push(`${where}: body needs "Where it is found" and "In play" sections`);
    if (wikiTargets(e.body).length === 0) problems.push(`${where}: body links no place`);
    if (!e.dmNotes?.startsWith("Basis:") || e.dmNotes.length < 60) problems.push(`${where}: dmNotes must start with "Basis:" and say what it is grounded in`);
    if (!e.sourcePath?.startsWith("original:")) problems.push(`${where}: sourcePath must start with "original:"`);

    for (const key of REQUIRED_FIELDS[e.kind]) {
      if (!e.fields?.[key]?.trim()) problems.push(`${where}: missing field "${key}"`);
    }
    if (e.fields?.rarity && !RARITIES.includes(e.fields.rarity as (typeof RARITIES)[number])) {
      problems.push(`${where}: rarity "${e.fields.rarity}" is not one of ${RARITIES.join(", ")}`);
    }
    if (foundInNames(e.fields?.foundIn ?? "").length === 0) problems.push(`${where}: foundIn names no place`);

    const kindTag = e.kind === "ore" ? "Ore" : e.kind === "flora" ? "Flora" : "Fauna";
    if (e.tags?.[0] !== kindTag) problems.push(`${where}: first tag must be "${kindTag}"`);
    if (!e.tags?.some((t) => (EMPIRE_TAGS as readonly string[]).includes(t))) {
      problems.push(`${where}: needs one of the empire tags ${EMPIRE_TAGS.join(", ")}`);
    }

    const text = JSON.stringify(e).toLowerCase();
    for (const bad of DENYLIST) {
      if (text.includes(bad)) problems.push(`${where}: contains denylisted text "${bad}"`);
    }
  }

  for (const kind of ["ore", "flora", "fauna"] as const) {
    if (counts[kind] !== TARGETS[kind]) problems.push(`expected ${TARGETS[kind]} ${kind} entries, found ${counts[kind]}`);
  }
  return problems;
}
