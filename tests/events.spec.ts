import { expect, test } from "@playwright/test";
import type { CalendarConfig } from "../src/lib/calendar";
import { ERA_MAX_LENGTH, daysInMonth, eventProblem, formatEventWhen, groupByEra, parseEventDates, sortEvents, type TimelineEvent } from "../src/lib/events";

/**
 * Phase 16 (pure part): reading and checking an event's dates against the calendar, ordering events, and
 * grouping them by era. No database and no browser. Calendar names are labels for the tests.
 */

const CFG: CalendarConfig = {
  months: [{ name: "Alpha", days: 30 }, { name: "Beta", days: 28 }, { name: "Gamma", days: 31 }],
  weekdays: ["One", "Two", "Three", "Four", "Five"],
  yearLabel: "TT",
  firstWeekday: 0,
};
const f = (o: Record<string, string>) => o;

function errors(fields: Record<string, string>, cfg: CalendarConfig | null = CFG): string[] {
  const r = parseEventDates(fields, cfg);
  if (r.ok) throw new Error("expected refusals");
  return r.errors;
}
function dates(fields: Record<string, string>, cfg: CalendarConfig | null = CFG) {
  const r = parseEventDates(fields, cfg);
  if (!r.ok) throw new Error(`expected valid, got: ${r.errors.join(" ")}`);
  return r.dates;
}

test.describe("reading dates", () => {
  test("[TC-EVTU-001] no date at all is an undated event, with or without an era, and needs no calendar", () => {
    expect(dates(f({}), null)).toEqual({ start: null, end: null });
    expect(dates(f({ era: "The Long Dusk" }), null)).toEqual({ start: null, end: null });
    expect(dates(f({ year: "  ", month: "", day: "" }))).toEqual({ start: null, end: null });
  });

  test("[TC-EVTU-002] a full date is read, with spaces around the numbers and negative years", () => {
    expect(dates(f({ year: " 1042 ", month: "2", day: " 9" })).start).toEqual({ year: 1042, month: 2, day: 9 });
    expect(dates(f({ year: "-300", month: "1", day: "1" })).start).toEqual({ year: -300, month: 1, day: 1 });
    expect(dates(f({ year: "0", month: "3", day: "31" })).start).toEqual({ year: 0, month: 3, day: 31 });
  });

  test("[TC-EVTU-003] an end date is optional; it may equal the start, and may span months and years", () => {
    expect(dates(f({ year: "5", month: "1", day: "1" })).end).toBeNull();
    expect(dates(f({ year: "5", month: "1", day: "1", endYear: "5", endMonth: "1", endDay: "1" })).end).toEqual({ year: 5, month: 1, day: 1 });
    expect(dates(f({ year: "5", month: "3", day: "30", endYear: "6", endMonth: "1", endDay: "2" })).end).toEqual({ year: 6, month: 1, day: 2 });
  });
});

test.describe("what is refused, in plain words", () => {
  test("[TC-EVTU-004] part of a date, in either place", () => {
    const parts: Record<string, string>[] = [{ year: "5" }, { month: "1" }, { day: "1" }, { year: "5", month: "1" }, { month: "1", day: "2" }];
    for (const part of parts) {
      expect(errors(f(part)), JSON.stringify(part)).toEqual([expect.stringMatching(/needs a year, a month and a day/)]);
    }
    expect(errors(f({ year: "5", month: "1", day: "1", endYear: "6" }))).toEqual([expect.stringMatching(/end date needs a year, a month and a day/)]);
  });

  test("[TC-EVTU-005] an end with no start", () => {
    expect(errors(f({ endYear: "5", endMonth: "1", endDay: "1" }))).toEqual(["Give the start date before the end date."]);
  });

  test("[TC-EVTU-006] a date with no calendar to check it against", () => {
    expect(errors(f({ year: "5", month: "1", day: "1" }), null)).toEqual([expect.stringMatching(/Set up the calendar/)]);
  });

  test("[TC-EVTU-007] a month that does not exist, in both directions", () => {
    expect(errors(f({ year: "5", month: "0", day: "1" }))).toEqual(["The month must be a number from 1 to 3."]);
    expect(errors(f({ year: "5", month: "4", day: "1" }))).toEqual(["The month must be a number from 1 to 3."]);
    expect(errors(f({ year: "5", month: "1", day: "1", endYear: "5", endMonth: "9", endDay: "1" }))).toEqual(["The end month must be a number from 1 to 3."]);
  });

  test("[TC-EVTU-008] a day past the end of its month names the month and its length; the last day is fine", () => {
    expect(errors(f({ year: "5", month: "2", day: "29" }))).toEqual(["Beta has 28 days, so the day must be from 1 to 28."]);
    expect(errors(f({ year: "5", month: "2", day: "0" }))).toEqual(["Beta has 28 days, so the day must be from 1 to 28."]);
    expect(dates(f({ year: "5", month: "2", day: "28" })).start).toEqual({ year: 5, month: 2, day: 28 });
    const one: CalendarConfig = { ...CFG, months: [{ name: "Solo", days: 1 }] };
    expect(errors(f({ year: "5", month: "1", day: "2" }), one)).toEqual(["Solo has 1 day, so the day must be from 1 to 1."]);
  });

  test("[TC-EVTU-009] numbers that are not whole numbers: fractions, exponents, hex, words, and very long digits", () => {
    for (const bad of ["1.5", "1e3", "0x10", "abc", "12345678", "--5", "5-"]) {
      expect(errors(f({ year: bad, month: "1", day: "1" })), bad).toEqual(["The year must be a whole number."]);
    }
    expect(errors(f({ year: "5", month: "1", day: "1e1" })).join(" ")).toMatch(/Alpha has 30 days/);
  });

  test("[TC-EVTU-010] a year outside the supported years", () => {
    expect(dates(f({ year: "100000", month: "1", day: "1" })).start?.year).toBe(100000);
    expect(errors(f({ year: "100001", month: "1", day: "1" }))).toEqual([expect.stringMatching(/outside the years/)]);
    expect(errors(f({ year: "-100001", month: "1", day: "1" }))).toEqual([expect.stringMatching(/outside the years/)]);
  });

  test("[TC-EVTU-011] an end before the start is refused, even by one day; the same day and the next day are fine", () => {
    const base = { year: "5", month: "2", day: "10" };
    expect(errors(f({ ...base, endYear: "5", endMonth: "2", endDay: "9" }))).toEqual(["The end is before the start."]);
    expect(errors(f({ ...base, endYear: "4", endMonth: "3", endDay: "31" }))).toEqual(["The end is before the start."]);
    expect(dates(f({ ...base, endYear: "5", endMonth: "2", endDay: "10" })).end).not.toBeNull();
    expect(dates(f({ ...base, endYear: "5", endMonth: "2", endDay: "11" })).end).not.toBeNull();
  });

  test("[TC-EVTU-012] an era name at the limit is fine, one more character is refused", () => {
    expect(parseEventDates(f({ era: "e".repeat(ERA_MAX_LENGTH) }), CFG).ok).toBe(true);
    expect(errors(f({ era: "e".repeat(ERA_MAX_LENGTH + 1) }))).toEqual([expect.stringMatching(/era name is longer than 80/)]);
  });

  test("[TC-EVTU-013] several problems at once are all reported, and the save-time message joins them", () => {
    const fields = f({ year: "x", month: "9", day: "1", era: "e".repeat(81) });
    expect(errors(fields).length).toBeGreaterThanOrEqual(2);
    const msg = eventProblem(fields, CFG);
    expect(msg).toMatch(/^This event can't be saved yet\./);
    expect(eventProblem(f({ year: "5", month: "1", day: "1" }), CFG)).toBeNull();
    expect(eventProblem(f({}), null)).toBeNull();
  });
});

test.describe("ordering and grouping", () => {
  const ev = (id: string, name: string, era: string, d?: { y: number; m: number; d: number }, end?: { y: number; m: number; d: number }): TimelineEvent => ({
    id,
    name,
    era,
    dates: { start: d ? { year: d.y, month: d.m, day: d.d } : null, end: end ? { year: end.y, month: end.m, day: end.d } : null },
  });

  test("[TC-EVTU-014] events sort by start date across months and years, ties by name, undated last", () => {
    const list = [ev("u", "Undated one", ""), ev("c", "C", "", { y: 5, m: 1, d: 1 }), ev("b2", "B", "", { y: 4, m: 3, d: 31 }), ev("b1", "A", "", { y: 4, m: 3, d: 31 }), ev("neg", "Early", "", { y: -9, m: 2, d: 3 })];
    expect(sortEvents(CFG, list).map((e) => e.id)).toEqual(["neg", "b1", "b2", "c", "u"]);
  });

  test("[TC-EVTU-015] sorting does not change the list it was given", () => {
    const list = [ev("b", "B", "", { y: 2, m: 1, d: 1 }), ev("a", "A", "", { y: 1, m: 1, d: 1 })];
    const copy = [...list];
    sortEvents(CFG, list);
    expect(list).toEqual(copy);
  });

  test("[TC-EVTU-016] eras are ordered by their earliest event; no-era events and undated events come last, in that order", () => {
    const groups = groupByEra(CFG, [
      ev("1", "Late war", "Age of Ash", { y: 300, m: 1, d: 1 }),
      ev("2", "Founding", "Age of Dawn", { y: 1, m: 1, d: 1 }),
      ev("3", "Plain", "", { y: 2, m: 1, d: 1 }),
      ev("4", "Early ash", "Age of Ash", { y: 250, m: 1, d: 1 }),
      ev("5", "Lost", "Age of Dawn"),
      ev("6", "Lost too", ""),
    ]);
    expect(groups.map((g) => g.era)).toEqual(["Age of Dawn", "Age of Ash", "No era", "Undated"]);
    expect(groups[0].events.map((e) => e.id)).toEqual(["2"]);
    expect(groups[1].events.map((e) => e.id)).toEqual(["4", "1"]);
    expect(groups[3].events.map((e) => e.id)).toEqual(["5", "6"]);
  });

  test("[TC-EVTU-017] an empty list gives no groups", () => {
    expect(groupByEra(CFG, [])).toEqual([]);
  });

  test("[TC-EVTU-018] era names are matched after trimming", () => {
    const groups = groupByEra(CFG, [ev("1", "A", " Dawn ", { y: 1, m: 1, d: 1 }), ev("2", "B", "Dawn", { y: 2, m: 1, d: 1 })]);
    expect(groups).toHaveLength(1);
  });
});

test.describe("showing dates", () => {
  test("[TC-EVTU-019] a single date, a span, a one-day span and an undated event read correctly", () => {
    const d = (y: number, m: number, day: number) => ({ year: y, month: m, day });
    expect(formatEventWhen(CFG, { start: d(1042, 2, 9), end: null })).toBe("Beta 9, 1042 TT");
    expect(formatEventWhen(CFG, { start: d(1042, 2, 9), end: d(1042, 3, 3) })).toBe("Beta 9, 1042 TT to Gamma 3, 1042 TT");
    expect(formatEventWhen(CFG, { start: d(1042, 2, 9), end: d(1042, 2, 9) })).toBe("Beta 9, 1042 TT");
    expect(formatEventWhen(CFG, { start: null, end: null })).toBe("Undated");
  });

  test("[TC-EVTU-020] the days of a month an event covers: a single day, a span inside, a span running in from before and out after, and none", () => {
    const d = (y: number, m: number, day: number) => ({ year: y, month: m, day });
    expect(daysInMonth(CFG, { start: d(5, 2, 10), end: null }, 5, 2)).toEqual([10]);
    expect(daysInMonth(CFG, { start: d(5, 2, 10), end: d(5, 2, 12) }, 5, 2)).toEqual([10, 11, 12]);
    expect(daysInMonth(CFG, { start: d(5, 1, 25), end: d(5, 3, 5) }, 5, 2)).toHaveLength(28);
    expect(daysInMonth(CFG, { start: d(5, 1, 25), end: d(5, 2, 3) }, 5, 2)).toEqual([1, 2, 3]);
    expect(daysInMonth(CFG, { start: d(5, 2, 26), end: d(5, 3, 4) }, 5, 2)).toEqual([26, 27, 28]);
    expect(daysInMonth(CFG, { start: d(5, 2, 10), end: null }, 5, 3)).toEqual([]);
    expect(daysInMonth(CFG, { start: d(5, 2, 10), end: null }, 6, 2)).toEqual([]);
    expect(daysInMonth(CFG, { start: null, end: null }, 5, 2)).toEqual([]);
    expect(daysInMonth(CFG, { start: d(5, 3, 31), end: d(6, 1, 2) }, 6, 1)).toEqual([1, 2]);
  });
});
