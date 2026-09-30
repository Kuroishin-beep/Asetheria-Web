/**
 * Imports the full monster list from the D&D 5th Edition System Reference
 * Document (SRD 5.1) as the codex's Bestiary base layer.
 *
 * The SRD is the specific subset of D&D content Wizards of the Coast releases
 * under the Creative Commons Attribution 4.0 International License
 * (https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf) precisely so
 * it can be reused like this. It does not include the full Monster Manual —
 * iconic named creatures tied to the brand (beholders, mind flayers, displacer
 * beasts) are excluded, and it carries almost no narrative flavour text, only
 * mechanics. Both of those gaps are filled separately, by hand, with original
 * Asetheria content.
 *
 * Data comes from the D&D 5e API (dnd5eapi.co / 5e-bits/5e-database), a
 * community-maintained structured rendering of this same licensed SRD data —
 * used here instead of parsing the SRD PDF directly because it is exact,
 * complete, and already machine-readable.
 *
 * Every entry created here carries a per-entry attribution line in its body
 * and links to a single consolidated attribution Note (see
 * `add-srd-attribution-note.ts`), which must exist first for the wikilink to
 * resolve.
 *
 * Idempotent: skips any monster whose slug already exists.
 *
 * Run with:  npx tsx scripts/import-srd-monsters.ts          (dry run)
 *            npx tsx scripts/import-srd-monsters.ts --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, sql } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { entries, links } from "../src/db/schema";
import { slugify } from "../src/lib/links";

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
const db = drizzle(neon(url), { schema });

const API = "https://www.dnd5eapi.co";
const ATTRIBUTION_NOTE = "System Reference Document (SRD 5.1)";

// ---------------------------------------------------------------------------
// Stat-block formatting
// ---------------------------------------------------------------------------

type Api = Record<string, any>;

function mod(score: number): string {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
}

function crText(cr: number): string {
  if (cr === 0.125) return "1/8";
  if (cr === 0.25) return "1/4";
  if (cr === 0.5) return "1/2";
  return String(cr);
}

function formatAC(ac: Api[]): string {
  if (!ac?.length) return "—";
  return ac
    .map((a) => {
      const note = a.desc || (a.type && a.type !== "dex" ? a.type.replace(/_/g, " ") : "");
      return note ? `${a.value} (${note})` : String(a.value);
    })
    .join("; ");
}

function formatSpeed(speed: Api): string {
  if (!speed) return "—";
  const order = ["walk", "fly", "swim", "climb", "burrow"];
  const parts = order.filter((k) => speed[k]).map((k) => (k === "walk" ? speed[k] : `${k} ${speed[k]}`));
  if (speed.hover) parts[parts.findIndex((p) => p.startsWith("fly"))] += " (hover)";
  return parts.join(", ") || "—";
}

function formatSenses(senses: Api): string {
  if (!senses) return "";
  const keys = Object.keys(senses).filter((k) => k !== "passive_perception");
  const parts = keys.map((k) => `${k.replace(/_/g, " ")} ${senses[k]}`);
  if (senses.passive_perception != null) parts.push(`passive Perception ${senses.passive_perception}`);
  return parts.join(", ");
}

function formatDamageList(items: (string | Api)[]): string {
  if (!items?.length) return "";
  return items.map((i) => (typeof i === "string" ? i : i.name)).join(", ");
}

function formatProficiencies(profs: Api[]): { skills: string; saves: string } {
  const skills: string[] = [];
  const saves: string[] = [];
  for (const p of profs ?? []) {
    const name: string = p.proficiency?.name ?? "";
    if (name.startsWith("Skill: ")) skills.push(`${name.slice(7)} ${p.value >= 0 ? "+" : ""}${p.value}`);
    else if (name.startsWith("Saving Throw: ")) saves.push(`${name.slice(14)} ${p.value >= 0 ? "+" : ""}${p.value}`);
  }
  return { skills: skills.join(", "), saves: saves.join(", ") };
}

function abilityBlock(m: Api): string {
  const rows = [
    ["STR", m.strength],
    ["DEX", m.dexterity],
    ["CON", m.constitution],
    ["INT", m.intelligence],
    ["WIS", m.wisdom],
    ["CHA", m.charisma],
  ] as [string, number][];
  return rows.map(([label, score]) => `${label} ${score} (${mod(score)})`).join("   ");
}

function entryList(label: string, items: Api[]): string {
  if (!items?.length) return "";
  const body = items
    .map((a) => `**${a.name}.** ${(a.desc ?? "").trim()}`)
    .join("\n\n");
  return `\n\n### ${label}\n\n${body}`;
}

function buildStatblock(m: Api): string {
  const { skills, saves } = formatProficiencies(m.proficiencies);
  const senses = formatSenses(m.senses);
  const vuln = formatDamageList(m.damage_vulnerabilities);
  const resist = formatDamageList(m.damage_resistances);
  const immune = formatDamageList(m.damage_immunities);
  const condImmune = formatDamageList(m.condition_immunities);

  const lines = [
    `**Armor Class** ${formatAC(m.armor_class)}`,
    `**Hit Points** ${m.hit_points}${m.hit_dice ? ` (${m.hit_dice})` : ""}`,
    `**Speed** ${formatSpeed(m.speed)}`,
    "",
    abilityBlock(m),
    "",
    saves && `**Saving Throws** ${saves}`,
    skills && `**Skills** ${skills}`,
    vuln && `**Damage Vulnerabilities** ${vuln}`,
    resist && `**Damage Resistances** ${resist}`,
    immune && `**Damage Immunities** ${immune}`,
    condImmune && `**Condition Immunities** ${condImmune}`,
    senses && `**Senses** ${senses}`,
    `**Languages** ${m.languages?.trim() || "—"}`,
    `**Challenge** ${crText(m.challenge_rating)} (${m.xp ?? 0} XP)`,
  ].filter((l) => l !== "");

  let out = lines.join("\n");
  out += entryList("Traits", m.special_abilities);
  out += entryList("Actions", m.actions);
  out += entryList("Legendary Actions", m.legendary_actions);
  out += entryList("Reactions", m.reactions);
  return out.trim();
}

function typeLine(m: Api): string {
  const sub = m.subtype ? ` (${m.subtype})` : "";
  return `${m.size} ${m.type}${sub}, ${m.alignment || "unaligned"}`;
}

// ---------------------------------------------------------------------------

async function fetchJson(p: string): Promise<Api> {
  const res = await fetch(`${API}${p}`);
  if (!res.ok) throw new Error(`${p} -> HTTP ${res.status}`);
  return res.json();
}

function uniqueSlugFrom(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; n < 500; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

async function main() {
  const [attrNote] = await db
    .select({ id: entries.id })
    .from(entries)
    .where(sql`lower(${entries.name}) = lower(${ATTRIBUTION_NOTE}) and ${entries.archivedAt} is null`)
    .limit(1);
  if (!attrNote) {
    console.error(
      `\n  "${ATTRIBUTION_NOTE}" note not found. Run scripts/add-srd-attribution-note.ts --apply first.\n`,
    );
    process.exit(1);
  }

  const existingRows = await db.select({ slug: entries.slug }).from(entries);
  const takenSlugs = new Set(existingRows.map((r) => r.slug));

  console.log("  fetching monster list…");
  const list = await fetchJson("/api/2014/monsters");
  console.log(`  ${list.count} monsters in the SRD index`);

  type Plan = {
    slug: string;
    name: string;
    summary: string;
    body: string;
    fields: Record<string, string>;
    tags: string[];
  };
  const plan: Plan[] = [];
  const skipped: string[] = [];

  for (let i = 0; i < list.results.length; i++) {
    const ref = list.results[i];
    const base = slugify(ref.name);
    if (takenSlugs.has(base)) {
      skipped.push(ref.name);
      continue;
    }
    const slug = uniqueSlugFrom(base, takenSlugs);
    takenSlugs.add(slug);

    const m = await fetchJson(ref.url);
    const cr = crText(m.challenge_rating);
    plan.push({
      slug,
      name: m.name,
      summary: `${typeLine(m)}. Challenge ${cr} (${m.xp ?? 0} XP).`,
      body: `*Reproduced from the [[${ATTRIBUTION_NOTE}]], © Wizards of the Coast LLC, used under CC BY 4.0.*`,
      fields: {
        cr,
        type: typeLine(m),
        statblock: buildStatblock(m),
      },
      tags: ["SRD 5.1", (m.type ?? "").replace(/^\w/, (c: string) => c.toUpperCase())].filter(Boolean),
    });

    if ((i + 1) % 40 === 0) console.log(`    …${i + 1}/${list.results.length}`);
    await new Promise((r) => setTimeout(r, 60));
  }

  console.log(`\n  to create : ${plan.length}`);
  console.log(`  skipped   : ${skipped.length} (slug already exists)${skipped.length ? " -> " + skipped.join(", ") : ""}`);
  console.log("\n  samples:");
  for (const p of plan.slice(0, 2)) {
    console.log(`\n  === ${p.name} (${p.slug}) ===`);
    console.log(`  summary: ${p.summary}`);
    console.log(`  tags: ${p.tags.join(", ")}`);
    console.log(p.fields.statblock);
  }

  if (!APPLY) {
    console.log("\n  Dry run. Re-run with --apply to write these entries.\n");
    return;
  }

  const CHUNK = 50;
  let created = 0;
  for (let i = 0; i < plan.length; i += CHUNK) {
    const batch = plan.slice(i, i + CHUNK);
    const rows = await db
      .insert(entries)
      .values(
        batch.map((p) => ({
          slug: p.slug,
          kind: "creature" as const,
          name: p.name,
          summary: p.summary,
          body: p.body,
          fields: p.fields,
          tags: p.tags,
          visibility: "public" as const,
        })),
      )
      .returning({ id: entries.id, name: entries.name });
    created += rows.length;

    // Every entry links to the shared attribution note.
    await db
      .insert(links)
      .values(rows.map((r) => ({ sourceId: r.id, targetId: attrNote.id, relation: "mentions" })))
      .onConflictDoNothing();
  }

  console.log(`\n  Created ${created} creature entries, all linked to the attribution note.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
