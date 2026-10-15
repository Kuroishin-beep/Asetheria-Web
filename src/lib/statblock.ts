/**
 * Stat blocks: reading the standard 5e layout a DM writes into a page's `statblock` field, checking it, and
 * working out the numbers that follow from it (ability modifiers, proficiency bonus).
 *
 *     **Armor Class** 16 (natural)
 *     **Hit Points** 152 (16d10 + 64)
 *     **Speed** 40 ft.
 *
 *     STR 22 (+6)   DEX 12 (+1)   CON 19 (+4)   INT 9 (-1)   WIS 14 (+2)   CHA 15 (+2)
 *
 *     **Senses** darkvision 120 ft., passive Perception 12
 *     **Challenge** 8 (3,900 XP)
 *
 *     ### Traits
 *     ...
 *
 * Text that does not look like a stat block (a few notes, "AC 17 | CR 5") is left alone and shown as it is.
 * No game text is held here: only the layout and the arithmetic.
 */

export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type Ability = (typeof ABILITIES)[number];

export const AC_RANGE = { min: 0, max: 40 } as const;
export const HP_RANGE = { min: 1, max: 10_000 } as const;
export const SCORE_RANGE = { min: 1, max: 30 } as const;

/** Challenge ratings 5e uses: 0, the three fractions, then 1 to 30. */
export const VALID_CR: readonly string[] = ["0", "1/8", "1/4", "1/2", ...Array.from({ length: 30 }, (_, i) => String(i + 1))];

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : `−${Math.abs(mod)}`;
}

/** Proficiency bonus by challenge rating (+2 up to CR 4, one more every four ratings after that). */
export function proficiencyForCr(cr: string): number | null {
  if (!VALID_CR.includes(cr)) return null;
  const n = cr.includes("/") ? 0 : Number(cr);
  return 2 + Math.floor(Math.max(0, n - 1) / 4);
}

export type Statblock = {
  ac: { value: number; note: string } | null;
  hp: { value: number; formula: string } | null;
  speed: string;
  abilities: Record<Ability, { score: number; written: number | null }> | null;
  /** Saving throws, skills, resistances, senses, languages... in the order written. */
  properties: { label: string; value: string }[];
  challenge: { cr: string; xp: string } | null;
  proficiency: number | null;
  /** Everything after the header lines, as Markdown (traits, actions...). */
  body: string;
  warnings: string[];
};

export type StatblockResult = { kind: "free" } | { kind: "block"; block: Statblock; errors: string[] };

const ABILITY_RE = /\b(STR|DEX|CON|INT|WIS|CHA)\s+(\d+)\s*(?:\(\s*([+\-−–]?\s*\d+)\s*\))?/gi;
const PROPERTY_RE = /^\*\*([^*]+?)\*\*\s*(.*)$/;

/** True when the text has an Armor Class line or an ability line: the marks of a stat block. */
export function looksLikeStatblock(text: string): boolean {
  return /^\s*\*\*Armor Class\*\*/im.test(text) || new RegExp(ABILITY_RE.source, "i").test(text);
}

function toInt(raw: string): number | null {
  const m = /^\s*(\d{1,6})\b/.exec(raw);
  return m ? Number(m[1]) : null;
}

function signed(raw: string): number {
  return Number(raw.replace(/[−–]/g, "-").replace(/\s+/g, ""));
}

export function parseStatblock(text: string): StatblockResult {
  if (!text.trim() || !looksLikeStatblock(text)) return { kind: "free" };

  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const errors: string[] = [];
  const warnings: string[] = [];
  const block: Statblock = { ac: null, hp: null, speed: "", abilities: null, properties: [], challenge: null, proficiency: null, body: "", warnings };

  let i = 0;
  let abilitiesSeen = false;
  for (; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === "") continue;
    if (/^#{1,6}\s/.test(trimmed)) break; // the first heading starts the body

    const hits = [...trimmed.matchAll(ABILITY_RE)];
    if (hits.length >= 3 && !trimmed.startsWith("**")) {
      if (abilitiesSeen) {
        warnings.push("The ability scores appear twice; the first line is used.");
        continue;
      }
      abilitiesSeen = true;
      const found: Partial<Record<Ability, { score: number; written: number | null }>> = {};
      for (const h of hits) {
        const key = h[1].toLowerCase() as Ability;
        if (found[key]) continue;
        found[key] = { score: Number(h[2]), written: h[3] ? signed(h[3]) : null };
      }
      const missing = ABILITIES.filter((a) => !found[a]);
      if (missing.length > 0) errors.push(`The ability line is missing ${missing.map((a) => a.toUpperCase()).join(", ")}. Write all six: STR 10 (+0) DEX 10 (+0) CON 10 (+0) INT 10 (+0) WIS 10 (+0) CHA 10 (+0).`);
      else block.abilities = found as Statblock["abilities"];
      continue;
    }

    const prop = PROPERTY_RE.exec(trimmed);
    // A bold name ending in a full stop is a trait or action, which belongs to the body.
    if (prop && !prop[1].trim().endsWith(".")) {
      const label = prop[1].trim();
      const value = prop[2].trim();
      const key = label.toLowerCase();
      if (key === "armor class") {
        const v = toInt(value);
        block.ac = v === null ? null : { value: v, note: value.replace(/^\s*\d+\s*/, "").trim() };
        if (v === null) errors.push("Armor Class must start with a number, for example: **Armor Class** 15 (chain shirt).");
      } else if (key === "hit points") {
        const v = toInt(value);
        block.hp = v === null ? null : { value: v, formula: value.replace(/^\s*\d+\s*/, "").trim() };
        if (v === null) errors.push("Hit Points must start with a number, for example: **Hit Points** 27 (5d8 + 5).");
      } else if (key === "speed") block.speed = value;
      else if (key === "challenge") {
        const m = /^\s*(\d+\/\d+|\d+)(?=\s|\(|$)\s*(?:\(\s*([\d,.\s]+)\s*XP\s*\))?/i.exec(value);
        block.challenge = m ? { cr: m[1], xp: (m[2] ?? "").trim() } : null;
      } else if (key === "proficiency bonus") {
        // Worked out from the challenge rating; a written one is only compared.
        block.properties.push({ label, value });
      } else block.properties.push({ label, value });
      continue;
    }
    break; // some other text: the body starts here
  }
  block.body = lines.slice(i).join("\n").trim();

  // ---- Checks that refuse the save ----
  if (!block.ac && !errors.some((e) => e.startsWith("Armor Class"))) errors.push("Add an Armor Class line, for example: **Armor Class** 15 (chain shirt).");
  else if (block.ac && (block.ac.value < AC_RANGE.min || block.ac.value > AC_RANGE.max)) errors.push(`Armor Class must be from ${AC_RANGE.min} to ${AC_RANGE.max}.`);
  if (!block.hp && !errors.some((e) => e.startsWith("Hit Points"))) errors.push("Add a Hit Points line, for example: **Hit Points** 27 (5d8 + 5).");
  else if (block.hp && (block.hp.value < HP_RANGE.min || block.hp.value > HP_RANGE.max)) errors.push(`Hit Points must be from ${HP_RANGE.min} to ${HP_RANGE.max.toLocaleString("en")}.`);
  if (!block.abilities && !errors.some((e) => e.startsWith("The ability line"))) errors.push("Add the six ability scores on one line: STR 10 (+0) DEX 10 (+0) CON 10 (+0) INT 10 (+0) WIS 10 (+0) CHA 10 (+0).");
  if (block.abilities) {
    for (const a of ABILITIES) {
      const { score, written } = block.abilities[a];
      if (score < SCORE_RANGE.min || score > SCORE_RANGE.max) errors.push(`${a.toUpperCase()} must be from ${SCORE_RANGE.min} to ${SCORE_RANGE.max} (it says ${score}).`);
      else if (written !== null && written !== abilityModifier(score)) warnings.push(`${a.toUpperCase()} ${score} should be ${formatModifier(abilityModifier(score))}, not ${formatModifier(written)}. The page shows the correct one.`);
    }
  }
  if (!block.challenge || !VALID_CR.includes(block.challenge.cr)) errors.push("Add a Challenge line with a valid rating (0, 1/8, 1/4, 1/2, or a whole number up to 30), for example: **Challenge** 3 (700 XP).");
  else block.proficiency = proficiencyForCr(block.challenge.cr);

  return { kind: "block", block, errors };
}

/** What a stat block is refused for when a page is saved, or null. Free text and valid blocks pass. */
export function statblockProblem(text: string): string | null {
  const r = parseStatblock(text);
  if (r.kind === "free" || r.errors.length === 0) return null;
  return `The stat block can't be saved yet. ${r.errors.join(" ")}`;
}

/** A blank stat block in the standard layout for the DM to fill in. */
export const STATBLOCK_SKELETON = `**Armor Class** 12
**Hit Points** 10 (3d6)
**Speed** 30 ft.

STR 10 (+0)   DEX 10 (+0)   CON 10 (+0)   INT 10 (+0)   WIS 10 (+0)   CHA 10 (+0)

**Senses** passive Perception 10
**Languages** Common
**Challenge** 1/4 (50 XP)

### Traits

### Actions

**Strike.** *Melee Weapon Attack:* +2 to hit, reach 5 ft., one target. *Hit:* 4 (1d6 + 1) damage.
`;
