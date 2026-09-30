/**
 * Fills the last gaps in the codex.
 *
 * Four separate jobs, none of which fit the earlier passes:
 *
 * 1. Two lore pages ("Notable", "Triggers") reached the codex from a CSV row,
 *    so their source path points at the .csv and the HTML recovery could not
 *    match them. Their real text is in the HTML export under Mycairos, and is
 *    pulled in here rather than written from scratch.
 *
 * 2. All 186 deities have a pantheon, domains, an alignment and a race, and no
 *    summary at all — so they show in lists and search as a bare name. The
 *    summary is composed from those fields. Nothing is invented; this is the
 *    entry describing itself.
 *
 * 3. The eight members of the Duneforged Citadel's ruling house have no text.
 *    They are written from the Roman imperial household the name points at.
 *
 * 4. One session log and one item need a summary.
 *
 * Only fills gaps. Never overwrites.
 *
 * Run with:  npx tsx scripts/fill-remaining.ts          (dry run)
 *            npx tsx scripts/fill-remaining.ts --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, sql } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { entries } from "../src/db/schema";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");

for (const file of [".env.local", ".env"]) {
  const p = path.join(REPO, file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["'](.*)["']$/s, "$1");
    }
  }
}

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!url) {
  console.error("\n  DATABASE_URL is not set.\n");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const HTML_ROOT = "C:/aset3/Private & Shared/The Continent of Asetheria";
const db = drizzle(neon(url), { schema });

// ---------------------------------------------------------------- helpers --

function decode(s: string): string {
  const named: Record<string, string> = {
    "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
    "&#39;": "'", "&rsquo;": "\u2019", "&lsquo;": "\u2018",
    "&ldquo;": "\u201c", "&rdquo;": "\u201d", "&mdash;": "\u2014",
  };
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&[a-z]+;/gi, (e) => named[e.toLowerCase()] ?? e);
}

/** Minimal Notion-HTML to Markdown, sufficient for these two prose pages. */
function htmlToMarkdown(html: string): string {
  return decode(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<figure[^>]*>[\s\S]*?<\/figure>/gi, "")
      .replace(/<h1[^>]*class="page-title"[^>]*>[\s\S]*?<\/h1>/gi, "")
      .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, l, t) => `\n\n${"#".repeat(Number(l))} ${t.replace(/<[^>]+>/g, "").trim()}\n\n`)
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => `\n- ${t.replace(/<[^>]+>/g, "").trim()}`)
      .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, t) => `**${t.replace(/<[^>]+>/g, "").trim()}**`)
      .replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, t) => `*${t.replace(/<[^>]+>/g, "").trim()}*`)
      .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, t) => `\n\n${t.replace(/<[^>]+>/g, "").trim()}\n\n`)
      .replace(/<[^>]+>/g, "\n"),
  )
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function readPage(file: string): string | null {
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf8");
  const body =
    raw.match(/<div[^>]*class="page-body"[^>]*>([\s\S]*)<\/div>\s*<\/article>/i)?.[1] ?? "";
  const md = htmlToMarkdown(body);
  return md || null;
}

/** Composes a deity's index line from what the entry already records. */
function deitySummary(e: {
  tags: string[];
  fields: Record<string, string>;
}): string | null {
  const f = e.fields ?? {};
  const domains = (f.domains ?? "").replace(/\s*,\s*/g, ", ").trim();
  const alignment = (f.alignment ?? "").trim();
  const race = (f.race ?? "").trim();
  // "Hellenorian Lesser God", "Aetherian Ancient Titan", …
  const title =
    e.tags?.find((t) => /god|titan|ascended|deity/i.test(t)) ??
    (f.pantheon ? `${f.pantheon} deity` : "");

  const lead = title && domains ? `${title} of ${domains}` : title || (domains ? `Deity of ${domains}` : "");
  if (!lead) return null;

  const tail = [race && race.toLowerCase() !== "n/a" ? race : null, alignment || null]
    .filter(Boolean)
    .join(" · ");
  return tail ? `${lead}. ${tail}.` : `${lead}.`;
}

// ------------------------------------------------------- the ruling house --

type Person = { name: string; summary: string; basis: string; body: string };

const HOUSE: Person[] = [
  {
    name: "Duke Roderick Caesar",
    summary: "Head of the Caesar house and Duke of the Duneforged Citadel — a war-made ruler governing a mining city in a peace he did not want.",
    basis: "The Roman paterfamilias and the provincial dynast whose authority rests on the household rather than a title.",
    body: `Duke of the [[Duneforged Citadel]] and head of the house that has held it for five generations.

Roderick's authority is not constitutional. It rests on the household — on marriages, obligations and the fact that the citadel's other families are all, in some degree, his clients. He governs the way a Roman head of house governs: by knowing exactly what everyone in it owes him.

He is a competent soldier who spent his best years commanding the citadel's levies in a war that ended without a victory, and a shrewd administrator who has since discovered that peace is harder. The ore in [[The Dune Mines]] is thinning, the assay reports have trended one way for a decade, and his answer so far has been to spend on the [[Forge of Vulcan]] and the cathedral rather than to admit the problem.

He is not cruel and not sentimental. He has three living legitimate children, an heir he does not much like, and a household that is considerably more complicated than the family tree suggests.`,
  },
  {
    name: "Duchess Kivia Elea Caesar",
    summary: "The Duke's wife and the household's actual administrator — she holds the keys, the accounts, and most of the citadel's obligations.",
    basis: "The Roman materfamilias: legally subordinate, practically running the estate and its finances.",
    body: `Wife to [[Duke Roderick Caesar]], and the person who actually runs the [[Duneforged Citadel]]'s household.

The distinction matters. The Duke governs the citadel; the Duchess governs the house, and in a polity where authority is exercised through the household that makes her the second power and occasionally the first. She holds the keys, the stores, the marriage negotiations and the accounts, and she has held them for twenty-six years.

Her relationship with the [[Mithril Reserve]] is direct and personal. It was Kivia Elea who arranged the house's borrowing during the war, and it is Kivia Elea whom the *Argentar* ask for when the terms need revisiting — a fact her husband finds mildly humiliating and has never contested.

She is unfailingly correct in public and is understood to be the reason the Merca and Vulkrim families have not fallen out openly in a decade.`,
  },
  {
    name: "Roland Caesar, The Heir",
    summary: "The Duke's eldest son and designated successor — capable, impatient, and increasingly of the view that his father is managing a decline.",
    basis: "The Roman heir apparent kept in a subordinate command while the paterfamilias lives.",
    body: `Eldest legitimate son of [[Duke Roderick Caesar]] and heir to the [[Duneforged Citadel]].

Roland has been given commands sufficient to prove him and never sufficient to establish him — the standard treatment of an heir whose father intends to live a long time. He has performed well in all of them and is thoroughly tired of it.

His quarrel with the Duke is substantive rather than personal. Roland has read the assay reports from [[The Dune Mines]], has drawn the obvious conclusion, and argues that the citadel should be buying land and shifting its wealth now, while it still has wealth to shift. His father regards this as defeatism. Several of the shareholding families quietly agree with the son and have begun buying land themselves.

He is on good terms with the [[Mithril Reserve]], correct with his mother, and openly contemptuous of his half-brother [[Tristan Caesar]].`,
  },
  {
    name: "Gavin Caesar",
    summary: "The Duke's second son — commander of the citadel's garrison, uninterested in inheriting, and the most popular Caesar in the lower city.",
    basis: "The Roman younger son directed into military command rather than succession.",
    body: `Second legitimate son of [[Duke Roderick Caesar]], and by arrangement rather than accident a soldier rather than a candidate.

Gavin commands the citadel's standing garrison and is genuinely good at it. He knows the quarrymen's gangs by name, drinks in [[The Parched Ox]] without ceremony, and has twice paid the wages of a mine crew out of his own purse when the treasury was slow. The lower city adores him and the upper city finds this slightly alarming.

He has no ambition on the succession and has said so publicly and often, which everyone believes and nobody entirely relies on. His brother [[Roland Caesar, The Heir]] treats him as an ally. His mother treats him as a risk that has not yet materialised.

He swore at the [[Sanctum of Hoplodamus]] on taking command, and by all accounts meant it.`,
  },
  {
    name: "Helena Caesar",
    summary: "The Duke's daughter — married off to bind a family, returned home widowed, and now the household's sharpest negotiator.",
    basis: "The Roman noblewoman as instrument of dynastic alliance, and the unusual freedom of a wealthy widow.",
    body: `Daughter of [[Duke Roderick Caesar]], married at seventeen to secure an alliance with one of the citadel's marquis families, and widowed at twenty-four.

Roman practice in this is clear and Helena has exploited it fully: a widow with property and no husband is the freest woman in the city. She did not remarry, retained her settlement, and returned to the household as a principal rather than a dependent.

She now conducts most of the house's difficult negotiations, on the reasoning — hers — that she is the only Caesar whom the other families do not automatically read as speaking for the Duke. She is very good at it. The Merca and Zayida houses both prefer to deal with her.

Her mother [[Duchess Kivia Elea Caesar]] trained her and is said to regard her as an improvement.`,
  },
  {
    name: "Tristan Caesar",
    summary: "The Duke's acknowledged natural son — raised in the household, excluded from the succession, and useful precisely because he has no standing.",
    basis: "The Roman household's acknowledged illegitimate child: raised inside, barred from inheritance, employed accordingly.",
    body: `Natural son of [[Duke Roderick Caesar]], acknowledged, raised in the household, and barred from the succession by a rule nobody has ever proposed changing.

The position is a recognised one and comes with recognised uses. Tristan can be sent where a legitimate son cannot — to negotiate deniably, to carry an offer the Duke does not wish to have made in his own name, to be present at things the house needs seen and does not wish to be seen at. He has done all of it, competently, for a decade.

He is not resentful in any way he shows. He is on excellent terms with [[Helena Caesar]], correct with the Duchess, and detested by [[Roland Caesar, The Heir]] — who understands perfectly well that a capable half-brother with no claim is a piece his father can move and he cannot.

He keeps rooms in the middle city rather than the palace, which was his own choice.`,
  },
  {
    name: "Scribonia Caesar",
    summary: "A woman of the Duke's household with the Caesar name and no clear place on the family tree — which is the point.",
    basis: "The Roman household's absorbed dependent: given the family name, given standing, given no documented origin.",
    body: `Scribonia carries the Caesar name, lives in the household, is addressed as family, and appears on no genealogy the archives hold.

This is not an irregularity so much as an old Roman convenience. A household may absorb a person — a ward, a dependent, the child of an obligation — give them the name, and decline to specify further. The name confers standing; the silence confers deniability; and everyone concerned understands that asking is a discourtesy.

She is educated well beyond what a dependent would normally receive, manages a substantial part of the household's correspondence, and is trusted with matters that would ordinarily go to a blood relative.

The obvious inference has been drawn by everyone in the citadel. [[Duchess Kivia Elea Caesar]] has never commented, which is itself the subject of considerable speculation, since her silence has protected Scribonia rather than exposed her.`,
  },
  {
    name: "Lady Isolde Merca",
    summary: "Of the banking house, resident in the Duke's household — a hostage, an alliance, and the Mithril Reserve's eyes on its largest debtor.",
    basis: "The dynastic hostage of antiquity: a highly honoured guest whose presence guarantees an agreement.",
    body: `Of the Merca family, who founded the [[Mithril Reserve]], and resident in the [[Duke Roderick Caesar]]'s household under an arrangement everyone describes in a different word.

The Merca call it an alliance. The Caesar household calls her an honoured guest. The old practice it descends from is hostage-taking, refined until both parties can pretend otherwise: a person of high standing lives in the other house, is treated magnificently, and guarantees by their presence that an agreement holds.

The agreement in question is the citadel's debt. Isolde is intelligent, extremely well informed about the assay reports from [[The Dune Mines]], and writes to her family regularly in a hand the household does not read and could not stop.

She and [[Helena Caesar]] are genuinely close, which complicates matters for everyone and was probably not in anyone's plan.`,
  },
];

// -------------------------------------------------------------------------

async function main() {
  const rows = await db
    .select({
      id: entries.id,
      name: entries.name,
      kind: entries.kind,
      slug: entries.slug,
      body: entries.body,
      summary: entries.summary,
      dmNotes: entries.dmNotes,
      tags: entries.tags,
      fields: entries.fields,
    })
    .from(entries)
    .where(sql`${entries.archivedAt} is null`);

  const byName = new Map(rows.map((r) => [r.name.trim().toLowerCase(), r]));
  const bySlug = new Map(rows.map((r) => [r.slug, r]));

  type Change = {
    id: string;
    name: string;
    what: string;
    body?: string;
    summary?: string;
    dmNotes?: string;
    newName?: string;
  };
  const plan: Change[] = [];

  // 1. Recover the two lore pages from the HTML export.
  const LORE = [
    {
      slug: "notable",
      file: `${HTML_ROOT}/The Continent/The Old Empires/Untitled/Mycairos The Kingdom of Bronze and Blood/The Truth/Notable 0d3517ecd9b744328b4605b3cb993145.html`,
      newName: "Mycairos — Notable",
      summary: "The figures who mattered in the fall of Mycairos, recovered from the Kingdom's own account.",
    },
    {
      slug: "triggers",
      file: `${HTML_ROOT}/The Continent/The Old Empires/Untitled/Mycairos The Kingdom of Bronze and Blood/The Truth/Triggers 11ef1754c403808c922ec68c4ef70187.html`,
      newName: "Mycairos — Triggers",
      summary: "What set the fall of Mycairos in motion, recovered from the Kingdom's own account.",
    },
  ];
  for (const l of LORE) {
    const hit = bySlug.get(l.slug);
    if (!hit || hit.body.trim()) continue;
    const md = readPage(l.file);
    if (!md) {
      console.log(`    ! could not read ${l.file}`);
      continue;
    }
    plan.push({
      id: hit.id,
      name: hit.name,
      what: `lore body ${md.length} + rename`,
      body: md,
      summary: l.summary,
      newName: l.newName,
      dmNotes: hit.dmNotes?.trim() ? undefined : "Recovered from the HTML export; the Markdown export dropped it.",
    });
  }

  // 2. Deity summaries, composed from each entry's own properties.
  for (const r of rows) {
    if (r.kind !== "deity") continue;
    if (r.summary?.trim() && !/^untitled$/i.test(r.summary.trim())) continue;
    const s = deitySummary(r as never);
    if (!s) continue;
    plan.push({ id: r.id, name: r.name, what: "deity summary", summary: s });
  }

  // 3. The ruling house.
  for (const p of HOUSE) {
    const hit = byName.get(p.name.trim().toLowerCase());
    if (!hit || hit.body.trim()) continue;
    plan.push({
      id: hit.id,
      name: hit.name,
      what: `house body ${p.body.length}`,
      body: p.body,
      summary: hit.summary?.trim() ? undefined : p.summary,
      dmNotes: hit.dmNotes?.trim() ? undefined : `Adapted from: ${p.basis}`,
    });
  }

  // 4. The session log and the remaining item.
  for (const r of rows) {
    const emptySummary = !r.summary?.trim() || /^untitled$/i.test(r.summary.trim());
    if (!emptySummary) continue;
    if (r.kind === "session") {
      plan.push({
        id: r.id,
        name: r.name,
        what: "session summary",
        summary: "Session log: the False Saviour wakes, and its influence begins to spread.",
      });
    } else if (r.kind === "item") {
      const d = (r.fields as Record<string, string>)?.description ?? "";
      if (d.trim()) {
        plan.push({
          id: r.id,
          name: r.name,
          what: "item summary",
          summary: d.trim().slice(0, 180),
        });
      }
    }
  }

  const counts = new Map<string, number>();
  for (const p of plan) {
    const k = p.what.replace(/\s\d+.*/, "");
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  console.log(`\n  changes: ${plan.length}\n`);
  for (const [k, n] of counts) console.log(`    ${String(n).padStart(4)}  ${k}`);
  console.log("\n  samples:");
  for (const p of plan.slice(0, 6)) {
    console.log(`    ${p.name.slice(0, 30).padEnd(32)} ${p.what}`);
    if (p.summary) console.log(`        "${p.summary.slice(0, 90)}"`);
  }

  if (!APPLY) {
    console.log("\n  Dry run. Re-run with --apply.\n");
    return;
  }

  for (const p of plan) {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (p.body) set.body = p.body;
    if (p.summary) set.summary = p.summary;
    if (p.dmNotes) set.dmNotes = p.dmNotes;
    if (p.newName) set.name = p.newName;
    await db.update(entries).set(set).where(eq(entries.id, p.id));
  }
  console.log(`\n  Applied ${plan.length} changes.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
