/**
 * Extracts the Asetheria-authored content of the Foundry VTT world into
 * `data/foundry-world.json`, a reviewable, checked-in file that
 * `scripts/import-foundry-world.ts` then loads into any database (local or
 * Neon) without needing Foundry on that machine.
 *
 * What is taken, and why only this:
 *
 *  - **Quests** from Forien's Quest Log: description is public; hidden tasks
 *    and GM notes become DM notes.
 *  - **Named characters** from the world's own actor folders: the party (live
 *    and fallen), the Invictian legion officers, the shop/guild contacts, the
 *    Casino and Cave casts, and the named NPC roster.
 *  - **The DM's own journals**: the Duneforged shops, house rules and handouts.
 *
 * Deliberately NOT taken: anything from a licensed product. That means the
 * D&D Beyond packs, Beneos, Forgotten Adventures SRD tokens, *The Bitesized
 * Book of Spectacular Shops*, the Tom Cartos modules (Ostenwold, Bharzul,
 * Axiom's Edge, Shadows of the Duskbane) and DMDave's *Empusa's Underbelly*.
 * Those are someone else's copyrighted books, and owning them for play does
 * not make them ours to republish in a web app.
 *
 * Foundry keeps its data in LevelDB, which takes an exclusive lock, so the
 * databases are copied to a temp folder first: Foundry may stay open, and its
 * data is never opened for writing.
 *
 * Run with:  npx tsx scripts/extract-foundry-world.ts [--world <dir>]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ClassicLevel } from "classic-level";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");
const OUT = path.join(REPO, "data", "foundry-world.json");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const WORLD_DIR =
  arg("world") ?? process.env.FOUNDRY_WORLD_PATH ?? "E:\\FoundryVTT\\Data\\worlds\\asetheria";
const HEIST_WORLD_DIR = path.join(path.dirname(WORLD_DIR), "the-aletheion-heist");

// ---------------------------------------------------------------------------
// Selection rules
// ---------------------------------------------------------------------------

/** Actor folders that hold the campaign's own named characters. */
const NPC_FOLDERS = new Set([
  "Players",
  "Dead",
  "Miltary",
  "Guild/Shps",
  "Casino",
  "Cave",
  "NPCs",
  "Bandit Quests",
  "Oldtown",
  "",
]);

/** Generic or SRD stat blocks that live in those folders but are not characters. */
const GENERIC_NAME =
  /(^|\s)(Boy|Girl|Woman|Man|Messenger|Ranger|Scholar|Sweeper|Legionnaire|Commoner|Bugbear|Kobold|Xorn|Merchants|Gnoll|Hyena|Flind|Mage|Priest|Spy|Veteran|Ankheg|Animated|Bandit|Baphomet|Mindshard|Item Pile|Blacksmith-1|Bushes|Winnie)\b|_|\d/i;

/** The DM's own journals, by name. Everything else in the journal is a licensed product. */
const AUTHORED_JOURNALS: Record<
  string,
  { kind: "organization" | "rule" | "note"; summary?: string; visibility?: "public" | "secret"; fields?: Record<string, string>; tags: string[] }
> = {
  "The Gilded Crucible": {
    kind: "organization",
    summary: "The Virellarion family's alchemist's atelier in the Citadel's Middle District: elixirs for archmages, nobles and divine emissaries.",
    fields: { type: "Shop: Alchemist's Atelier", location: "Middle District, Duneforged Citadel" },
    tags: ["shop", "duneforged", "virellarion"],
  },
  "Ember & Anvil": {
    kind: "organization",
    summary: "The Vulkrim family's blacksmith's foundry in the Citadel's Middle District: arms and armour for the royal guard.",
    fields: { type: "Shop: Blacksmith's Foundry", location: "Middle District, Duneforged Citadel" },
    tags: ["shop", "duneforged", "vulkrim"],
  },
  "Precision Strike": { kind: "rule", fields: { category: "Combat" }, tags: ["combat", "critical-hits"] },
  "Martial Check!": { kind: "rule", fields: { category: "Combat" }, tags: ["combat", "handout"] },
};

/** Known codex pages that imported text should link to, keyed by how Foundry spells them. */
const LINK_TARGETS: Record<string, string> = {
  "Duneforged Citadel": "Duneforged Citadel",
  "Virellarion Family": "The Virellarion Family, Count",
  "Vulkrim Family": "The Vulkrim Family, Marquis",
  "Merca Family": "The Merca Family, Marquis",
  "Zayida Family": "The Zayida Family, Count",
  "Dune Mines": "The Dune Mines",
  "Shattered Pass": "The Shattered Pass",
  Ephelanum: "Ephelanum City",
};

// ---------------------------------------------------------------------------
// LevelDB access
// ---------------------------------------------------------------------------

type Doc = Record<string, unknown> & { _id: string; name: string };

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "asetheria-foundry-"));

async function readDb(src: string): Promise<[string, Doc][]> {
  if (!fs.existsSync(src)) return [];
  const copy = path.join(TMP, `${path.basename(path.dirname(path.dirname(src)))}-${path.basename(src)}`);
  fs.cpSync(src, copy, { recursive: true });
  fs.rmSync(path.join(copy, "LOCK"), { force: true });
  const db = new ClassicLevel<string, Doc>(copy, { valueEncoding: "json" });
  await db.open();
  const rows: [string, Doc][] = [];
  for await (const [k, v] of db.iterator()) rows.push([k, v]);
  await db.close();
  return rows;
}

function folderPaths(rows: [string, Doc][]): (id: unknown) => string {
  const folders = new Map<string, Doc>();
  for (const [k, v] of rows) if (k.startsWith("!folders!")) folders.set(v._id, v);
  return (id) => {
    const parts: string[] = [];
    let f = typeof id === "string" ? folders.get(id) : undefined;
    while (f) {
      parts.unshift(f.name);
      f = typeof f.folder === "string" ? folders.get(f.folder) : undefined;
    }
    return parts.join("/");
  };
}

// ---------------------------------------------------------------------------
// HTML -> Markdown (just the subset Foundry's editor produces)
// ---------------------------------------------------------------------------

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&rsquo;/gi, "\u2019")
    .replace(/&lsquo;/gi, "\u2018")
    .replace(/&rdquo;/gi, "\u201d")
    .replace(/&ldquo;/gi, "\u201c")
    .replace(/&mdash;/gi, "\u2014")
    .replace(/&ndash;/gi, "\u2013")
    .replace(/&amp;/gi, "&");
}

function inlineText(html: string): string {
  return decodeEntities(
    html
      .replace(/@UUID\[[^\]]*\]\{([^}]*)\}/g, "$1")
      // A forced line break becomes a paragraph break once markdown is built.
      .replace(/<br\s*\/?>/gi, "\u0001\u0001")
      .replace(/<(strong|b)>\s*([\s\S]*?)\s*<\/\1>/gi, "**$2**")
      .replace(/<(em|i)>\s*([\s\S]*?)\s*<\/\1>/gi, "_$2_")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\*\*(\s*)\*\*/g, "$1")
    .replace(/[^\S\u0001]+/g, " ")
    .trim();
}

function tableToMarkdown(table: string): string {
  const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) =>
    [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
      inlineText(c[1]).replace(/\u0001+/g, " ").replace(/\|/g, "\\|"),
    ),
  );
  if (rows.length === 0) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => [...r, ...Array(width - r.length).fill("")];
  const [head, ...rest] = rows.map(pad);
  return [
    `| ${head.join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...rest.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}

export function htmlToMarkdown(html: string | undefined | null): string {
  if (!html) return "";
  const tables: string[] = [];
  const md = html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<table[\s\S]*?<\/table>/gi, (t) => {
      tables.push(tableToMarkdown(t));
      return `\n\n\u0000T${tables.length - 1}\u0000\n\n`;
    })
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, t) => `\n\n${"#".repeat(Math.max(2, Number(n)))} ${inlineText(t)}\n\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => `\n- ${inlineText(t)}`)
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, t) => `\n\n> ${inlineText(t)}\n\n`)
    .replace(/<hr\s*\/?>/gi, "\n\n---\n\n")
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, t) => `\n\n${inlineText(t)}\n\n`)
    .replace(/<\/?(ul|ol|div|span|section)[^>]*>/gi, "\n");
  return inlineText(md.replace(/\n/g, "\u0001"))
    .replace(/\u0001/g, "\n")
    .replace(/\u0000T(\d+)\u0000/g, (_, i) => tables[Number(i)])
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/(\n---\n)(\n---\n)+/g, "$1")
    // A heading with nothing under it before the next heading or the end.
    .replace(/^#{2,6} [^\n]*\n+(?=#{2,6} )/gm, "")
    .replace(/\n#{2,6} [^\n]*$/, "")
    .trim();
}

/** Wraps the first mention of each known codex page in a wiki link. */
function linkify(text: string): string {
  let out = text;
  for (const [needle, target] of Object.entries(LINK_TARGETS)) {
    const re = new RegExp(`(?<!\\[\\[)\\b(The )?${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    out = out.replace(re, (m) => (m === target ? `[[${target}]]` : `[[${target}|${m}]]`));
  }
  return out;
}

function slugify(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[\u2019']/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled"
  );
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

export type ExtractedEntry = {
  slug: string;
  kind: "npc" | "quest" | "organization" | "rule" | "note";
  name: string;
  summary: string;
  body: string;
  dmNotes: string;
  fields: Record<string, string>;
  tags: string[];
  visibility: "public" | "secret";
  sourcePath: string;
};

const FOLDER_TAGS: Record<string, string> = {
  "Guild/Shps": "guild-contact",
  Casino: "casino",
  Cave: "cave",
  Oldtown: "oldtown",
  "Bandit Quests": "bandit-quest",
};

const MILITARY_TITLE =
  /^(Legatus Legionis|Praefectus Castrorum|Tribuni Angusticlavii|Tribunus|Centurio)\s*(?:[–-]\s*)?(.*)$/;

function splitTitle(raw: string): { name: string; title?: string } {
  const m = raw.match(MILITARY_TITLE);
  if (m && m[2]) return { title: m[1], name: m[2].replace(/^[–-]\s*/, "").trim() };
  return { name: raw.trim() };
}

function sys(doc: Doc): Record<string, any> {
  return (doc.system as Record<string, any>) ?? {};
}

function actorEntry(actor: Doc, items: Doc[], folder: string): ExtractedEntry {
  const s = sys(actor);
  const raceItem = items.find((i) => i.type === "race" || i.type === "species");
  const race =
    (raceItem?.name as string | undefined) ??
    (typeof s.details?.race === "string" && !/^[A-Za-z0-9]{16}$/.test(s.details.race) ? s.details.race : undefined) ??
    (s.details?.type?.subtype || undefined);
  const classes = items
    .filter((i) => i.type === "class")
    .map((i) => `${i.name} ${sys(i).levels ?? ""}`.trim());
  const { name, title } = splitTitle(actor.name);
  const bio = htmlToMarkdown(s.details?.biography?.value as string | undefined);
  const isPc = actor.type === "character";
  const fallen = folder === "Dead";

  const hp = s.attributes?.hp;
  const ac = s.attributes?.ac;
  const cr = s.details?.cr;
  // Foundry's blank NPC template is HP 10 / CR 1 with nothing else set: that
  // is not a stat block, just an empty actor.
  const blankTemplate = !classes.length && !ac?.flat && (hp?.max ?? 10) === 10;
  const statblock = blankTemplate ? "" : [
    classes.length ? `Class: ${classes.join(", ")}` : null,
    hp?.max ? `HP: ${hp.max}` : null,
    ac?.flat ? `AC: ${ac.flat}` : null,
    typeof cr === "number" && !isPc ? `CR: ${cr}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  const role = [
    title,
    folder === "Miltary" ? "Imperium Invicta legion" : null,
    isPc ? (fallen ? "Fallen party member" : "Party member") : null,
    classes.join(", ") || null,
  ]
    .filter(Boolean)
    .join(" · ");

  const tags = ["foundry-import"];
  if (isPc) tags.push("player-character");
  if (fallen) tags.push("fallen");
  if (folder === "Miltary") tags.push("legion");
  const folderTag = FOLDER_TAGS[folder];
  if (folderTag) tags.push(folderTag);

  return {
    slug: slugify(name),
    kind: "npc",
    name,
    summary: [race, title ?? (classes.join(", ") || null), fallen ? "(fallen)" : null].filter(Boolean).join(" ") ||
      "A character from the Foundry VTT world.",
    body: linkify(bio.replace(/^Token artwork by Forgotten Adventures \.?\s*/i, "")),
    dmNotes: "",
    fields: {
      ...(race ? { race } : {}),
      ...(role ? { role } : {}),
      ...(statblock ? { statblock } : {}),
    },
    tags,
    visibility: "public",
    sourcePath: `Foundry VTT: worlds/asetheria/actors/${actor._id}`,
  };
}

type FqlTask = { name: string; hidden?: boolean; completed?: boolean; failed?: boolean };
type FqlQuest = {
  name: string;
  status?: string;
  giverData?: { name?: string } | null;
  description?: string;
  gmnotes?: string;
  tasks?: FqlTask[];
  rewards?: { data?: { name?: string } }[];
};

function questEntry(journal: Doc, quest: FqlQuest, npcNames: Set<string>): ExtractedEntry {
  const giver = quest.giverData?.name?.trim();
  const giverLink = giver && npcNames.has(giver) ? `[[${giver}]]` : giver;
  const mark = (t: FqlTask) => (t.completed ? "[x]" : t.failed ? "[failed]" : "[ ]");
  const visible = (quest.tasks ?? []).filter((t) => !t.hidden);
  const hidden = (quest.tasks ?? []).filter((t) => t.hidden);
  const description = linkify(htmlToMarkdown(quest.description));
  const status = quest.status === "active" ? "Active" : quest.status === "completed" ? "Complete" : quest.status === "inactive" ? "Inactive" : "Available";

  const body = [
    giverLink ? `_Offered by ${giverLink}._` : null,
    description,
    visible.length ? `## Objectives\n\n${visible.map((t) => `- ${mark(t)} ${t.name}`).join("\n")}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const dmNotes = [
    hidden.length
      ? `**Objectives not yet revealed to the party:**\n\n${hidden.map((t) => `- ${mark(t)} ${t.name}`).join("\n")}`
      : null,
    htmlToMarkdown(quest.gmnotes),
  ]
    .filter(Boolean)
    .join("\n\n");

  const firstPara = description.split(/\n\n/)[0].replace(/[*_]/g, "");
  return {
    slug: slugify(quest.name),
    kind: "quest",
    name: quest.name,
    summary: firstPara.length > 220 ? `${firstPara.slice(0, 217).trimEnd()}…` : firstPara,
    body,
    dmNotes,
    fields: { status, ...(giver ? { questGiver: giver } : {}) },
    tags: ["foundry-import", "quest-log"],
    // An unstarted quest the party has never been offered is still the DM's.
    visibility: quest.status === "inactive" ? "secret" : "public",
    sourcePath: `Foundry VTT: worlds/asetheria/journal/${journal._id}`,
  };
}

/** Family names Foundry's casino cast are labelled with ("Noble Vulkrim"). */
const NOBLE_HOUSES: Record<string, string> = {
  Merca: "The Merca Family, Marquis",
  Virellarion: "The Virellarion Family, Count",
  Vulkrim: "The Vulkrim Family, Marquis",
  Zayida: "The Zayida Family, Count",
};

/**
 * Most quest-givers are bare actors with no biography. Their quests describe
 * them, though, so lift the sentences that do — nothing here is invented, it
 * is the quest text pointed back at the person it is about.
 */
function groundNpcsInQuests(all: ExtractedEntry[]) {
  const quests = all.filter((e) => e.kind === "quest");
  for (const npc of all) {
    if (npc.kind !== "npc") continue;
    const given = quests.filter((q) => q.fields.questGiver === npc.name);
    const parts: string[] = [];

    if (given.length) {
      const nameParts = npc.name.split(/[\s,]+/).filter((w) => w.length >= 4);
      for (const q of given) {
        const sentences = q.body
          .replace(/^_Offered by[^\n]*\n+/, "")
          .split(/\n\n/)[0]
          .split(/(?<=[.!?])\s+/)
          .filter((s) => nameParts.some((w) => s.includes(w)) || /\b(he|she|they|him|her|his)\b/i.test(s))
          .slice(0, 2);
        parts.push(`Offers the quest [[${q.name}]]. ${sentences.join(" ")}`.trim());
      }
      npc.tags = [...new Set([...npc.tags, "quest-giver"])];
      const questNames = given.map((q) => q.name).join(", ");
      if (/Foundry VTT world/.test(npc.summary)) npc.summary = `Quest giver: ${questNames}.`;
    }

    const house = npc.name.match(/^Noble (\w+)/)?.[1];
    if (house && NOBLE_HOUSES[house]) {
      parts.push(`A noble of [[${NOBLE_HOUSES[house]}]], met at the Casino.`);
      npc.fields = { ...npc.fields, factions: NOBLE_HOUSES[house] };
      if (/Foundry VTT world/.test(npc.summary)) npc.summary = `A noble of the ${house} family, met at the Casino.`;
    }

    if (!npc.body.trim() && !parts.length) {
      // A name the DM placed in the world with nothing written yet. Keep it so
      // the roster is complete, and flag it so the gap is easy to find.
      npc.tags = [...new Set([...npc.tags, "needs-writeup"])];
      if (/Foundry VTT world/.test(npc.summary)) {
        npc.summary = "A named character from the campaign's Foundry roster, not yet written up.";
      }
    }
    if (!npc.body.trim() && parts.length) npc.body = parts.join("\n\n");
    else if (parts.length) npc.body = `${npc.body}\n\n${parts.join("\n\n")}`;
  }
}

// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n  Extracting from ${WORLD_DIR}\n`);
  const dataDir = path.join(WORLD_DIR, "data");
  const folderRows = await readDb(path.join(dataDir, "folders"));
  const folderOf = folderPaths(folderRows);

  // Actors --------------------------------------------------------------
  const actorRows = await readDb(path.join(dataDir, "actors"));
  const itemsByActor = new Map<string, Doc[]>();
  const actors: Doc[] = [];
  for (const [k, v] of actorRows) {
    const m = k.match(/^!actors\.items!([^.]+)\./);
    if (m) itemsByActor.set(m[1], [...(itemsByActor.get(m[1]) ?? []), v]);
    else if (/^!actors![^.]+$/.test(k)) actors.push(v);
  }

  const out: ExtractedEntry[] = [];
  const seen = new Set<string>();
  const add = (e: ExtractedEntry) => {
    if (seen.has(e.slug)) return;
    seen.add(e.slug);
    out.push(e);
  };

  for (const actor of actors) {
    if (actor.type !== "npc" && actor.type !== "character") continue;
    const folder = folderOf(actor.folder);
    if (!NPC_FOLDERS.has(folder) || GENERIC_NAME.test(actor.name)) continue;
    const bio = String(sys(actor).details?.biography?.value ?? "");
    if (/Forgotten Adventures/i.test(bio) && !/Personality|Backstory/i.test(bio)) continue;
    add(actorEntry(actor, itemsByActor.get(actor._id) ?? [], folder));
  }
  const npcNames = new Set(out.map((e) => e.name));

  // Journals ------------------------------------------------------------
  const journalRows = await readDb(path.join(dataDir, "journal"));
  const pagesByJournal = new Map<string, Doc[]>();
  const journals: Doc[] = [];
  for (const [k, v] of journalRows) {
    const m = k.match(/^!journal\.pages!([^.]+)\./);
    if (m) pagesByJournal.set(m[1], [...(pagesByJournal.get(m[1]) ?? []), v]);
    else if (/^!journal![^.]+$/.test(k)) journals.push(v);
  }
  const pageText = (j: Doc) =>
    (pagesByJournal.get(j._id) ?? [])
      .sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0))
      .map((p) => htmlToMarkdown((p.text as { content?: string } | undefined)?.content))
      .filter(Boolean)
      .join("\n\n");

  for (const j of journals) {
    const quest = (j.flags as Record<string, any> | undefined)?.["forien-quest-log"]?.json as FqlQuest | undefined;
    if (quest?.name) {
      add(questEntry(j, quest, npcNames));
      continue;
    }
    const spec = AUTHORED_JOURNALS[j.name];
    if (!spec) continue;
    const text = linkify(pageText(j));
    const first = text.split(/\n\n/).find((p) => !p.startsWith("#") && p.length > 40) ?? "";
    add({
      slug: slugify(j.name),
      kind: spec.kind,
      name: j.name.replace(/!$/, ""),
      summary: spec.summary ?? first.replace(/[*_#]/g, "").slice(0, 220),
      body: text,
      dmNotes: "",
      fields: spec.fields ?? {},
      tags: ["foundry-import", ...spec.tags],
      visibility: spec.visibility ?? "public",
      sourcePath: `Foundry VTT: worlds/asetheria/journal/${j._id}`,
    });
  }

  groundNpcsInQuests(out);

  // The vault puzzle and its answer belong together, and the answer is the DM's.
  const puzzle = journals.find((j) => j.name === "Vault Puzzle");
  const answer = journals.find((j) => j.name === "Vault Answer from Flind");
  if (puzzle) {
    add({
      slug: "the-runic-vault-puzzle",
      kind: "note",
      name: "The Runic Vault Puzzle",
      summary: "A three-layered runic lock on a vault door, worked by a wheel and three buttons.",
      body: pageText(puzzle),
      dmNotes: answer ? `**Solution (from Flind):**\n\n${pageText(answer)}` : "",
      fields: {},
      tags: ["foundry-import", "puzzle"],
      visibility: "public",
      sourcePath: `Foundry VTT: worlds/asetheria/journal/${puzzle._id}`,
    });
  }

  // The heist world's player handout.
  const heistRows = await readDb(path.join(HEIST_WORLD_DIR, "data", "journal"));
  const letter = heistRows.find(([k, v]) => /^!journal![^.]+$/.test(k) && v.name === "The Letter")?.[1];
  if (letter) {
    const page = heistRows.find(([k]) => k.startsWith(`!journal.pages!${letter._id}.`))?.[1];
    const text = htmlToMarkdown((page?.text as { content?: string } | undefined)?.content);
    add({
      slug: "the-letter-aletheion-heist",
      kind: "note",
      name: "The Letter (Aletheion Heist)",
      summary: "The anonymous letter that sets [[The Aletheion Heist]] in motion.",
      body: text,
      dmNotes: "",
      fields: {},
      tags: ["foundry-import", "handout", "aletheion-heist"],
      visibility: "public",
      sourcePath: `Foundry VTT: worlds/the-aletheion-heist/journal/${letter._id}`,
    });
  }

  // A character the codex already has under another slug (the expansion wrote
  // "Elira" as elira-citadel-archives) must reuse that slug, so the importer
  // fills the existing page instead of creating a second Elira.
  const known = new Map<string, string>();
  for (const f of ["world-seed.json", "expansion.json"]) {
    const p = path.join(REPO, "data", f);
    if (!fs.existsSync(p)) continue;
    for (const e of JSON.parse(fs.readFileSync(p, "utf8")).entries as { name: string; slug: string; kind: string }[]) {
      known.set(`${e.kind}:${e.name.toLowerCase()}`, e.slug);
    }
  }
  for (const e of out) {
    const existing = known.get(`${e.kind}:${e.name.toLowerCase()}`);
    if (existing) e.slug = existing;
  }

  out.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        format: "asetheria-codex",
        source: "Foundry VTT world 'asetheria' (+ 'the-aletheion-heist' handout)",
        note: "Asetheria-authored content only; licensed modules and SRD stat blocks are excluded by scripts/extract-foundry-world.ts.",
        entries: out,
      },
      null,
      2,
    ) + "\n",
  );
  fs.rmSync(TMP, { recursive: true, force: true });

  const byKind = out.reduce<Record<string, number>>((a, e) => ((a[e.kind] = (a[e.kind] ?? 0) + 1), a), {});
  console.log(`  Wrote ${out.length} entries to data/foundry-world.json`, byKind);
  for (const e of out) console.log(`   ${e.kind.padEnd(13)} ${e.name}  (${e.body.length}c${e.dmNotes ? ", dm notes" : ""}${e.visibility === "secret" ? ", SECRET" : ""})`);
}

main().catch((err) => {
  fs.rmSync(TMP, { recursive: true, force: true });
  console.error("\n  Foundry extract failed:\n", err);
  process.exit(1);
});
