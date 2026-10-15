/**
 * The rules for linking a character to the world, with no database and no server: the limits, how a worship
 * line is split so each god named in it can be linked, and what a journal entry or a sharing change may contain.
 * The server runs the same functions, so a browser can never get past them.
 */

export const WORLD_LIMITS = {
  /** Journal entries one character may hold. */
  journalEntries: 200,
  journalTitle: 120,
  journalBody: 4000,
  /** Characters the party roster shows (the most recently changed). */
  roster: 100,
} as const;

export type WorshipPart = { text: string; href: string | null };

const isWordChar = (ch: string | undefined) => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);

/**
 * Finds the gods named in a worship line so each can link to its page. `links` maps a god's name, in lower case,
 * to its address. A god is found wherever its whole name appears (any letter case, not inside a longer word), the
 * longest name first, so "Adamus, The Earth Keeper" is one god even though a comma is in it. The pieces joined
 * together are exactly the original line: separators and everything else stay plain text.
 */
export function linkWorship(text: string, links: ReadonlyMap<string, string>): WorshipPart[] {
  const names = [...links.keys()].filter((n) => n.length > 0).sort((a, b) => b.length - a.length);
  const lower = text.toLowerCase();
  const out: WorshipPart[] = [];
  let plain = "";
  let i = 0;
  while (i < text.length) {
    let hit: string | null = null;
    // A god's name can only begin at the start of a word.
    if (!isWordChar(text[i - 1]) && isWordChar(text[i])) {
      hit = names.find((n) => lower.startsWith(n, i) && !isWordChar(text[i + n.length])) ?? null;
    }
    if (hit) {
      if (plain) out.push({ text: plain, href: null });
      plain = "";
      out.push({ text: text.slice(i, i + hit.length), href: links.get(hit) ?? null });
      i += hit.length;
    } else {
      plain += text[i];
      i++;
    }
  }
  if (plain) out.push({ text: plain, href: null });
  return out;
}

export type JournalInput = { title: string; body: string };

/** A journal entry as it will be stored (trimmed), or the reasons it cannot be. */
export function checkJournalEntry(raw: unknown): { ok: true; value: JournalInput } | { ok: false; problems: string[] } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, problems: ["Send the entry as an object with a title and a body."] };
  const problems: string[] = [];
  const o = raw as Record<string, unknown>;
  for (const key of Object.keys(o)) if (key !== "title" && key !== "body") problems.push(`"${key}" is not part of a journal entry.`);
  const title = o.title === undefined ? "" : o.title;
  if (typeof title !== "string") problems.push("The title must be text.");
  if (typeof o.body !== "string") problems.push("The entry needs some text.");
  if (problems.length > 0) return { ok: false, problems };
  const t = (title as string).trim();
  const b = (o.body as string).trim();
  if ([...t].length > WORLD_LIMITS.journalTitle) problems.push(`The title can be at most ${WORLD_LIMITS.journalTitle} characters.`);
  if (b.length === 0) problems.push("The entry needs some text.");
  if ([...b].length > WORLD_LIMITS.journalBody) problems.push(`An entry can be at most ${WORLD_LIMITS.journalBody} characters.`);
  return problems.length > 0 ? { ok: false, problems } : { ok: true, value: { title: t, body: b } };
}

export type WorldPatch = { shared?: boolean; homeSlug?: string | null };

/** What the owner may change about how a character sits in the world: sharing and home, and nothing else. */
export function checkWorldPatch(raw: unknown): { ok: true; value: WorldPatch } | { ok: false; problems: string[] } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, problems: ["Send an object with shared and/or homeSlug."] };
  const o = raw as Record<string, unknown>;
  const problems: string[] = [];
  for (const key of Object.keys(o)) if (key !== "shared" && key !== "homeSlug") problems.push(`"${key}" cannot be changed here.`);
  const value: WorldPatch = {};
  if ("shared" in o) {
    if (typeof o.shared === "boolean") value.shared = o.shared;
    else problems.push("shared must be true or false.");
  }
  if ("homeSlug" in o) {
    if (o.homeSlug === null) value.homeSlug = null;
    else if (typeof o.homeSlug === "string" && o.homeSlug.length >= 1 && o.homeSlug.length <= 200) value.homeSlug = o.homeSlug;
    else problems.push("homeSlug must be a page address or null.");
  }
  if (problems.length === 0 && Object.keys(value).length === 0) problems.push("Nothing to change.");
  return problems.length > 0 ? { ok: false, problems } : { ok: true, value };
}
