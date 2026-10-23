import { ABILITIES, CHARACTER_LIMITS } from "@/lib/character/house-rules";
import { CLASSES, type SkillId } from "@/lib/character/srd";
import { CREATURE_SIZES, IMPORTED_METHOD, abilityModifier, type CharacterInput, type Scores } from "@/lib/character/engine";

/**
 * Turns a Foundry VTT dnd5e (v5) player character into a creator `CharacterInput`
 * with `method: "imported"`. Pure: the caller reads Foundry's LevelDB and the
 * database; this only maps one actor and its embedded items.
 *
 * What is kept: final ability scores, every skill proficiency, class and level,
 * subclass, heritage (name, speed, size), background, armour class worked out
 * the way Foundry's default calculation does, maximum hit points, the written
 * biography and personality, languages, feats, spells and gear (names only).
 */

type Rec = Record<string, unknown>;

export type FoundryItem = { _id?: string; name: string; type: string; system?: Rec; effects?: Rec[] };
export type FoundryActor = { _id: string; name: string; type: string; system: Rec; items: FoundryItem[] };

const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const sys = (item: FoundryItem) => rec(item.system);
/** dnd5e keeps some collections as arrays and older ones as id-keyed objects. */
const list = (v: unknown): Rec[] => (Array.isArray(v) ? v : Object.values(rec(v))).map(rec);

/** dnd5e's three-letter skill keys. */
export const FOUNDRY_SKILLS: Record<string, SkillId> = {
  acr: "acrobatics", ani: "animal-handling", arc: "arcana", ath: "athletics", dec: "deception", his: "history",
  ins: "insight", itm: "intimidation", inv: "investigation", med: "medicine", nat: "nature", prc: "perception",
  prf: "performance", per: "persuasion", rel: "religion", slt: "sleight-of-hand", ste: "stealth", sur: "survival",
};

const SIZES: Record<string, (typeof CREATURE_SIZES)[number]> = { tiny: "Tiny", sm: "Small", med: "Medium", lg: "Large" };

const ORDINAL = ["Cantrips", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];

export class FoundryImportError extends Error {}

/** Strips Foundry's editor HTML down to readable plain text with paragraph breaks. */
export function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&mdash;/g, "—")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Keeps a text field within the creator's limit, cutting at a word and saying so. */
export function fit(text: string, max: number = CHARACTER_LIMITS.maxTextLength): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 2);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 200))} …`;
}

export function finalScores(actor: FoundryActor): Scores {
  const abilities = rec(actor.system.abilities);
  const out = {} as Scores;
  for (const a of ABILITIES) {
    const v = num(rec(abilities[a]).value);
    if (v === null) throw new FoundryImportError(`${actor.name}: no ${a.toUpperCase()} score`);
    out[a] = v;
  }
  return out;
}

export function proficientSkills(actor: FoundryActor): SkillId[] {
  const skills = rec(actor.system.skills);
  return Object.entries(FOUNDRY_SKILLS)
    .filter(([key]) => (num(rec(skills[key]).value) ?? 0) >= 1)
    .map(([, id]) => id);
}

/** The highest-level class item; others (multiclass) are named in the concept. */
export function mainClass(actor: FoundryActor): { item: FoundryItem; id: string; level: number; others: string[] } {
  const classes = actor.items.filter((i) => i.type === "class").map((item) => ({ item, level: num(sys(item).levels) ?? 1 }));
  if (classes.length === 0) throw new FoundryImportError(`${actor.name}: no class`);
  classes.sort((a, b) => b.level - a.level);
  const top = classes[0];
  const id = (str(sys(top.item).identifier) || top.item.name).toLowerCase();
  if (!CLASSES.some((c) => c.id === id)) throw new FoundryImportError(`${actor.name}: class "${top.item.name}" is not one the sheet knows`);
  return { item: top.item, id, level: classes.reduce((s, c) => s + c.level, 0), others: classes.slice(1).map((c) => `${c.item.name} ${c.level}`) };
}

/** Maximum hit points: Foundry's own maximum when set, else its per-level record plus CON. */
export function maxHitPoints(actor: FoundryActor, conScore: number): number {
  const hp = rec(rec(actor.system.attributes).hp);
  const stated = num(hp.max);
  if (stated !== null && stated > 0) return stated;
  const conMod = abilityModifier(conScore);
  let total = 0;
  let levels = 0;
  for (const item of actor.items.filter((i) => i.type === "class")) {
    const die = num(str(sys(item).hitDice).replace(/^d/, "")) ?? num(str(rec(sys(item).hd).denomination).replace(/^d/, "")) ?? 8;
    const record = list(sys(item).advancement).find((a) => a.type === "HitPoints");
    for (const v of Object.values(rec(record?.value))) {
      total += v === "max" ? die : v === "avg" ? Math.floor(die / 2) + 1 : num(v) ?? 0;
      levels += 1;
    }
  }
  const bonuses = rec(hp.bonuses);
  const computed = total + levels * (conMod + (num(bonuses.level) ?? 0)) + (num(bonuses.overall) ?? 0);
  // Current hit points never sit above the maximum, so a larger current value means the record is incomplete.
  return Math.max(computed, num(hp.value) ?? 0, 1);
}

/** Foundry's AC: the formula an item effect sets, else equipped armour + DEX (capped by weight), plus an equipped shield. */
export function armorClass(actor: FoundryActor, scores: Scores): number {
  const ac = rec(rec(actor.system.attributes).ac);
  const dex = abilityModifier(scores.dex);
  const calc = effectOverride(actor, "system.attributes.ac.calc") ?? (str(ac.calc) || "default");
  const flat = num(ac.flat);
  if ((calc === "flat" || calc === "natural") && flat !== null) return flat;
  if (calc === "unarmoredBarb") return 10 + dex + abilityModifier(scores.con) + shieldBonus(actor);
  if (calc === "unarmoredMonk") return 10 + dex + abilityModifier(scores.wis);
  if (calc === "mage") return 13 + dex + shieldBonus(actor);
  const armour = equipped(actor).find((i) => ["light", "medium", "heavy"].includes(str(rec(sys(i).type).value)));
  if (!armour) return 10 + dex + shieldBonus(actor);
  const a = rec(sys(armour).armor);
  const weight = str(rec(sys(armour).type).value);
  const cap = num(a.dex) ?? (weight === "heavy" ? 0 : weight === "medium" ? 2 : null);
  const dexPart = cap === null ? dex : Math.min(dex, cap);
  return (num(a.value) ?? 10) + (num(a.magicalBonus) ?? 0) + dexPart + shieldBonus(actor);
}

const equipped = (actor: FoundryActor) => actor.items.filter((i) => i.type === "equipment" && sys(i).equipped === true);

function shieldBonus(actor: FoundryActor): number {
  const shield = equipped(actor).find((i) => str(rec(sys(i).type).value) === "shield");
  if (!shield) return 0;
  const a = rec(sys(shield).armor);
  return (num(a.value) ?? 2) + (num(a.magicalBonus) ?? 0);
}

/** The value an enabled, transferred item effect overrides `key` with (e.g. Unarmored Defense setting the AC formula). */
function effectOverride(actor: FoundryActor, key: string): string | null {
  for (const item of actor.items) {
    for (const effect of item.effects ?? []) {
      if (effect.disabled === true || effect.transfer === false) continue;
      // Foundry v14 moved an effect's changes under `system`; older worlds keep them at the top.
      for (const change of list(effect.changes ?? rec(effect.system).changes)) {
        if (change.key === key && str(change.value)) return str(change.value);
      }
    }
  }
  return null;
}

export function heritage(actor: FoundryActor): { name: string; speed: number; size: (typeof CREATURE_SIZES)[number] } {
  const race = actor.items.find((i) => i.type === "race");
  const move = rec(sys(race ?? { name: "", type: "" }).movement);
  const actorMove = rec(rec(actor.system.attributes).movement);
  const speed = num(move.walk) ?? num(actorMove.walk) ?? 30;
  const sizeAdv = list(race ? sys(race).advancement : []).find((a) => a.type === "Size");
  const sizeKey = str(rec(sizeAdv?.value).size) || str(rec(actor.system.traits).size) || "med";
  return { name: race?.name ?? "Unknown heritage", speed: Math.min(60, Math.max(10, speed)), size: SIZES[sizeKey] ?? "Medium" };
}

function names(actor: FoundryActor, types: string[], filter: (i: FoundryItem) => boolean = () => true): string[] {
  return actor.items
    .filter((i) => types.includes(i.type) && filter(i))
    .map((i) => {
      const q = num(sys(i).quantity) ?? 1;
      return q > 1 ? `${i.name} ×${q}` : i.name;
    })
    .sort((a, b) => a.localeCompare(b));
}

export function spellList(actor: FoundryActor): string {
  const byLevel = new Map<number, string[]>();
  for (const s of actor.items.filter((i) => i.type === "spell")) {
    const level = num(sys(s).level) ?? 0;
    byLevel.set(level, [...(byLevel.get(level) ?? []), s.name]);
  }
  return [...byLevel.entries()]
    .sort(([a], [b]) => a - b)
    .map(([level, list]) => `${ORDINAL[level] ?? `Level ${level}`}: ${[...new Set(list)].sort().join(", ")}`)
    .join("\n");
}

function languages(actor: FoundryActor): string[] {
  const value = rec(rec(actor.system.traits).languages).value;
  return (Array.isArray(value) ? value : []).map((l) => String(l)).map((l) => l.replace(/^.*:/, "")).map((l) => l.charAt(0).toUpperCase() + l.slice(1));
}

function appearance(actor: FoundryActor): string {
  const d = rec(actor.system.details);
  const facts = [
    str(d.age) && `Age ${str(d.age)}`,
    str(d.gender),
    str(d.height),
    str(d.weight),
    str(d.eyes) && `${str(d.eyes)} eyes`,
    str(d.hair) && `${str(d.hair)} hair`,
    str(d.skin) && `${str(d.skin)} skin`,
  ].filter(Boolean);
  return [facts.join(" · "), htmlToText(str(d.appearance))].filter(Boolean).join("\n\n");
}

export type FoundryPlayer = { username: string; actor: FoundryActor };

/** The whole mapping: one Foundry character to a creator input, ready for `validateAndDerive`. */
export function toCharacterInput({ username, actor }: FoundryPlayer, syncedAt: string): CharacterInput {
  const scores = finalScores(actor);
  const klass = mainClass(actor);
  const race = heritage(actor);
  const d = rec(actor.system.details);
  const subclass = actor.items.find((i) => i.type === "subclass")?.name;
  const background = actor.items.find((i) => i.type === "background")?.name ?? "";
  const feats = names(actor, ["feat"], (i) => str(rec(sys(i).type).value) === "feat");
  const langs = languages(actor);

  const concept = [
    `${klass.item.name} ${klass.level}${subclass ? ` (${subclass})` : ""}${klass.others.length ? `, also ${klass.others.join(", ")}` : ""}`,
    str(d.alignment),
    feats.length ? `Feats: ${feats.join(", ")}` : "",
    langs.length ? `Languages: ${langs.join(", ")}` : "",
  ].filter(Boolean).join(". ");

  const gear = [
    ["Weapons", names(actor, ["weapon"])],
    ["Armour and clothing", names(actor, ["equipment"])],
    ["Gear", names(actor, ["loot", "tool", "container", "backpack"])],
    ["Consumables", names(actor, ["consumable"])],
  ] as const;
  const spells = spellList(actor);
  const equipment = [...gear.filter(([, list]) => list.length).map(([title, list]) => `${title}: ${list.join(", ")}`), spells && `Spells\n${spells}`]
    .filter(Boolean)
    .join("\n\n");

  return {
    schemaVersion: 1,
    name: actor.name.slice(0, 80),
    playerName: username.slice(0, 80),
    concept: fit(concept),
    race: { raceId: "other", other: { name: race.name.slice(0, 80), bonuses: {}, speed: race.speed } },
    classId: klass.id,
    level: Math.min(CHARACTER_LIMITS.maxLevel, Math.max(CHARACTER_LIMITS.minLevel, klass.level)),
    backgroundName: background.slice(0, 80),
    backgroundSkills: [],
    classSkills: [],
    method: IMPORTED_METHOD,
    imported: { source: "foundry", sourceId: actor._id, scores, skills: proficientSkills(actor), size: race.size, syncedAt },
    hp: { mode: "manual", total: maxHitPoints(actor, scores.con) },
    armorClass: armorClass(actor, scores),
    equipment: fit(equipment),
    citizenship: "none",
    worship: fit(str(d.faith), 200),
    traits: fit(htmlToText(str(d.trait))),
    ideals: fit(htmlToText(str(d.ideal))),
    bonds: fit(htmlToText(str(d.bond))),
    flaws: fit(htmlToText(str(d.flaw))),
    appearance: fit(appearance(actor)),
    backstory: fit(htmlToText(str(rec(d.biography).value))),
  };
}

