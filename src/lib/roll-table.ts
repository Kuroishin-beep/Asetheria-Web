/**
 * Random tables as codex entries (`kind = "table"`).
 *
 * A table entry keeps its dice expression in `fields.dice` and its rows as a
 * Markdown table in `body`, so it is editable in the ordinary editor, shown by
 * the ordinary renderer, searchable, linkable and permissioned like any other
 * page:
 *
 *   | Roll | Result |
 *   |---|---|
 *   | 1-3 | A copper ring |
 *   | 4 | A \| pipe, escaped |
 *
 * This module is pure (no database, no framework) so the importer scripts, the
 * server actions, the roller UI and the tests all share one definition of what
 * a valid table is.
 */

export type RollRow = { min: number; max: number; result: string };

export type RollTableParse = {
  rows: RollRow[];
  /** Human-readable reasons the body is not a clean table. Empty when valid. */
  problems: string[];
};

/** Same grammar as `rollTableInputSchema.dice` in validation.ts. */
export const DICE_PATTERN = /^(\d{0,3})d(\d{1,4})(?:([+-])(\d{1,4}))?$/i;

/** Lowest and highest total a dice expression can produce, or null if unreadable. */
export function diceSpan(dice: string): { min: number; max: number } | null {
  const m = dice.trim().match(DICE_PATTERN);
  if (!m) return null;
  const count = m[1] ? parseInt(m[1], 10) : 1;
  const sides = parseInt(m[2], 10);
  if (count < 1 || sides < 2) return null;
  const modifier = m[3] ? (m[3] === "-" ? -1 : 1) * parseInt(m[4], 10) : 0;
  return { min: count + modifier, max: count * sides + modifier };
}

function escapeCell(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, "<br>");
}

function unescapeCell(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\" && (text[i + 1] === "|" || text[i + 1] === "\\")) {
      out += text[i + 1];
      i++;
    } else {
      out += ch;
    }
  }
  return out.replace(/<br\s*\/?>/gi, "\n");
}

/** Splits one table line on unescaped pipes, dropping the empty edge cells. */
function splitRow(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\\" && i + 1 < line.length) {
      current += ch + line[i + 1];
      i++;
    } else if (ch === "|") {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  if (cells.length && cells[0].trim() === "") cells.shift();
  if (cells.length && cells[cells.length - 1].trim() === "") cells.pop();
  return cells.map((c) => c.trim());
}

const RANGE_PATTERN = /^(\d+)\s*(?:[-–—]\s*(\d+))?$/;

/** Rows → the canonical Markdown table stored in `body`. */
export function serializeRollTable(rows: RollRow[]): string {
  const lines = ["| Roll | Result |", "|---|---|"];
  for (const row of rows) {
    const range = row.min === row.max ? String(row.min) : `${row.min}-${row.max}`;
    lines.push(`| ${range} | ${escapeCell(row.result)} |`);
  }
  return lines.join("\n");
}

/**
 * Reads the Markdown table out of an entry body. Prose around the table is
 * ignored, so a table page can carry an introduction. Reports every line it
 * could not understand rather than silently dropping it.
 */
export function parseRollTable(body: string): RollTableParse {
  const rows: RollRow[] = [];
  const problems: string[] = [];
  let sawHeader = false;

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith("|")) continue;
    const cells = splitRow(line);

    if (cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c))) continue;
    if (!sawHeader && cells[0]?.toLowerCase() === "roll") {
      sawHeader = true;
      continue;
    }
    if (cells.length < 2) {
      problems.push(`Row "${line}" needs a roll range and a result.`);
      continue;
    }

    const range = cells[0].match(RANGE_PATTERN);
    if (!range) {
      problems.push(`"${cells[0]}" is not a roll range like 4 or 1-3.`);
      continue;
    }
    const min = parseInt(range[1], 10);
    const max = range[2] ? parseInt(range[2], 10) : min;
    const result = unescapeCell(cells.slice(1).join("|")).trim();
    if (!result) {
      problems.push(`Roll ${cells[0]} has no result.`);
      continue;
    }
    rows.push({ min, max, result });
  }

  return { rows, problems };
}

/**
 * Whether the rows cover the dice span exactly once: nothing a roll can land
 * on is missing, and no roll lands on two rows. Returns one message per fault.
 */
export function checkCoverage(dice: string, rows: RollRow[]): string[] {
  const span = diceSpan(dice);
  if (!span) return [`"${dice}" is not dice notation like 1d20 or 2d6+1.`];
  if (rows.length === 0) return ["The table has no rows."];

  const problems: string[] = [];
  for (const row of rows) {
    if (row.min > row.max) problems.push(`Range ${row.min}-${row.max} runs backwards.`);
    if (row.min < span.min || row.max > span.max) {
      problems.push(`Range ${row.min}-${row.max} falls outside ${dice} (${span.min}-${span.max}).`);
    }
  }
  if (problems.length) return problems;

  const owner = new Map<number, number>();
  rows.forEach((row, index) => {
    for (let n = row.min; n <= row.max; n++) {
      const prior = owner.get(n);
      if (prior !== undefined && prior !== index) {
        problems.push(`Roll ${n} is in more than one row.`);
      }
      owner.set(n, index);
    }
  });

  const missing: number[] = [];
  for (let n = span.min; n <= span.max; n++) if (!owner.has(n)) missing.push(n);
  if (missing.length) {
    problems.push(`No row covers ${compressRanges(missing)}.`);
  }
  return [...new Set(problems)];
}

function compressRanges(values: number[]): string {
  const parts: string[] = [];
  let start = values[0];
  let prev = values[0];
  for (let i = 1; i <= values.length; i++) {
    const v = values[i];
    if (v === prev + 1) {
      prev = v;
      continue;
    }
    parts.push(start === prev ? String(start) : `${start}-${prev}`);
    start = v;
    prev = v;
  }
  return parts.join(", ");
}

/** The prose of a table entry's body with the Markdown table itself removed (the page draws the table). */
export function stripTable(body: string): string {
  return body
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("|"))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Whether a body already contains a Markdown table. */
export function hasTable(body: string): boolean {
  return body.split(/\r?\n/).some((line) => line.trim().startsWith("|"));
}

/**
 * A table covering the whole dice span in up to four even bands, with the results left
 * blank so the entry cannot be saved until each row has been written.
 */
export function starterTable(dice: string): string {
  const span = diceSpan(dice);
  if (!span) return serializeRollTable([]);
  const size = span.max - span.min + 1;
  const bands = Math.min(4, size);
  const rows: RollRow[] = [];
  for (let i = 0; i < bands; i++) {
    const min = span.min + Math.floor((i * size) / bands);
    const max = span.min + Math.floor(((i + 1) * size) / bands) - 1;
    rows.push({ min, max, result: "" });
  }
  return serializeRollTable(rows);
}

/**
 * Everything wrong with a table entry, in plain words, or an empty list when it
 * can be saved and rolled: unreadable rows first, then gaps, overlaps and
 * ranges outside the dice. Shared by the editor (live), the save actions and
 * the content scripts.
 */
export function validateTable(dice: string, body: string): string[] {
  const parsed = parseRollTable(body);
  if (parsed.rows.length === 0 && parsed.problems.length > 0) return parsed.problems;
  return [...parsed.problems, ...checkCoverage(dice, parsed.rows)];
}
