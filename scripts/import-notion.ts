/**
 * Converts the raw Notion export in `data/notion-export/` into a single
 * `data/world-seed.json` that `npm run db:seed` loads into Postgres.
 *
 * Design rule: this importer never drops content. A markdown page or CSV row is
 * skipped only when it has no usable name AND no body AND no populated fields —
 * i.e. it is genuinely empty. Anything else is imported, falling back to the
 * `note` kind rather than being discarded.
 *
 * Run with:  npm run import:notion
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");
const EXPORT_ROOT = path.join(
  REPO,
  "data",
  "notion-export",
  "The Continent of Asetheria",
);
const OUT_FILE = path.join(REPO, "data", "world-seed.json");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Kind =
  | "deity" | "pantheon" | "organization" | "faction" | "location" | "empire"
  | "npc" | "family" | "creature" | "item" | "ore" | "flora" | "lore"
  | "quest" | "session" | "rule" | "system" | "note";

type SeedEntry = {
  slug: string;
  kind: Kind;
  name: string;
  summary: string;
  body: string;
  dmNotes: string;
  fields: Record<string, string>;
  tags: string[];
  visibility: "public" | "secret";
  sourcePath: string | null;
  parentSlug: string | null;
};

// ---------------------------------------------------------------------------
// Notion filename helpers
// ---------------------------------------------------------------------------

/** Notion appends a 32-char hex id (sometimes shortened) to every file/folder. */
const NOTION_ID = /\s+[0-9a-f]{8,32}(?:-[0-9a-f]{4})?$/i;

function stripNotionId(name: string): string {
  return name.replace(/\.md$|\.csv$/i, "").replace(NOTION_ID, "").trim();
}

/**
 * The zip stored non-ASCII filenames in a legacy codepage, so directory names
 * arrive mojibake'd (e.g. "The DukeÔÇÖs Family"). Page *content* is clean UTF-8,
 * so this only ever touches paths used for classification and parent lookup.
 */
function demojibake(s: string): string {
  return s
    .replace(/ÔÇÖ|â€™|���/g, "’")
    .replace(/ÔÇÿ|â€˜/g, "‘")
    .replace(/ÔÇ£|â€œ/g, "“")
    .replace(/ÔÇ|â€/g, "”")
    .replace(/ÔÇô|â€“/g, "–")
    .replace(/ÔÇö|â€”/g, "—");
}

function slugify(input: string): string {
  const s = demojibake(input)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['‘’]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "entry";
}

function normalizeName(s: string): string {
  return demojibake(s)
    .toLowerCase()
    .replace(/['‘’.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Kind classification
// ---------------------------------------------------------------------------

/** Evaluated in order; first match wins, so put specific paths before general. */
const KIND_RULES: [RegExp, Kind][] = [
  [/Pantheons[\\/].*(Gods|Titans|Ascended)[\\/]/i, "deity"],
  [/Godatabase/i, "deity"],
  [/Pantheons/i, "pantheon"],
  [/Homebrew Items[\\/]Ores/i, "ore"],
  [/Homebrew Items[\\/]Flora and Fauna/i, "flora"],
  [/Homebrew Items/i, "item"],
  [/Organizations/i, "organization"],
  [/Factions/i, "faction"],
  [/Notables? NPCs/i, "npc"],
  [/Families/i, "family"],
  [/Military/i, "organization"],
  [/Session Logs/i, "session"],
  [/Homebrews and House Rules/i, "rule"],
  [/Systems/i, "system"],
  [/Bestiary|Monsters/i, "creature"],
  [/Adventures|Quests|A Time God/i, "quest"],
  // A page nested *inside* a fallen kingdom's folder is lore about it, not the
  // kingdom itself; the kingdom pages sit one level up. The `Untitled` segment
  // is required here — making it optional lets it stand in for the kingdom
  // folder and swallows the kingdom pages themselves.
  [/Old Empires[\\/]Untitled[\\/][^\\/]+[\\/]/i, "lore"],
  [/Old Empires/i, "empire"],
  // Almost everything filed under "The 3 Empires" is a city, district, or site.
  // The three empires themselves are caught by their `Empire` tag above.
  [/The (3 )?Empires/i, "location"],
  [/Asetherian Database|[\\/]Location/i, "location"],
  [/Lore|Phenomenon/i, "lore"],
  [/Important Details/i, "lore"],
  [/Tools/i, "note"],
];

/** Sub-page titles that mean nothing without their parent for context. */
const GENERIC_NAME =
  /^(notable|notables|triggers?|the truth|truth|overview|description|summary|details?|info|background|history|general|misc|other|games?|loots?|books?|quests?|military|banks?)$/i;

const PLACE_TAG =
  /\bcity\b|\btown\b|village|mountain|forest|valley|plains|river|seas|lake|desert|swamp|island|ravine|citadel|temple|library|steppe|grove|reach|capital|hub/;

function classify(relPath: string, tags: string[], fields: Record<string, string>): Kind {
  const p = demojibake(relPath);

  // Tags are the most reliable signal — a page's own label beats its folder.
  const tagText = tags.join(" ").toLowerCase();
  if (/\bempire\b/.test(tagText)) return "empire";
  if (/\bgod\b|titan|ascended|deity/.test(tagText)) return "deity";
  if (PLACE_TAG.test(tagText)) return "location";
  if (/cult|order|guild|society|syndicate/.test(tagText)) return "organization";

  for (const [re, kind] of KIND_RULES) if (re.test(p)) return kind;

  // A page carrying divine properties is a deity wherever it happens to live.
  if (fields.alignment && fields.domains) return "deity";
  return "note";
}

/** Pages the DM should see but players should not. */
function isSecretPath(relPath: string, fields: Record<string, string>, tags: string[]): boolean {
  const p = demojibake(relPath);
  if (/The Truth|Forbidden Zone|Secret|Hidden/i.test(p)) return true;
  if ((fields.category ?? "").toUpperCase() === "UNKNOWN") return true;
  if (tags.some((t) => /^(secret|unknown|dm only)$/i.test(t))) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Property-name mapping (Notion label -> our field key)
// ---------------------------------------------------------------------------

const FIELD_MAP: Record<string, string> = {
  alignment: "alignment", domains: "domains", race: "race", symbol: "symbol",
  "class & subclass": "classSubclass", property: "rank",
  "dedicated to": "dedicatedTo", organization: "organization",
  subcategory: "subcategory", type: "type", category: "category",
  state: "state", visibility: "visibilityNote", "current goal": "currentGoal",
  location: "location", description: "description", lore: "lore",
  properties: "properties", uses: "uses", effects: "effects",
  "scientific name": "scientificName", price: "price", motto: "motto",
  title: "title", "family crest": "familyCrest", "family motto": "familyMotto",
  gender: "gender", factions: "factions", gods: "gods", bio: "bio",
  "in-game date": "inGameDate", "play date": "playDate", event: "event",
  photo: "photo", created: "createdNote", date: "date", spacer: "_skip",
};

function mapFieldKey(label: string): string | null {
  const key = FIELD_MAP[label.trim().toLowerCase()];
  if (key === "_skip") return null;
  return key ?? label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

/**
 * Notion writes relation/rollup properties as `Title (relative/url/path.md)` or
 * `Title (https://notion.so/...)`. Keep the human-readable title, drop the link.
 */
function cleanValue(raw: string): string {
  let v = raw.trim();
  v = v.replace(/\s*\((?:https?:\/\/|[^)]*\.md)[^)]*\)/g, "");
  v = v.replace(/%20/g, " ").replace(/\s{2,}/g, " ").trim();
  return v.replace(/,\s*$/, "").trim();
}

function splitTags(raw: string): string[] {
  return cleanValue(raw)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Markdown parsing
// ---------------------------------------------------------------------------

type ParsedMd = {
  title: string;
  fields: Record<string, string>;
  tags: string[];
  body: string;
};

function parseMarkdown(text: string): ParsedMd {
  // Strip BOM and normalise newlines.
  const lines = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");

  let i = 0;
  let title = "";
  if (lines[0]?.startsWith("# ")) {
    title = lines[0].slice(2).trim();
    i = 1;
  }

  const fields: Record<string, string> = {};
  let tags: string[] = [];

  // Notion emits `Key: value` property lines immediately after the H1.
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") {
      // Allow a single blank line inside the property block.
      const next = lines[i + 1] ?? "";
      if (/^[A-Z][A-Za-z0-9 &'\/-]{0,40}:\s/.test(next)) continue;
      i++;
      break;
    }
    const m = line.match(/^([A-Z][A-Za-z0-9 &'\/-]{0,40}):\s*(.*)$/);
    if (!m) break;
    const [, label, rawValue] = m;
    if (/^tags$/i.test(label)) {
      tags = splitTags(rawValue);
      continue;
    }
    const key = mapFieldKey(label);
    if (!key) continue;
    const value = cleanValue(rawValue);
    if (value) fields[key] = value;
  }

  const body = lines.slice(i).join("\n").trim();
  return { title, fields, tags, body };
}

/** First meaningful prose line, used as the list/search snippet. */
function deriveSummary(body: string, fields: Record<string, string>): string {
  if (fields.description) return fields.description.slice(0, 300);
  const line = body
    .split("\n")
    .map((l) => l.trim())
    .find(
      (l) =>
        l.length > 0 &&
        !l.startsWith("#") &&
        !l.startsWith("---") &&
        !l.startsWith("|") &&
        !l.startsWith("![") &&
        !/^\*[^*]+\*$/.test(l),
    );
  if (!line) return "";
  const plain = line
    .replace(/[*_`>]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .trim();
  return plain.length > 300 ? plain.slice(0, 297).trimEnd() + "…" : plain;
}

// ---------------------------------------------------------------------------
// CSV parsing (RFC 4180)
// ---------------------------------------------------------------------------

function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ",") { row.push(field); field = ""; continue; }
    if (c === "\r") continue;
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ---------------------------------------------------------------------------
// Walk the export
// ---------------------------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  if (!fs.existsSync(EXPORT_ROOT)) {
    console.error(`Notion export not found at:\n  ${EXPORT_ROOT}`);
    process.exit(1);
  }

  const allFiles = walk(EXPORT_ROOT);
  const mdFiles = allFiles.filter((f) => f.toLowerCase().endsWith(".md"));
  const csvFiles = allFiles.filter((f) => f.toLowerCase().endsWith("_all.csv"));

  const entries: SeedEntry[] = [];
  const usedSlugs = new Set<string>();
  /** relative md path (no extension) -> slug, for resolving parents. */
  const pathToSlug = new Map<string, string>();
  /** normalized name -> entries sharing it, for CSV merging. */
  const byName = new Map<string, SeedEntry[]>();

  const stats = {
    md: 0, mdMerged: 0, mdSkipped: 0,
    csvMerged: 0, csvCreated: 0, csvSkipped: 0,
  };

  function uniqueSlug(base: string): string {
    let slug = base;
    let n = 2;
    while (usedSlugs.has(slug)) slug = `${base}-${n++}`;
    usedSlugs.add(slug);
    return slug;
  }

  function indexName(e: SeedEntry) {
    const key = normalizeName(e.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(e);
  }

  /**
   * A page is worth importing if it says anything at all. Bookkeeping-only
   * properties (a "Photo: Yes" flag, a Notion timestamp) don't count.
   */
  function hasSubstance(
    body: string,
    fields: Record<string, string>,
    tags: string[],
  ): boolean {
    if (body.trim().length > 0) return true;
    if (tags.length > 0) return true;
    const noise = new Set(["photo", "createdNote", "date", "_skip"]);
    return Object.entries(fields).some(([k, v]) => v && !noise.has(k));
  }

  /**
   * Finds an already-imported entry that this page is a duplicate of.
   * Only same-kind, same-name pages qualify, and only when merging cannot lose
   * prose: if both sides have substantial and *different* bodies they are
   * treated as genuinely separate pages and both are kept.
   */
  function findMergeTarget(kind: Kind, name: string, body: string): SeedEntry | null {
    const candidates = byName.get(normalizeName(name)) ?? [];
    for (const c of candidates) {
      if (c.kind !== kind) continue;
      const a = c.body.trim();
      const b = body.trim();
      if (a && b && a !== b) continue; // distinct prose — keep both
      return c;
    }
    return null;
  }

  /** Union-merge: never overwrites existing content, only fills gaps. */
  function mergeInto(
    target: SeedEntry,
    src: { fields: Record<string, string>; tags: string[]; body: string; secret: boolean },
  ) {
    for (const [k, v] of Object.entries(src.fields)) {
      if (v && !target.fields[k]) target.fields[k] = v;
    }
    for (const t of src.tags) if (!target.tags.includes(t)) target.tags.push(t);
    if (!target.body.trim() && src.body.trim()) {
      target.body = src.body;
      target.summary = target.summary || deriveSummary(src.body, target.fields);
    }
    if (src.secret) target.visibility = "secret";
  }

  // -- Phase 1: markdown pages ----------------------------------------------
  for (const file of mdFiles) {
    const rel = path.relative(EXPORT_ROOT, file);
    const raw = fs.readFileSync(file, "utf8");
    const { title, fields, tags, body } = parseMarkdown(raw);

    const rawTitle = demojibake(title).trim();
    const untitled = !rawTitle || /^untitled$/i.test(rawTitle);

    // A Notion database with empty rows exports one placeholder page per row.
    // Those carry no title, no prose, and at most a bookkeeping property — they
    // are the "blank ones" and the only thing this importer discards.
    if (untitled && !hasSubstance(body, fields, tags)) {
      stats.mdSkipped++;
      continue;
    }

    // Untitled-but-populated pages borrow a name from their file or folder.
    const folderName = demojibake(stripNotionId(path.basename(path.dirname(file))));
    let name = rawTitle;
    if (untitled) {
      const fromFile = demojibake(stripNotionId(path.basename(file)));
      name = /^untitled$/i.test(fromFile) || !fromFile ? folderName : fromFile;
    }
    if (!name) name = "Untitled";

    // Notion sub-pages are routinely called "Notable" or "Triggers". On their
    // own those are useless in a global search, so qualify them with the page
    // they hang off — "Mycairos — Triggers".
    if (GENERIC_NAME.test(name) && folderName && !/^untitled$/i.test(folderName)) {
      name = `${folderName} — ${name}`;
    }

    const kind = classify(rel, tags, fields);
    const relNoExt = demojibake(
      path.join(path.dirname(rel), stripNotionId(path.basename(file))),
    );

    // Notion roll-up databases re-export every row they aggregate, so the same
    // god exists both in its pantheon folder and in the Godatabase. Fold those
    // together rather than importing the world twice.
    const existing = findMergeTarget(kind, name, body);
    if (existing) {
      mergeInto(existing, { fields, tags, body, secret: isSecretPath(rel, fields, tags) });
      pathToSlug.set(relNoExt, existing.slug);
      stats.mdMerged++;
      continue;
    }

    const slug = uniqueSlug(slugify(name));
    pathToSlug.set(relNoExt, slug);

    const entry: SeedEntry = {
      slug,
      kind,
      name,
      summary: deriveSummary(body, fields),
      body,
      dmNotes: "",
      fields,
      tags,
      visibility: isSecretPath(rel, fields, tags) ? "secret" : "public",
      sourcePath: rel.replace(/\\/g, "/"),
      parentSlug: null,
    };
    entries.push(entry);
    indexName(entry);
    stats.md++;
  }

  // -- Phase 2: parent links from folder nesting -----------------------------
  // In a Notion export, a page with children sits beside a folder of the same
  // name, so a file's parent is the page that owns its directory.
  for (const entry of entries) {
    if (!entry.sourcePath) continue;
    const rel = demojibake(entry.sourcePath.replace(/\//g, path.sep));
    const dir = path.dirname(rel);
    if (dir === "." || dir === "") continue;
    const parentKey = demojibake(
      path.join(path.dirname(dir), stripNotionId(path.basename(dir))),
    );
    const parentSlug = pathToSlug.get(parentKey);
    if (parentSlug && parentSlug !== entry.slug) entry.parentSlug = parentSlug;
  }

  // -- Phase 3: CSV databases -------------------------------------------------
  // Rows usually correspond to a markdown page already imported; merge their
  // columns in. Rows with no page become entries of their own so nothing is lost.
  for (const file of csvFiles) {
    const rel = path.relative(EXPORT_ROOT, file);
    const rows = parseCsv(fs.readFileSync(file, "utf8"));
    if (rows.length < 2) continue;

    const header = rows[0].map((h) => h.trim());
    const dbName = demojibake(
      stripNotionId(path.basename(file, ".csv").replace(/_all$/, "")),
    );

    for (const row of rows.slice(1)) {
      const rec: Record<string, string> = {};
      header.forEach((h, idx) => { rec[h] = (row[idx] ?? "").trim(); });

      // "Name" for most databases, "Event" for the session log.
      const rawName = rec["Name"] || rec["Event"] || "";
      const name = demojibake(cleanValue(rawName));

      const csvFields: Record<string, string> = {};
      let tags: string[] = [];
      for (const [label, rawValue] of Object.entries(rec)) {
        if (/^name$/i.test(label)) continue;
        if (!rawValue) continue;
        if (/^tags$/i.test(label)) { tags = splitTags(rawValue); continue; }
        const key = mapFieldKey(label);
        if (!key) continue;
        const value = cleanValue(rawValue);
        if (value) csvFields[key] = value;
      }

      // Blank row: no name and nothing but bookkeeping columns.
      if (!name && !hasSubstance("", csvFields, tags)) {
        stats.csvSkipped++;
        continue;
      }

      const matches = name ? (byName.get(normalizeName(name)) ?? []) : [];
      if (matches.length) {
        // Merge into the existing page without overwriting anything it already has.
        const target = matches[0];
        for (const [k, v] of Object.entries(csvFields)) {
          if (!target.fields[k]) target.fields[k] = v;
        }
        for (const t of tags) if (!target.tags.includes(t)) target.tags.push(t);
        if (!target.summary && csvFields.description) {
          target.summary = csvFields.description.slice(0, 300);
        }
        if (isSecretPath(rel, csvFields, tags)) target.visibility = "secret";
        stats.csvMerged++;
        continue;
      }

      const kind = classify(rel, tags, csvFields);
      const displayName = name || `${dbName} entry`;
      const entry: SeedEntry = {
        slug: uniqueSlug(slugify(displayName)),
        kind,
        name: displayName,
        summary: csvFields.description?.slice(0, 300) ?? "",
        body: "",
        dmNotes: "",
        fields: csvFields,
        tags,
        visibility: isSecretPath(rel, csvFields, tags) ? "secret" : "public",
        sourcePath: rel.replace(/\\/g, "/"),
        parentSlug: null,
      };
      entries.push(entry);
      indexName(entry);
      stats.csvCreated++;
    }
  }

  // -- Phase 4: tidy fields ---------------------------------------------------
  for (const e of entries) {
    // The Godatabase roll-up carries a "Gods" relation pointing back at the
    // very page it describes. Displaying "Gods: Bacchus" on Bacchus is noise.
    if (e.fields.gods && normalizeName(e.fields.gods) === normalizeName(e.name)) {
      delete e.fields.gods;
    }
  }

  // -- Phase 5: derive pantheon for deities from their folder ----------------
  for (const e of entries) {
    if (e.kind !== "deity" || e.fields.pantheon) continue;
    const m = demojibake(e.sourcePath ?? "").match(
      /Pantheons[\\/](?:Untitled[\\/])?([^\\/]+)[\\/]/i,
    );
    if (m) e.fields.pantheon = stripNotionId(m[1]);
    else if (e.tags.length) {
      const t = e.tags.find((x) => /Invictian|Hellenorian|Acheaorian|Titan|Ascended|Outer/i.test(x));
      if (t) e.fields.pantheon = t.replace(/\s*(Greater|Lesser)?\s*God$/i, "").trim();
    }
  }

  entries.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));

  const byKind: Record<string, number> = {};
  for (const e of entries) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(
    OUT_FILE,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), count: entries.length, byKind, entries },
      null,
      2,
    ),
    "utf8",
  );

  console.log("\n  Asetheria — Notion import\n");
  console.log(`  pages imported      : ${stats.md}`);
  console.log(`  duplicate pages     : ${stats.mdMerged}  (roll-up copies, merged)`);
  console.log(`  blank pages skipped : ${stats.mdSkipped}`);
  console.log(`  csv rows merged     : ${stats.csvMerged}`);
  console.log(`  csv rows added      : ${stats.csvCreated}`);
  console.log(`  blank csv rows      : ${stats.csvSkipped}`);
  console.log(`  ─────────────────────`);
  console.log(`  total entries       : ${entries.length}`);
  console.log(`  secret entries      : ${entries.filter((e) => e.visibility === "secret").length}\n`);
  for (const [k, v] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k.padEnd(14)} ${v}`);
  }

  // -- Integrity check --------------------------------------------------------
  // Every source page with real prose must be findable in the output. This is
  // the guard against a classification or merge bug silently eating content.
  const importedBodies = entries.map((e) => e.body.trim()).filter(Boolean);
  const missing: string[] = [];
  for (const file of mdFiles) {
    const { body } = parseMarkdown(fs.readFileSync(file, "utf8"));
    const trimmed = body.trim();
    if (trimmed.length < 200) continue;
    const probe = trimmed.slice(0, 200);
    if (!importedBodies.some((b) => b.includes(probe))) {
      missing.push(path.relative(EXPORT_ROOT, file));
    }
  }

  console.log(`\n  integrity: ${missing.length === 0 ? "OK" : "FAILED"} — every source page with prose is present`);
  if (missing.length) {
    console.log(`  ${missing.length} page(s) missing from the seed:`);
    for (const m of missing.slice(0, 20)) console.log(`    ! ${m}`);
    process.exitCode = 1;
  }
  console.log(`\n  → ${path.relative(REPO, OUT_FILE)}\n`);
}

main();
