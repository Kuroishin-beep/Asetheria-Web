/**
 * Builds the entry graph that powers backlinks ("Linked mentions").
 *
 * Two sources of edges:
 *  1. Explicit `[[Wiki Links]]` typed into a body.
 *  2. Structured properties that name another entry (an organization's patron
 *     deity, an NPC's home city, and so on).
 *
 * Bare prose mentions are deliberately *not* auto-linked below a length
 * threshold — matching short names like "Books" against every body produces
 * noise that buries the real connections.
 */

const MIN_AUTO_LINK_LENGTH = 6;

/** Property keys whose values name other entries. */
const RELATION_FIELDS: Record<string, string> = {
  dedicatedTo: "dedicated-to",
  location: "located-in",
  factions: "member-of",
  gods: "worships",
  pantheon: "belongs-to",
  questGiver: "given-by",
  ruler: "ruled-by",
  capital: "capital-is",
  region: "located-in",
  organization: "part-of",
};

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/['‘’.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Deities are titled "Bacchus, The Bountiful Spirit" but referred to elsewhere
 * as just "Bacchus" — an organization's patron, an NPC's god. Without the short
 * form those references never resolve and the backlinks stay empty.
 */
export function nameAliases(name: string): string[] {
  const out: string[] = [];
  // Everything before the first comma or sentence-style separator.
  const head = name.split(/[,;:]|\.\s|\s+[-–—]\s+/)[0]?.trim();
  if (head && head.length >= 3 && head !== name) out.push(head);
  // "Vesta. The Guardian…" — a period with no space after the epithet marker.
  const dotted = name.match(/^([^.]{3,})\.\s*The\s/i);
  if (dotted) out.push(dotted[1].trim());
  // Drop a leading article: "The Obsidian Phalanx" -> "Obsidian Phalanx".
  const article = name.match(/^The\s+(.{4,})$/i);
  if (article) out.push(article[1].trim());
  return [...new Set(out)];
}

/**
 * Maps every name and alias to an entry id. Full names are registered first so
 * an alias can never shadow a real entry title.
 */
export function buildNameIndex(
  entries: { id: string; name: string }[],
): Map<string, string> {
  const index = new Map<string, string>();
  for (const e of entries) index.set(normalizeName(e.name), e.id);

  // Aliases claimed by more than one entry are ambiguous, so they're dropped
  // rather than guessed at.
  const aliasOwners = new Map<string, Set<string>>();
  for (const e of entries) {
    for (const alias of nameAliases(e.name)) {
      const key = normalizeName(alias);
      if (!key || index.has(key)) continue;
      if (!aliasOwners.has(key)) aliasOwners.set(key, new Set());
      aliasOwners.get(key)!.add(e.id);
    }
  }
  for (const [key, owners] of aliasOwners) {
    if (owners.size === 1) index.set(key, [...owners][0]);
  }
  return index;
}

/** Pulls `[[Target]]` and `[[Target|label]]` out of a markdown body. */
export function extractWikiLinks(body: string): string[] {
  const out: string[] = [];
  const re = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const name = m[1].trim();
    if (name) out.push(name);
  }
  return out;
}

export type LinkTarget = {
  targetId: string;
  relation: string;
  /** The sentence the reference appeared in, when it came from prose. */
  context?: string | null;
};

/**
 * Pulls the sentence around a match so a backlink can quote the source.
 * Markdown syntax is stripped — this is read, not re-rendered.
 */
export function extractContext(
  body: string,
  index: number,
  length: number,
  max = 260,
): string | null {
  const before = body.slice(0, index);
  const after = body.slice(index + length);

  const startBreak = Math.max(
    before.lastIndexOf(". "),
    before.lastIndexOf("\n"),
    before.lastIndexOf("! "),
    before.lastIndexOf("? "),
  );
  const start = startBreak === -1 ? 0 : startBreak + 1;

  const endCandidates = [
    after.indexOf(". "),
    after.indexOf("\n"),
    after.indexOf("! "),
    after.indexOf("? "),
  ].filter((n) => n !== -1);
  const end =
    index + length + (endCandidates.length ? Math.min(...endCandidates) + 1 : after.length);

  let snippet = body.slice(start, end).trim();
  snippet = snippet
    .replace(/^[#>\-*\s]+/, "")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_m, a, b) => b || a)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/^["“”'‘’]+|["“”'‘’]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // A page that is just a list of names yields a "quote" that repeats the name
  // and says nothing. Only keep context that adds surrounding sentence.
  if (snippet.length < length + 20) return null;

  if (snippet.length > max) snippet = snippet.slice(0, max - 1).trimEnd() + "…";
  return snippet;
}

/**
 * Resolves every outgoing edge for one entry.
 * `nameIndex` maps a normalized name to an entry id.
 */
export function resolveLinks(
  selfId: string,
  body: string,
  fields: Record<string, string>,
  nameIndex: Map<string, string>,
): LinkTarget[] {
  const seen = new Set<string>();
  const out: LinkTarget[] = [];

  const push = (targetId: string, relation: string, context?: string | null) => {
    if (targetId === selfId) return;
    const key = `${targetId}:${relation}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ targetId, relation, context: context ?? null });
  };

  // Walk the wiki-links with positions so each one can quote its sentence.
  const wikiRe = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
  let wm: RegExpExecArray | null;
  while ((wm = wikiRe.exec(body)) !== null) {
    const id = nameIndex.get(normalizeName(wm[1].trim()));
    if (id) push(id, "mentions", extractContext(body, wm.index, wm[0].length));
  }

  for (const [key, relation] of Object.entries(RELATION_FIELDS)) {
    const value = fields[key];
    if (!value) continue;
    // Properties are often comma-separated lists of names.
    for (const part of value.split(",")) {
      const id = nameIndex.get(normalizeName(part));
      if (id) push(id, relation);
    }
  }

  return out;
}

/**
 * Scans a body for plain-text mentions of other entries. Used at seed time to
 * bootstrap the graph from prose that predates wiki-link syntax.
 */
/**
 * Names too generic to auto-link on. Matching these against every body produces
 * noise that buries real connections.
 */
const STOP_NAMES = new Set([
  "introduction", "information", "notable", "notables", "triggers", "overview",
  "summary", "details", "background", "history", "general", "military",
  "location", "locations", "lore", "quests", "books", "games", "loots",
  "systems", "factions", "pantheons", "tools", "banking", "banks", "nomad",
  "the truth", "the continent", "middle city", "lower city", "upper streets",
]);

export function resolveProseMentions(
  selfId: string,
  body: string,
  entries: { id: string; name: string }[],
  existing: Set<string>,
): LinkTarget[] {
  if (!body.trim()) return [];
  const haystack = body.toLowerCase();
  const out: LinkTarget[] = [];

  for (const e of entries) {
    if (e.id === selfId) continue;
    if (e.name.length < MIN_AUTO_LINK_LENGTH) continue;
    if (STOP_NAMES.has(normalizeName(e.name))) continue;

    // Try the full title first, then its short form ("Bacchus" for
    // "Bacchus, The Bountiful Spirit"), so prose that uses the familiar name
    // still connects.
    const candidates = [e.name, ...nameAliases(e.name)].filter(
      (c) => c.length >= MIN_AUTO_LINK_LENGTH && !STOP_NAMES.has(normalizeName(c)),
    );

    for (const candidate of candidates) {
      const needle = candidate.toLowerCase();
      if (!haystack.includes(needle)) continue;
      // Require word boundaries so "Aeterna" doesn't match inside "Aeternal".
      const re = new RegExp(
        `(^|[^\\p{L}\\p{N}])(${escapeRegExp(needle)})([^\\p{L}\\p{N}]|$)`,
        "u",
      );
      const m = re.exec(haystack);
      if (!m) continue;
      const key = `${e.id}:mentions`;
      if (existing.has(key)) break;
      existing.add(key);
      const at = m.index + m[1].length;
      out.push({
        targetId: e.id,
        relation: "mentions",
        context: extractContext(body, at, candidate.length),
      });
      break;
    }
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function slugify(input: string): string {
  const s = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['‘’]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "entry";
}
