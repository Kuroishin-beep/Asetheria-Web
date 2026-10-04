/**
 * Sorting and column choice for the database view of a section.
 *
 * Pure and framework-free. Sorting happens in application code on rows the
 * query layer has already filtered for the viewer, and the sort key only ever
 * selects a property from a whitelist, so a key from the URL can never reach
 * SQL (risk R13).
 */

export const SORT_NAME = "name";
export type SortDir = "asc" | "desc";
export type SortSpec = { key: string; dir: SortDir };

/** Coin values in gold pieces, so "5 sp" sorts below "1 gp" and "5,000 gp" above "5 gp". */
const COIN_VALUE: Record<string, number> = { cp: 0.01, sp: 0.1, ep: 0.5, gp: 1, pp: 10 };

const NUMBER_PATTERN = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/;

/**
 * The number a property value stands for, or null when it has none
 * ("Non-ferrous", "—", ""). Understands thousands separators ("5,000 gp"),
 * simple fractions ("CR 1/4"), coin units, and takes the first number of a
 * range ("10-15").
 */
export function numericValue(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const text = raw.trim();
  const m = text.match(NUMBER_PATTERN);
  if (!m || m.index === undefined) return null;
  let value = parseFloat(m[0].replace(/,/g, ""));
  let rest = text.slice(m.index + m[0].length);

  const fraction = rest.match(/^\s*\/\s*(\d+)/);
  if (fraction) {
    const divisor = parseInt(fraction[1], 10);
    if (divisor === 0) return null;
    value /= divisor;
    rest = rest.slice(fraction[0].length);
  }
  const coin = rest.match(/^\s*(cp|sp|ep|gp|pp)\b/i);
  if (coin) value *= COIN_VALUE[coin[1].toLowerCase()];
  return Number.isFinite(value) ? value : null;
}

/** Ordinal scales that read better than the alphabet. */
const ORDINAL: Record<string, readonly string[]> = {
  rarity: ["common", "uncommon", "rare", "very rare", "legendary", "artifact"],
};

function ordinalRank(key: string, value: string): number | null {
  const scale = ORDINAL[key];
  if (!scale) return null;
  const i = scale.indexOf(value.trim().toLowerCase());
  return i === -1 ? null : i;
}

/**
 * Orders two values of one property. Blank values always sort last, in either
 * direction. Numbers (and ordinal ranks) compare by value; anything else falls
 * back to a natural-order text comparison.
 */
export function compareValues(key: string, a: string, b: string, dir: SortDir): number {
  const aBlank = !a.trim();
  const bBlank = !b.trim();
  if (aBlank || bBlank) return aBlank === bBlank ? 0 : aBlank ? 1 : -1;

  const sign = dir === "asc" ? 1 : -1;
  const ra = ordinalRank(key, a);
  const rb = ordinalRank(key, b);
  if (ra !== null && rb !== null) return (ra - rb) * sign;

  const na = numericValue(a);
  const nb = numericValue(b);
  if (na !== null && nb !== null) {
    if (na !== nb) return (na - nb) * sign;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }) * sign;
  }
  // A number outranks free text, so a column of mostly numbers keeps them together.
  if (na !== null || nb !== null) return na !== null ? -1 : 1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }) * sign;
}

/** Reads `sort` and `dir` from the URL; anything not on the whitelist falls back to name, ascending. */
export function parseSort(
  rawKey: string | string[] | undefined,
  rawDir: string | string[] | undefined,
  allowedKeys: readonly string[],
): SortSpec {
  const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
  const dir = Array.isArray(rawDir) ? rawDir[0] : rawDir;
  const valid = typeof key === "string" && (key === SORT_NAME || allowedKeys.includes(key));
  if (!valid) return { key: SORT_NAME, dir: "asc" };
  return { key, dir: dir === "desc" ? "desc" : "asc" };
}

/**
 * Reads the visible columns from `cols` (comma-separated field keys). Unknown
 * keys are dropped; an absent or empty value means the defaults.
 */
export function parseColumns(
  raw: string | string[] | undefined,
  allowedKeys: readonly string[],
  defaults: readonly string[],
): string[] {
  const text = Array.isArray(raw) ? raw[0] : raw;
  if (!text) return [...defaults];
  const wanted = new Set(text.split(",").map((s) => s.trim()));
  const picked = allowedKeys.filter((k) => wanted.has(k));
  return picked.length ? picked : [...defaults];
}

/** Sorts rows by name or by one property, stably, with ties broken by name. */
export function sortRows<T extends { name: string; fields: Record<string, string> }>(
  rows: readonly T[],
  spec: SortSpec,
): T[] {
  const value = (r: T) => (spec.key === SORT_NAME ? r.name : (r.fields?.[spec.key] ?? ""));
  return [...rows].sort((a, b) => {
    const primary = compareValues(spec.key, value(a), value(b), spec.dir);
    if (primary !== 0) return primary;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  });
}
