import { compareDates, formatDate, isValidDate, toDayNumber, type CalendarConfig, type CalendarDate } from "./calendar";

/**
 * Events for the timeline. An event is an ordinary page of kind `event` whose date lives in its fields as text:
 * `year`, `month` (1 to the number of months) and `day`, optionally `endYear`, `endMonth`, `endDay`, and an
 * `era` name. Pure and database-free: this is only the reading and the checking of those fields.
 */

export const ERA_MAX_LENGTH = 80;

/** The date fields an event keeps in its properties. */
export const EVENT_DATE_KEYS = ["year", "month", "day", "endYear", "endMonth", "endDay"] as const;

export type EventDates = { start: CalendarDate | null; end: CalendarDate | null };
export type EventParse = { ok: true; dates: EventDates } | { ok: false; errors: string[] };

/** Digits only (with an optional minus): Number() alone would accept "1e3" and "0x10". */
function whole(text: string | undefined): number {
  const t = (text ?? "").trim();
  return /^-?\d{1,7}$/.test(t) ? Number(t) : Number.NaN;
}

function readDate(cfg: CalendarConfig, parts: { year: string; month: string; day: string }, label: string, errors: string[]): CalendarDate | null {
  const date = { year: whole(parts.year), month: whole(parts.month), day: whole(parts.day) };
  const before = errors.length;
  if (!Number.isInteger(date.year)) errors.push(`The ${label}year must be a whole number.`);
  if (!Number.isInteger(date.month) || date.month < 1 || date.month > cfg.months.length) errors.push(`The ${label}month must be a number from 1 to ${cfg.months.length}.`);
  if (errors.length > before) return null;
  const days = cfg.months[date.month - 1].days;
  if (!Number.isInteger(date.day) || date.day < 1 || date.day > days) {
    errors.push(`${cfg.months[date.month - 1].name} has ${days} ${days === 1 ? "day" : "days"}, so the ${label}day must be from 1 to ${days}.`);
    return null;
  }
  if (!isValidDate(cfg, date)) {
    errors.push(`The ${label}year is outside the years this calendar supports.`);
    return null;
  }
  return date;
}

const present = (v: string | undefined) => (v ?? "").trim() !== "";

/**
 * Reads and checks an event's dates against the calendar. No dates at all is fine (an undated event); a date
 * needs all three of year, month and day and must exist in the calendar; an end needs the same and may not
 * come before the start. Every problem is returned, in plain words.
 */
export function parseEventDates(fields: Record<string, string>, cfg: CalendarConfig | null): EventParse {
  const errors: string[] = [];
  const startParts = { year: fields.year ?? "", month: fields.month ?? "", day: fields.day ?? "" };
  const endParts = { year: fields.endYear ?? "", month: fields.endMonth ?? "", day: fields.endDay ?? "" };
  const startCount = Object.values(startParts).filter(present).length;
  const endCount = Object.values(endParts).filter(present).length;

  if ((fields.era ?? "").trim().length > ERA_MAX_LENGTH) errors.push(`The era name is longer than ${ERA_MAX_LENGTH} characters.`);

  if (startCount === 0) {
    if (endCount > 0) errors.push("Give the start date before the end date.");
    return errors.length ? { ok: false, errors } : { ok: true, dates: { start: null, end: null } };
  }
  if (startCount < 3) {
    errors.push("A date needs a year, a month and a day. Fill in all three, or leave all three empty for an undated event.");
    return { ok: false, errors };
  }
  if (!cfg) {
    errors.push("Set up the calendar before dating an event: the months and days it uses come from there.");
    return { ok: false, errors };
  }
  const start = readDate(cfg, startParts, "", errors);

  let end: CalendarDate | null = null;
  if (endCount > 0) {
    if (endCount < 3) errors.push("An end date needs a year, a month and a day, or leave all three empty.");
    else {
      end = readDate(cfg, endParts, "end ", errors);
      if (start && end && compareDates(cfg, end, start) < 0) errors.push("The end is before the start.");
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, dates: { start, end } };
}

/** What a page is refused for when saved as an event, or null. */
export function eventProblem(fields: Record<string, string>, cfg: CalendarConfig | null): string | null {
  const r = parseEventDates(fields, cfg);
  return r.ok ? null : `This event can't be saved yet. ${r.errors.join(" ")}`;
}

/** "Beta 9, 1042 TT", or "Beta 9, 1042 TT to Gamma 3, 1042 TT" for a span. */
export function formatEventWhen(cfg: CalendarConfig, d: EventDates): string {
  if (!d.start) return "Undated";
  const s = formatDate(cfg, d.start);
  if (!d.end || compareDates(cfg, d.start, d.end) === 0) return s;
  return `${s} to ${formatDate(cfg, d.end)}`;
}

export type TimelineEvent = { id: string; name: string; era: string; dates: EventDates };

/** Chronological order: by start day, then by name; undated events last. */
export function sortEvents<T extends TimelineEvent>(cfg: CalendarConfig, events: T[]): T[] {
  const key = (e: T) => (e.dates.start ? toDayNumber(cfg, e.dates.start) : Number.POSITIVE_INFINITY);
  return [...events].sort((a, b) => {
    const d = key(a) - key(b);
    if (d !== 0 && !Number.isNaN(d)) return d;
    return a.name.localeCompare(b.name, "en");
  });
}

export type EraGroup<T> = { era: string; events: T[] };

/** Groups sorted events by era, eras ordered by their earliest event; events with no era, then undated ones, come last. */
export function groupByEra<T extends TimelineEvent>(cfg: CalendarConfig, events: T[]): EraGroup<T>[] {
  const sorted = sortEvents(cfg, events);
  const dated = new Map<string, T[]>();
  const noEra: T[] = [];
  const undated: T[] = [];
  for (const e of sorted) {
    if (!e.dates.start) undated.push(e);
    else if (!e.era.trim()) noEra.push(e);
    else dated.set(e.era.trim(), [...(dated.get(e.era.trim()) ?? []), e]);
  }
  const groups: EraGroup<T>[] = [...dated.entries()].map(([era, list]) => ({ era, events: list }));
  if (noEra.length) groups.push({ era: "No era", events: noEra });
  if (undated.length) groups.push({ era: "Undated", events: undated });
  return groups;
}

/** The days of one month an event covers (from its start to its end, or just its start), as a sorted list of day numbers. */
export function daysInMonth(cfg: CalendarConfig, d: EventDates, year: number, month: number): number[] {
  if (!d.start) return [];
  const first = toDayNumber(cfg, { year, month, day: 1 });
  const last = first + cfg.months[month - 1].days - 1;
  const from = toDayNumber(cfg, d.start);
  const to = d.end ? toDayNumber(cfg, d.end) : from;
  const lo = Math.max(first, from);
  const hi = Math.min(last, to);
  const out: number[] = [];
  for (let n = lo; n <= hi; n++) out.push(n - first + 1);
  return out;
}
