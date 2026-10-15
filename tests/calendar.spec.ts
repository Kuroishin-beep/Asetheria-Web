import { expect, test } from "@playwright/test";
import { CALENDAR_LIMITS, addDays, compareDates, diffDays, formatDate, formatYear, fromDayNumber, isValidDate, monthGrid, shiftMonth, toDayNumber, validateConfig, weekdayIndex, yearLength, type CalendarConfig, type CalendarDate } from "../src/lib/calendar";

/**
 * Phase 15 (pure part): date arithmetic for a calendar the DM defines. Exhaustive and random checks over
 * many invented calendars (the names here are labels for the test, not content): no database, no browser.
 */

/** A small seeded random generator, so a failure always reproduces. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

function randomConfig(r: () => number): CalendarConfig {
  const months = Array.from({ length: pick(r, 1, 14) }, (_, i) => ({ name: `Month ${i + 1}`, days: pick(r, 1, 45) }));
  const weekdays = Array.from({ length: pick(r, 1, 12) }, (_, i) => `Day ${i + 1}`);
  return { months, weekdays, yearLabel: r() < 0.5 ? "TT" : "", firstWeekday: pick(r, 0, weekdays.length - 1) };
}
function randomDate(r: () => number, cfg: CalendarConfig, years = 5000): CalendarDate {
  const month = pick(r, 1, cfg.months.length);
  return { year: pick(r, -years, years), month, day: pick(r, 1, cfg.months[month - 1].days) };
}

const SIMPLE: CalendarConfig = {
  months: [{ name: "Alpha", days: 30 }, { name: "Beta", days: 28 }, { name: "Gamma", days: 31 }],
  weekdays: ["One", "Two", "Three", "Four", "Five"],
  yearLabel: "TT",
  firstWeekday: 2,
};

test.describe("the configuration", () => {
  test("[TC-CALD-001] a good configuration passes, and the limits hold at the boundary", () => {
    expect(validateConfig(SIMPLE)).toEqual([]);
    const L = CALENDAR_LIMITS;
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `M${i}`, days: 1 }));
    expect(validateConfig({ ...SIMPLE, months: many(L.maxMonths) })).toEqual([]);
    expect(validateConfig({ ...SIMPLE, months: many(L.maxMonths + 1) })).toEqual([expect.stringMatching(/at most 60 months/)]);
    expect(validateConfig({ ...SIMPLE, months: [{ name: "A", days: L.maxDaysPerMonth }] })).toEqual([]);
    expect(validateConfig({ ...SIMPLE, months: [{ name: "A", days: L.maxDaysPerMonth + 1 }] })).toEqual([expect.stringMatching(/from 1 to 400 days/)]);
    expect(validateConfig({ ...SIMPLE, months: [{ name: "A", days: 0 }] })).toEqual([expect.stringMatching(/from 1 to 400 days/)]);
    const days = (n: number) => Array.from({ length: n }, (_, i) => `W${i}`);
    expect(validateConfig({ ...SIMPLE, weekdays: days(L.maxWeekdays), firstWeekday: 0 })).toEqual([]);
    expect(validateConfig({ ...SIMPLE, weekdays: days(L.maxWeekdays + 1), firstWeekday: 0 })).toEqual([expect.stringMatching(/at most 30 days/)]);
    expect(validateConfig({ ...SIMPLE, months: [{ name: "x".repeat(40), days: 5 }] })).toEqual([]);
    expect(validateConfig({ ...SIMPLE, months: [{ name: "x".repeat(41), days: 5 }] })).toEqual([expect.stringMatching(/longer than 40/)]);
    expect(validateConfig({ ...SIMPLE, yearLabel: "y".repeat(20) })).toEqual([]);
    expect(validateConfig({ ...SIMPLE, yearLabel: "y".repeat(21) })).toEqual([expect.stringMatching(/year label/)]);
  });

  test("[TC-CALD-002] no months, no weekdays, blank or repeated names (in any letter case), fractional days and a bad first weekday are each refused", () => {
    expect(validateConfig({ ...SIMPLE, months: [] })).toEqual([expect.stringMatching(/at least one month/)]);
    expect(validateConfig({ ...SIMPLE, weekdays: [], firstWeekday: 0 }).join(" ")).toMatch(/at least one weekday/);
    expect(validateConfig({ ...SIMPLE, months: [{ name: "  ", days: 5 }] })).toEqual([expect.stringMatching(/needs a name/)]);
    expect(validateConfig({ ...SIMPLE, months: [{ name: "Alpha", days: 5 }, { name: "ALPHA", days: 5 }] })).toEqual([expect.stringMatching(/Two months are called/)]);
    expect(validateConfig({ ...SIMPLE, weekdays: ["One", "one"], firstWeekday: 0 })).toEqual([expect.stringMatching(/Two weekdays are called/)]);
    expect(validateConfig({ ...SIMPLE, weekdays: ["One", ""], firstWeekday: 0 })).toEqual([expect.stringMatching(/Weekday 2 needs a name/)]);
    expect(validateConfig({ ...SIMPLE, months: [{ name: "A", days: 2.5 }] })).toEqual([expect.stringMatching(/from 1 to 400 days/)]);
    expect(validateConfig({ ...SIMPLE, firstWeekday: 5 })).toEqual([expect.stringMatching(/first day of year 1/)]);
    expect(validateConfig({ ...SIMPLE, firstWeekday: -1 })).toEqual([expect.stringMatching(/first day of year 1/)]);
    expect(validateConfig({ ...SIMPLE, firstWeekday: 1.5 })).toEqual([expect.stringMatching(/first day of year 1/)]);
  });

  test("[TC-CALD-003] several problems are all reported together", () => {
    const errors = validateConfig({ months: [{ name: "", days: 0 }, { name: "B", days: 999 }], weekdays: [], yearLabel: "z".repeat(30), firstWeekday: 0 });
    expect(errors.length).toBeGreaterThanOrEqual(5);
  });
});

test.describe("dates", () => {
  test("[TC-CALD-004] the first and last day of every month are valid; one outside either end, a zero, a fraction and NaN are not", () => {
    SIMPLE.months.forEach((m, i) => {
      expect(isValidDate(SIMPLE, { year: 10, month: i + 1, day: 1 })).toBe(true);
      expect(isValidDate(SIMPLE, { year: 10, month: i + 1, day: m.days })).toBe(true);
      expect(isValidDate(SIMPLE, { year: 10, month: i + 1, day: m.days + 1 })).toBe(false);
      expect(isValidDate(SIMPLE, { year: 10, month: i + 1, day: 0 })).toBe(false);
    });
    for (const bad of [{ year: 1, month: 0, day: 1 }, { year: 1, month: 4, day: 1 }, { year: 1.5, month: 1, day: 1 }, { year: 1, month: 1, day: 1.5 }, { year: Number.NaN, month: 1, day: 1 }, { year: 1, month: 1, day: Number.NaN }, { year: CALENDAR_LIMITS.maxYear + 1, month: 1, day: 1 }, { year: CALENDAR_LIMITS.minYear - 1, month: 1, day: 1 }]) {
      expect(isValidDate(SIMPLE, bad), JSON.stringify(bad)).toBe(false);
    }
    expect(isValidDate(SIMPLE, { year: CALENDAR_LIMITS.maxYear, month: 1, day: 1 })).toBe(true);
    expect(isValidDate(SIMPLE, { year: CALENDAR_LIMITS.minYear, month: 3, day: 31 })).toBe(true);
    expect(isValidDate(SIMPLE, { year: 0, month: 1, day: 1 })).toBe(true);
  });

  test("[TC-CALD-005] the year is the sum of its months, and the first day of year 1 is day 0", () => {
    expect(yearLength(SIMPLE)).toBe(89);
    expect(toDayNumber(SIMPLE, { year: 1, month: 1, day: 1 })).toBe(0);
    expect(toDayNumber(SIMPLE, { year: 1, month: 2, day: 1 })).toBe(30);
    expect(toDayNumber(SIMPLE, { year: 2, month: 1, day: 1 })).toBe(89);
    expect(toDayNumber(SIMPLE, { year: 0, month: 3, day: 31 })).toBe(-1);
    expect(toDayNumber(SIMPLE, { year: 0, month: 1, day: 1 })).toBe(-89);
  });

  test("[TC-CALD-006] day numbers and dates are exact inverses: 30 random calendars, 400 random dates each (12,000 round trips, negative years included)", () => {
    const r = rng(20261010);
    let checks = 0;
    for (let c = 0; c < 30; c++) {
      const cfg = randomConfig(r);
      for (let i = 0; i < 400; i++) {
        const d = randomDate(r, cfg);
        const n = toDayNumber(cfg, d);
        expect(fromDayNumber(cfg, n), `${JSON.stringify(cfg.months)} ${JSON.stringify(d)}`).toEqual(d);
        expect(isValidDate(cfg, fromDayNumber(cfg, n))).toBe(true);
        checks++;
      }
    }
    expect(checks).toBe(12000);
  });

  test("[TC-CALD-007] successive day numbers are successive dates: the day after the last day of a month is the first of the next, and of the year the first of the next year", () => {
    const r = rng(7);
    for (let c = 0; c < 20; c++) {
      const cfg = randomConfig(r);
      const start = toDayNumber(cfg, { year: pick(r, -50, 50), month: 1, day: 1 });
      let prev = fromDayNumber(cfg, start);
      for (let n = start + 1; n < start + 2 * yearLength(cfg) + 3; n++) {
        const next = fromDayNumber(cfg, n);
        const lastOfMonth = prev.day === cfg.months[prev.month - 1].days;
        if (!lastOfMonth) expect(next).toEqual({ year: prev.year, month: prev.month, day: prev.day + 1 });
        else if (prev.month < cfg.months.length) expect(next).toEqual({ year: prev.year, month: prev.month + 1, day: 1 });
        else expect(next).toEqual({ year: prev.year + 1, month: 1, day: 1 });
        prev = next;
      }
    }
  });
});

test.describe("adding days", () => {
  test("[TC-CALD-008] adding n then -n comes back to the start, and adding n equals the difference in day numbers: 15,000 random steps over 30 calendars", () => {
    const r = rng(99);
    for (let c = 0; c < 30; c++) {
      const cfg = randomConfig(r);
      for (let i = 0; i < 500; i++) {
        const d = randomDate(r, cfg, 2000);
        const n = pick(r, -20 * yearLength(cfg), 20 * yearLength(cfg));
        const there = addDays(cfg, d, n)!;
        expect(there).not.toBeNull();
        expect(diffDays(cfg, d, there)).toBe(n);
        expect(addDays(cfg, there, -n)).toEqual(d);
        expect(compareDates(cfg, d, there)).toBe(n === 0 ? 0 : Math.sign(-n)); // (Math.sign(-0) is -0)
      }
    }
  });

  test("[TC-CALD-009] known steps across the edges: end of month, end of year, a whole number of years, zero, and backwards over year 1", () => {
    const d = (year: number, month: number, day: number) => ({ year, month, day });
    expect(addDays(SIMPLE, d(5, 1, 30), 1)).toEqual(d(5, 2, 1));
    expect(addDays(SIMPLE, d(5, 3, 31), 1)).toEqual(d(6, 1, 1));
    expect(addDays(SIMPLE, d(5, 2, 10), 89)).toEqual(d(6, 2, 10));
    expect(addDays(SIMPLE, d(5, 2, 10), 89 * 10)).toEqual(d(15, 2, 10));
    expect(addDays(SIMPLE, d(5, 2, 10), 0)).toEqual(d(5, 2, 10));
    expect(addDays(SIMPLE, d(1, 1, 1), -1)).toEqual(d(0, 3, 31));
    expect(addDays(SIMPLE, d(0, 3, 31), 1)).toEqual(d(1, 1, 1));
    expect(addDays(SIMPLE, d(1, 1, 1), -89)).toEqual(d(0, 1, 1));
  });

  test("[TC-CALD-010] a step that would leave the supported years gives null, and the edge year itself is fine", () => {
    const last = { year: CALENDAR_LIMITS.maxYear, month: 3, day: 31 };
    expect(addDays(SIMPLE, last, 1)).toBeNull();
    expect(addDays(SIMPLE, last, 0)).toEqual(last);
    const first = { year: CALENDAR_LIMITS.minYear, month: 1, day: 1 };
    expect(addDays(SIMPLE, first, -1)).toBeNull();
    expect(addDays(SIMPLE, first, 1)).toEqual({ year: CALENDAR_LIMITS.minYear, month: 1, day: 2 });
  });

  test("[TC-CALD-011] ordering: earlier, equal and later dates compare as such across years", () => {
    const a = { year: 3, month: 2, day: 5 };
    expect(compareDates(SIMPLE, a, a)).toBe(0);
    expect(compareDates(SIMPLE, a, { year: 3, month: 2, day: 6 })).toBe(-1);
    expect(compareDates(SIMPLE, { year: 4, month: 1, day: 1 }, a)).toBe(1);
    expect(compareDates(SIMPLE, { year: -1, month: 3, day: 31 }, { year: 0, month: 1, day: 1 })).toBe(-1);
  });
});

test.describe("weekdays", () => {
  test("[TC-CALD-012] the weekday advances by one each day and wraps after the last, in every calendar", () => {
    const r = rng(5);
    for (let c = 0; c < 30; c++) {
      const cfg = randomConfig(r);
      const w = cfg.weekdays.length;
      const start = randomDate(r, cfg, 300);
      let d = start;
      let idx = weekdayIndex(cfg, d);
      for (let i = 0; i < 3 * w + 2; i++) {
        d = addDays(cfg, d, 1)!;
        const next = weekdayIndex(cfg, d);
        expect(next).toBe((idx + 1) % w);
        idx = next;
      }
      expect(weekdayIndex(cfg, addDays(cfg, start, w * 7)!)).toBe(weekdayIndex(cfg, start));
    }
  });

  test("[TC-CALD-013] the first day of year 1 falls on the chosen weekday, and the days before it count back from there", () => {
    for (let first = 0; first < SIMPLE.weekdays.length; first++) {
      const cfg = { ...SIMPLE, firstWeekday: first };
      expect(weekdayIndex(cfg, { year: 1, month: 1, day: 1 })).toBe(first);
      expect(weekdayIndex(cfg, { year: 0, month: 3, day: 31 })).toBe((first + SIMPLE.weekdays.length - 1) % SIMPLE.weekdays.length);
    }
  });

  test("[TC-CALD-014] a one-day week is allowed: every date is that weekday", () => {
    const cfg = { ...SIMPLE, weekdays: ["Only"], firstWeekday: 0 };
    expect(validateConfig(cfg)).toEqual([]);
    for (const day of [1, 17, 31]) expect(weekdayIndex(cfg, { year: -3, month: 3, day })).toBe(0);
  });
});

test.describe("the month grid", () => {
  test("[TC-CALD-015] every row is a full week, the days run 1 to the last in order exactly once, and day 1 sits under its weekday", () => {
    const r = rng(31);
    for (let c = 0; c < 40; c++) {
      const cfg = randomConfig(r);
      const w = cfg.weekdays.length;
      const date = randomDate(r, cfg, 500);
      const grid = monthGrid(cfg, date.year, date.month);
      grid.weeks.forEach((row) => expect(row).toHaveLength(w));
      const flat = grid.weeks.flat();
      const days = flat.filter((x): x is number => x !== null);
      expect(days).toEqual(Array.from({ length: cfg.months[date.month - 1].days }, (_, i) => i + 1));
      expect(flat.indexOf(1)).toBe(weekdayIndex(cfg, { year: date.year, month: date.month, day: 1 }));
      expect(grid.leadingBlanks).toBe(flat.indexOf(1));
      // No empty trailing week.
      expect(grid.weeks[grid.weeks.length - 1].some((x) => x !== null)).toBe(true);
    }
  });

  test("[TC-CALD-016] a known month lays out as expected", () => {
    const cfg = { ...SIMPLE, weekdays: ["A", "B", "C"], firstWeekday: 1, months: [{ name: "M", days: 7 }] };
    expect(monthGrid(cfg, 1, 1).weeks).toEqual([[null, 1, 2], [3, 4, 5], [6, 7, null]]);
  });

  test("[TC-CALD-017] moving by months crosses year edges both ways and refuses to leave the supported years", () => {
    expect(shiftMonth(SIMPLE, 5, 3, 1)).toEqual({ year: 6, month: 1 });
    expect(shiftMonth(SIMPLE, 5, 1, -1)).toEqual({ year: 4, month: 3 });
    expect(shiftMonth(SIMPLE, 5, 2, 7)).toEqual({ year: 7, month: 3 });
    expect(shiftMonth(SIMPLE, 1, 1, -1)).toEqual({ year: 0, month: 3 });
    expect(shiftMonth(SIMPLE, CALENDAR_LIMITS.maxYear, 3, 1)).toBeNull();
    expect(shiftMonth(SIMPLE, CALENDAR_LIMITS.minYear, 1, -1)).toBeNull();
  });
});

test.describe("writing dates", () => {
  test("[TC-CALD-018] a date reads month, day, year and the label; a weekday goes in front on request", () => {
    expect(formatDate(SIMPLE, { year: 1042, month: 2, day: 9 })).toBe("Beta 9, 1042 TT");
    expect(formatDate(SIMPLE, { year: 1, month: 1, day: 1 }, { weekday: true })).toBe("Three, Alpha 1, 1 TT");
    expect(formatDate({ ...SIMPLE, yearLabel: "" }, { year: 7, month: 3, day: 31 })).toBe("Gamma 31, 7");
  });

  test("[TC-CALD-019] years at and before zero are written with a true minus sign", () => {
    expect(formatYear(SIMPLE, 0)).toBe("0 TT");
    expect(formatYear(SIMPLE, -12)).toBe("−12 TT");
  });
});
