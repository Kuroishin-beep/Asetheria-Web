import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { calendarConfig } from "@/db/schema";
import { addDays, isValidDate, validateConfig, type CalendarConfig, type CalendarDate } from "@/lib/calendar";

/**
 * The world's calendar and the current date in it. One row; none until the DM sets it up, and no names are
 * ever invented in its place.
 */

export type StoredCalendar = { config: CalendarConfig; current: CalendarDate };
export type CalendarResult = { ok: true; calendar: StoredCalendar } | { ok: false; error: string };

/** The most days one advance may move the current date, either way (ten years of 365). */
export const MAX_ADVANCE_DAYS = 3650;

export async function getCalendar(): Promise<StoredCalendar | null> {
  const [row] = await db.select().from(calendarConfig).where(eq(calendarConfig.id, 1)).limit(1);
  if (!row) return null;
  return {
    config: { months: row.months, weekdays: row.weekdays, yearLabel: row.yearLabel, firstWeekday: row.firstWeekday },
    current: { year: row.currentYear, month: row.currentMonth, day: row.currentDay },
  };
}

/** Saves the whole setup and the current date together, so the date is always valid for the months it is in. */
export async function saveCalendar(dm: { id: string }, config: CalendarConfig, current: CalendarDate): Promise<CalendarResult> {
  const clean: CalendarConfig = {
    months: config.months.map((m) => ({ name: m.name.trim(), days: m.days })),
    weekdays: config.weekdays.map((w) => w.trim()),
    yearLabel: config.yearLabel.trim(),
    firstWeekday: config.firstWeekday,
  };
  const problems = validateConfig(clean);
  if (problems.length > 0) return { ok: false, error: problems.join(" ") };
  if (!isValidDate(clean, current)) return { ok: false, error: "The current date is not a real date in this calendar. Check the month and the day." };

  await db
    .insert(calendarConfig)
    .values({ id: 1, months: clean.months, weekdays: clean.weekdays, yearLabel: clean.yearLabel, firstWeekday: clean.firstWeekday, currentYear: current.year, currentMonth: current.month, currentDay: current.day, updatedBy: dm.id })
    .onConflictDoUpdate({
      target: calendarConfig.id,
      set: { months: clean.months, weekdays: clean.weekdays, yearLabel: clean.yearLabel, firstWeekday: clean.firstWeekday, currentYear: current.year, currentMonth: current.month, currentDay: current.day, updatedBy: dm.id, updatedAt: new Date() },
    });
  return { ok: true, calendar: { config: clean, current } };
}

export async function setCurrentDate(dm: { id: string }, date: CalendarDate): Promise<CalendarResult> {
  const cal = await getCalendar();
  if (!cal) return { ok: false, error: "The calendar has not been set up yet." };
  if (!isValidDate(cal.config, date)) return { ok: false, error: "That is not a real date in this calendar." };
  await db.update(calendarConfig).set({ currentYear: date.year, currentMonth: date.month, currentDay: date.day, updatedBy: dm.id, updatedAt: new Date() }).where(eq(calendarConfig.id, 1));
  return { ok: true, calendar: { ...cal, current: date } };
}

/** Moves the current date by a number of days, forwards or back. */
export async function advanceDate(dm: { id: string }, days: number): Promise<CalendarResult> {
  if (!Number.isInteger(days) || days === 0 || Math.abs(days) > MAX_ADVANCE_DAYS) return { ok: false, error: `Move by a whole number of days, from 1 to ${MAX_ADVANCE_DAYS.toLocaleString("en")}, forwards or back.` };
  const cal = await getCalendar();
  if (!cal) return { ok: false, error: "The calendar has not been set up yet." };
  const next = addDays(cal.config, cal.current, days);
  if (!next) return { ok: false, error: "That would go past the years this calendar supports." };
  return setCurrentDate(dm, next);
}
