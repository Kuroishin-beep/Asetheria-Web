/**
 * Recovers page bodies from a Notion **HTML** export.
 *
 * Notion's Markdown export silently drops the contents of column layouts and
 * some toggle blocks, so a page that is full in Notion can arrive here as an
 * empty stub. The HTML export keeps them. This walks an HTML export, converts
 * each page back to Markdown, and fills in bodies that are materially thinner
 * in the database than in the export.
 *
 * Entries are matched on source path first (the same folder tree the Markdown
 * export produced) and only then on an exact title, because several pages share
 * a name — "Imperium Invicta" exists as an empire, a pantheon, and a rule.
 *
 * An existing body is only replaced when the recovered text is at least
 * MIN_GAIN characters longer, so hand-written prose is never overwritten by a
 * shorter export.
 *
 * Run with:
 *   npx tsx scripts/enrich-from-html.ts "C:/path/to/html-export"           (dry run)
 *   npx tsx scripts/enrich-from-html.ts "C:/path/to/html-export" --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
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

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const ROOT = args.find((a) => !a.startsWith("--"));
if (!ROOT || !fs.existsSync(ROOT)) {
  console.error("\n  Usage: npx tsx scripts/enrich-from-html.ts <html-export-dir> [--apply]\n");
  process.exit(1);
}

/** Only rewrite a body when the export adds at least this much text. */
const MIN_GAIN = 400;

const db = drizzle(neon(url), { schema });

// ---------------------------------------------------------------------------
// HTML -> Markdown
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
  "&#39;": "'", "&rsquo;": "\u2019", "&lsquo;": "\u2018",
  "&ldquo;": "\u201c", "&rdquo;": "\u201d", "&mdash;": "\u2014",
  "&ndash;": "\u2013", "&hellip;": "\u2026", "&times;": "\u00d7",
};

function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&[a-z]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? e);
}

/** Inline markup only — block structure is handled by the caller. */
function inline(html: string): string {
  return decode(
    html
      .replace(/<\s*br\s*\/?>/gi, " ")
      // Notion renders each multi-select option in its own span; without a
      // separator "Agriculture" and "Earth" would concatenate into one word.
      .replace(
        /<span[^>]*class="[^"]*selected-value[^"]*"[^>]*>([\s\S]*?)<\/span>\s*/gi,
        (_, t) => `${strip(t).trim()}, `,
      )
      .replace(/<\s*(strong|b)\s*[^>]*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, (_, __, t) => `**${strip(t)}**`)
      .replace(/<\s*(em|i)\s*[^>]*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, (_, __, t) => `*${strip(t)}*`)
      .replace(/<\s*code\s*[^>]*>([\s\S]*?)<\s*\/\s*code\s*>/gi, (_, t) => `\`${strip(t)}\``)
      .replace(/<\s*a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\s*\/\s*a\s*>/gi, (_, href, t) => {
        const text = strip(t).trim();
        if (!text) return "";
        // Notion links point at sibling export files; keep the words, drop the path.
        return /^https?:/i.test(href) ? `[${text}](${href})` : text;
      })
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+/g, " ")
    .trim();
}

function strip(html: string): string {
  return decode(html.replace(/<[^>]+>/g, ""));
}

function tableToMarkdown(html: string): string {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) =>
    [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
      // The multi-select join above leaves a trailing separator on the last value.
      inline(c[1]).replace(/\|/g, "\\|").replace(/,\s*$/, "").trim(),
    ),
  );
  if (!rows.length) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => [...r, ...Array(width - r.length).fill("")];
  const out = [`| ${pad(rows[0]).join(" | ")} |`, `| ${Array(width).fill("---").join(" | ")} |`];
  for (const r of rows.slice(1)) out.push(`| ${pad(r).join(" | ")} |`);
  return out.join("\n");
}

function htmlToMarkdown(body: string): string {
  let s = body
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    // Notion wraps images in <figure>; the files are not imported, so drop them.
    .replace(/<figure[^>]*>[\s\S]*?<\/figure>/gi, (f) =>
      /<img/i.test(f) && !/<figcaption/i.test(f) ? "" : f,
    );

  const blocks: string[] = [];
  // Tables are lifted out first so their cell markup is not flattened below.
  s = s.replace(/<table[\s\S]*?<\/table>/gi, (t) => {
    blocks.push(tableToMarkdown(t));
    return `\n\u0000${blocks.length - 1}\u0000\n`;
  });

  s = s
    .replace(/<h1[^>]*class="page-title"[^>]*>[\s\S]*?<\/h1>/gi, "")
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, lvl, t) => {
      const text = inline(t);
      return text ? `\n\n${"#".repeat(Math.min(Number(lvl), 6))} ${text}\n\n` : "";
    })
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => {
      const text = inline(t);
      return text ? `\n- ${text}` : "";
    })
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, t) => {
      const text = inline(t);
      return text ? `\n\n> ${text}\n\n` : "";
    })
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, t) => `\n\n\`\`\`\n${strip(t).trim()}\n\`\`\`\n\n`)
    .replace(/<hr\s*\/?>/gi, "\n\n---\n\n")
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, t) => {
      const text = inline(t);
      return text ? `\n\n${text}\n\n` : "";
    })
    .replace(/<div[^>]*>|<\/div>|<\/?(ul|ol|section|article|main|span|figure|figcaption)[^>]*>/gi, "\n");

  s = inlineLeftovers(s);
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `\n\n${blocks[Number(i)]}\n\n`);

  return s
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Any tag that survived the block pass is inline noise. */
function inlineLeftovers(s: string): string {
  return decode(s.replace(/<[^>]+>/g, "")).replace(/[ \t]{2,}/g, " ");
}

// ---------------------------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.toLowerCase().endsWith(".html")) out.push(p);
  }
  return out;
}

/** Strips Notion's hex id suffix and the extension so paths compare equal. */
const norm = (s: string) =>
  s
    .split(/[\\/]/)
    .map((seg) => seg.replace(/\s+[0-9a-f]{8,32}(?=\.|$)/i, "").replace(/\.(md|html)$/i, ""))
    .filter(Boolean)
    .join("/")
    .toLowerCase();

async function main() {
  const files = walk(ROOT!);
  const rows = await db
    .select({
      id: entries.id,
      name: entries.name,
      kind: entries.kind,
      body: entries.body,
      sourcePath: entries.sourcePath,
      archivedAt: entries.archivedAt,
    })
    .from(entries);

  const byPath = new Map<string, (typeof rows)[number]>();
  const byName = new Map<string, (typeof rows)[number][]>();
  for (const r of rows) {
    if (r.sourcePath) byPath.set(norm(r.sourcePath), r);
    const k = r.name.trim().toLowerCase();
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k)!.push(r);
  }

  const plan: { id: string; name: string; kind: string; from: number; to: number; body: string; via: string }[] = [];
  let parsed = 0;
  let unmatched = 0;

  for (const file of files) {
    const raw = fs.readFileSync(file, "utf8");
    const title = strip(raw.match(/<h1[^>]*class="page-title"[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "").trim();
    if (!title) continue;
    parsed++;

    const bodyHtml =
      raw.match(/<div[^>]*class="page-body"[^>]*>([\s\S]*)<\/div>\s*<\/article>/i)?.[1] ??
      raw.match(/<article[^>]*>([\s\S]*)<\/article>/i)?.[1] ??
      "";
    const md = htmlToMarkdown(bodyHtml);
    if (!md) continue;

    const rel = norm(path.relative(ROOT!, file));
    // Source paths recorded by the Markdown importer start below the export root.
    let hit = byPath.get(rel);
    let via = "path";
    if (!hit) {
      for (const [k, v] of byPath) {
        if (rel.endsWith(k)) {
          hit = v;
          break;
        }
      }
    }
    if (!hit) {
      const cands = byName.get(title.toLowerCase()) ?? [];
      // Only trust a title when it is unambiguous.
      if (cands.length === 1) {
        hit = cands[0];
        via = "title";
      }
    }
    if (!hit) {
      unmatched++;
      continue;
    }
    if (hit.archivedAt) continue;

    const cur = (hit.body ?? "").trim();
    if (md.length < cur.length + MIN_GAIN) continue;
    plan.push({ id: hit.id, name: hit.name, kind: hit.kind, from: cur.length, to: md.length, body: md, via });
  }

  plan.sort((a, b) => b.to - b.from - (a.to - a.from));

  console.log(`\n  html pages parsed : ${parsed}`);
  console.log(`  unmatched         : ${unmatched}`);
  console.log(`  bodies to recover : ${plan.length}\n`);
  for (const p of plan) {
    console.log(
      `    ${p.name.slice(0, 34).padEnd(36)} ${p.kind.padEnd(12)} ${String(p.from).padStart(6)} -> ${String(p.to).padStart(6)}  (${p.via})`,
    );
  }

  if (!APPLY) {
    console.log("\n  Dry run. Re-run with --apply to write these bodies.\n");
    return;
  }

  for (const p of plan) {
    await db
      .update(entries)
      .set({ body: p.body, updatedAt: new Date() })
      .where(eq(entries.id, p.id));
  }
  console.log(`\n  Applied: ${plan.length} bodies recovered.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
