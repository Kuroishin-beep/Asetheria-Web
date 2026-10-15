/**
 * Inline secret blocks: the pure part (no database).
 *
 * A DM writes a secret passage in the editor as
 *
 *     :::secret
 *     The baker is a spy for Hellenoria.
 *     :::
 *
 * On save the text of each block is moved into the `entry_secrets` table and the
 * page body keeps only an inert marker line, `{{§<uuid>}}`. The body that every
 * player-facing path reads (search, embeddings, links, snippets, summaries) therefore
 * never holds a secret. This module turns the editor's inline form into body plus
 * blocks, and back, and strips markers from text that must not show them.
 */

export const SECRET_LIMITS = {
  /** Secret blocks on one page. */
  maxBlocks: 50,
  /** Characters in one block. */
  maxChars: 20_000,
} as const;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** A marker is a line of its own. The glyph keeps the word "secret" out of the search index. */
const MARKER_LINE = new RegExp(`^[ \\t]*\\{\\{§(${UUID})\\}\\}[ \\t]*$`, "i");
const MARKER_GLOBAL = new RegExp(`^[ \\t]*\\{\\{§${UUID}\\}\\}[ \\t]*(?:\\r?\\n|$)`, "gim");
const OPEN_FENCE = new RegExp(`^:::secret(?:[ \\t]+(${UUID}))?$`, "i");

export function marker(id: string): string {
  return `{{§${id}}}`;
}

export type Segment = { type: "text"; text: string } | { type: "block"; id: string | null; text: string; line: number };

export type SplitResult = { ok: true; segments: Segment[] } | { ok: false; error: string; line: number };

/** Lines that open or close a code fence (``` or ~~~); a secret fence inside code is just text. */
function isCodeFence(trimmed: string): boolean {
  return /^(```|~~~)/.test(trimmed);
}

/**
 * Splits the editor's inline form into plain text and secret blocks.
 * Refuses (with a plain message and the line) anything ambiguous: a nested block, a block with no
 * end, an end with no start, an empty block, a malformed opening line, too many or too long blocks.
 */
export function splitInline(inline: string): SplitResult {
  const lines = inline.split(/\r?\n/);
  const segments: Segment[] = [];
  let text: string[] = [];
  let block: { id: string | null; line: number; lines: string[] } | null = null;
  let inCode = false;
  let blocks = 0;

  const flushText = () => {
    // Whitespace on its own between blocks carries nothing worth keeping.
    const joined = text.join("\n");
    if (joined.trim().length > 0) segments.push({ type: "text", text: joined });
    text = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    const lineNo = i + 1;

    if (isCodeFence(trimmed)) inCode = !inCode;
    if (inCode || isCodeFence(trimmed)) {
      (block ? block.lines : text).push(raw);
      continue;
    }

    if (/^:::\s*secret/i.test(trimmed)) {
      const open = OPEN_FENCE.exec(trimmed);
      if (!open) return { ok: false, error: `Line ${lineNo}: write the start of a secret block as :::secret on a line of its own.`, line: lineNo };
      if (block) return { ok: false, error: `Line ${lineNo}: secret blocks cannot be nested. Close the block that started on line ${block.line} first.`, line: lineNo };
      flushText();
      block = { id: open[1]?.toLowerCase() ?? null, line: lineNo, lines: [] };
      continue;
    }

    if (trimmed === ":::") {
      if (!block) return { ok: false, error: `Line ${lineNo}: this ::: closes a secret block, but none was opened.`, line: lineNo };
      const body = block.lines.join("\n").trim();
      if (body.length === 0) return { ok: false, error: `Line ${block.line}: this secret block is empty. Write something in it or remove it.`, line: block.line };
      if (body.length > SECRET_LIMITS.maxChars) {
        return { ok: false, error: `Line ${block.line}: this secret block is ${body.length.toLocaleString("en")} characters; the limit is ${SECRET_LIMITS.maxChars.toLocaleString("en")}.`, line: block.line };
      }
      blocks++;
      if (blocks > SECRET_LIMITS.maxBlocks) return { ok: false, error: `A page can hold at most ${SECRET_LIMITS.maxBlocks} secret blocks.`, line: block.line };
      segments.push({ type: "block", id: block.id, text: body, line: block.line });
      block = null;
      continue;
    }

    (block ? block.lines : text).push(raw);
  }

  if (block) return { ok: false, error: `Line ${block.line}: this secret block never ends. Close it with ::: on a line of its own.`, line: block.line };
  flushText();
  return { ok: true, segments };
}

/** Builds the stored body: text as written, each block replaced by its marker on a line of its own. */
export function buildBody(segments: Segment[], idOf: (index: number) => string): string {
  const parts: string[] = [];
  let n = 0;
  for (const s of segments) {
    if (s.type === "text") parts.push(s.text);
    else parts.push(`\n${marker(idOf(n++))}\n`);
  }
  return parts.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "");
}

/** Marker ids in the order they appear. */
export function markerIds(body: string): string[] {
  const ids: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    const m = MARKER_LINE.exec(line);
    if (m) ids.push(m[1].toLowerCase());
  }
  return ids;
}

export function hasMarkers(body: string): boolean {
  return markerIds(body).length > 0;
}

/** Removes marker lines. Applied wherever body text is used and a marker would only be noise or a hint. */
export function stripMarkers(text: string): string {
  return text.replace(MARKER_GLOBAL, "");
}

/** The editor's inline form: each marker replaced by its block; a marker with no block is dropped. */
export function inlineBody(body: string, textById: Map<string, string>): string {
  const out: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    const m = MARKER_LINE.exec(line);
    if (!m) {
      out.push(line);
      continue;
    }
    const id = m[1].toLowerCase();
    const text = textById.get(id);
    if (text !== undefined) out.push(`:::secret ${id}`, text, ":::");
  }
  return out.join("\n");
}

export type BodyPart = { type: "text"; text: string } | { type: "secret"; id: string };

/** Splits a stored body at its markers, for rendering text and secret blocks in order. */
export function splitAtMarkers(body: string): BodyPart[] {
  const parts: BodyPart[] = [];
  let buffer: string[] = [];
  const flush = () => {
    if (buffer.length > 0) parts.push({ type: "text", text: buffer.join("\n") });
    buffer = [];
  };
  for (const line of body.split(/\r?\n/)) {
    const m = MARKER_LINE.exec(line);
    if (m) {
      flush();
      parts.push({ type: "secret", id: m[1].toLowerCase() });
    } else buffer.push(line);
  }
  flush();
  return parts;
}

export function isSecretId(value: string): boolean {
  return new RegExp(`^${UUID}$`, "i").test(value);
}
