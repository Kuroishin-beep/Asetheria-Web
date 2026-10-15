/**
 * The Asetheria calendar: date arithmetic for a calendar the DM defines (any number of months of any length,
 * any weekday names). Pure, with no database, so it can be tested exhaustively.
 *
 * Years are a fixed length (the sum of the months; there are no leap rules: a short extra month does the job).
 * Months and days count from 1. The first day of year 1 is the origin; earlier years (zero and negative) work too.
 * No month or weekday names are built in: they come from the DM's configuration.
 */

export type CalendarMonth = { name: string; days: number };
export type CalendarConfig = {
  months: CalendarMonth[];
  weekdays: string[];
  /** A short label after the year, such as "AE". May be empty. */
  yearLabel: string;
  /** Which weekday (0-based index into `weekdays`) the first day of year 1 falls on. */
  firstWeekday: number;
};
export type CalendarDate = { year: number; month: number; day: number };

export const CALENDAR_LIMITS = {
  maxMonths: 60,
  maxDaysPerMonth: 400,
  maxWeekdays: 30,
  maxNameLength: 40,
  maxLabelLength: 20,
  minYear: -100_000,
  maxYear: 100_000,
} as const;

const isInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);

/** Every reason a configuration cannot be used, in plain words; empty when it is fine. */
export function validateConfig(cfg: CalendarConfig): string[] {
  const errors: string[] = [];
  const L = CALENDAR_LIMITS;
  if (!Array.isArray(cfg.months) || cfg.months.length < 1) errors.push("Add at least one month.");
  else {
    if (cfg.months.length > L.maxMonths) errors.push(`A year can have at most ${L.maxMonths} months.`);
    const seen = new Set<string>();
    cfg.months.forEach((m, i) => {
      const name = (m.name ?? "").trim();
      const label = name || `Month ${i + 1}`;
      if (!name) errors.push(`${label} needs a name.`);
      else if (name.length > L.maxNameLength) errors.push(`${label}: the name is longer than ${L.maxNameLength} characters.`);
      else if (seen.has(name.toLowerCase())) errors.push(`Two months are called "${name}". Each month needs its own name.`);
      seen.add(name.toLowerCase());
      if (!isInt(m.days) || m.days < 1 || m.days > L.maxDaysPerMonth) errors.push(`${label} must have from 1 to ${L.maxDaysPerMonth} days.`);
    });
  }
  if (!Array.isArray(cfg.weekdays) || cfg.weekdays.length < 1) errors.push("Add at least one weekday.");
  else {
    if (cfg.weekdays.length > L.maxWeekdays) errors.push(`A week can have at most ${L.maxWeekdays} days.`);
    const seen = new Set<string>();
    cfg.weekdays.forEach((w, i) => {
      const name = (w ?? "").trim();
      if (!name) errors.push(`Weekday ${i + 1} needs a name.`);
      else if (name.length > L.maxNameLength) errors.push(`Weekday ${i + 1}: the name is longer than ${L.maxNameLength} characters.`);
      else if (seen.has(name.toLowerCase())) errors.push(`Two weekdays are called "${name}". Each weekday needs its own name.`);
      seen.add(name.toLowerCase());
    });
  }
  if ((cfg.yearLabel ?? "").length > L.maxLabelLength) errors.push(`The year label is longer than ${L.maxLabelLength} characters.`);
  if (Array.isArray(cfg.weekdays) && (!isInt(cfg.firstWeekday) || cfg.firstWeekday < 0 || cfg.firstWeekday >= cfg.weekdays.length)) {
    errors.push("Choose which weekday the first day of year 1 falls on.");
  }
  return errors;
}

export function yearLength(cfg: CalendarConfig): number {
  return cfg.months.reduce((sum, m) => sum + m.days, 0);
}

export function isValidDate(cfg: CalendarConfig, d: CalendarDate): boolean {
  if (!isInt(d.year) || !isInt(d.month) || !isInt(d.day)) return false;
  if (d.year < CALENDAR_LIMITS.minYear || d.year > CALENDAR_LIMITS.maxYear) return false;
  if (d.month < 1 || d.month > cfg.months.length) return false;
  return d.day >= 1 && d.day <= cfg.months[d.month - 1].days;
}

/** Days since the first day of year 1 (negative before it). */
export function toDayNumber(cfg: CalendarConfig, d: CalendarDate): number {
  let before = 0;
  for (let i = 0; i < d.month - 1; i++) before += cfg.months[i].days;
  return (d.year - 1) * yearLength(cfg) + before + (d.day - 1);
}

export function fromDayNumber(cfg: CalendarConfig, n: number): CalendarDate {
  const len = yearLength(cfg);
  const year = Math.floor(n / len) + 1;
  let rest = n - (year - 1) * len;
  for (let i = 0; i < cfg.months.length; i++) {
    if (rest < cfg.months[i].days) return { year, month: i + 1, day: rest + 1 };
    rest -= cfg.months[i].days;
  }
  throw new Error("unreachable: the remainder is always inside the year");
}

/** The date `n` days after `d` (before it when negative), or null when that would leave the supported years. */
export function addDays(cfg: CalendarConfig, d: CalendarDate, n: number): CalendarDate | null {
  const result = fromDayNumber(cfg, toDayNumber(cfg, d) + n);
  return result.year < CALENDAR_LIMITS.minYear || result.year > CALENDAR_LIMITS.maxYear ? null : result;
}

export function diffDays(cfg: CalendarConfig, from: CalendarDate, to: CalendarDate): number {
  return toDayNumber(cfg, to) - toDayNumber(cfg, from);
}

export function compareDates(cfg: CalendarConfig, a: CalendarDate, b: CalendarDate): number {
  return Math.sign(toDayNumber(cfg, a) - toDayNumber(cfg, b));
}

/** The weekday of a date as an index into `weekdays`. */
export function weekdayIndex(cfg: CalendarConfig, d: CalendarDate): number {
  const w = cfg.weekdays.length;
  return (((toDayNumber(cfg, d) + cfg.firstWeekday) % w) + w) % w;
}

export function formatYear(cfg: CalendarConfig, year: number): string {
  return `${year < 0 ? "−" : ""}${Math.abs(year)}${cfg.yearLabel ? ` ${cfg.yearLabel}` : ""}`;
}

/** "Hammer 12, 1042 AE", with the weekday in front when asked. */
export function formatDate(cfg: CalendarConfig, d: CalendarDate, opts: { weekday?: boolean } = {}): string {
  const base = `${cfg.months[d.month - 1].name} ${d.day}, ${formatYear(cfg, d.year)}`;
  return opts.weekday ? `${cfg.weekdays[weekdayIndex(cfg, d)]}, ${base}` : base;
}

export type MonthGrid = { weeks: (number | null)[][]; leadingBlanks: number };

/** One month laid out in weeks, each as long as the week, with null where a week starts or ends in another month. */
export function monthGrid(cfg: CalendarConfig, year: number, month: number): MonthGrid {
  const w = cfg.weekdays.length;
  const days = cfg.months[month - 1].days;
  const leading = weekdayIndex(cfg, { year, month, day: 1 });
  const cells: (number | null)[] = [...Array<null>(leading).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % w !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += w) weeks.push(cells.slice(i, i + w));
  return { weeks, leadingBlanks: leading };
}

/** The month before or after (in `step` months), crossing year edges; null outside the supported years. */
export function shiftMonth(cfg: CalendarConfig, year: number, month: number, step: number): { year: number; month: number } | null {
  const n = cfg.months.length;
  const index = (year - 1) * n + (month - 1) + step;
  const y = Math.floor(index / n) + 1;
  if (y < CALENDAR_LIMITS.minYear || y > CALENDAR_LIMITS.maxYear) return null;
  return { year: y, month: index - (y - 1) * n + 1 };
}
