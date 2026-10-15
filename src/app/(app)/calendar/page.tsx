import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { CalendarDays, Settings2 } from "lucide-react";
import { CalendarControls } from "@/components/calendar-controls";
import { CalendarGrid } from "@/components/calendar-grid";
import { EmptyState, PageHeading } from "@/components/entry-card";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { CALENDAR_LIMITS, formatDate, formatYear, monthGrid, shiftMonth } from "@/lib/calendar";
import { getCalendar } from "@/lib/calendar-store";

export const metadata: Metadata = { title: "Calendar" };

const asInt = (v: string | undefined) => (v !== undefined && /^-?\d{1,7}$/.test(v) ? Number(v) : null);

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ y?: string; m?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/welcome");
  const isDM = user.role === "dm";
  const cal = await getCalendar();

  if (!cal) {
    return (
      <div className="max-w-4xl">
        <PageHeading Icon={CalendarDays} title="Calendar" blurb="The months and days of Asetheria, and where the story is now." />
        <EmptyState
          Icon={CalendarDays}
          title="The calendar has not been set up yet"
          hint={isDM ? "Name the months and weekdays of your world and say what day it is now. Nothing is filled in for you." : "The DM has not set up the calendar yet. It will appear here once they do."}
          action={
            isDM ? (
              <Button asChild>
                <Link href="/calendar/setup">
                  <Settings2 aria-hidden="true" />
                  Set up the calendar
                </Link>
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  const { config, current } = cal;
  const sp = await searchParams;
  const wantedYear = asInt(sp.y);
  const wantedMonth = asInt(sp.m);
  const valid = wantedYear !== null && wantedMonth !== null && wantedMonth >= 1 && wantedMonth <= config.months.length && wantedYear >= CALENDAR_LIMITS.minYear && wantedYear <= CALENDAR_LIMITS.maxYear;
  const year = valid ? wantedYear : current.year;
  const month = valid ? wantedMonth : current.month;

  const grid = monthGrid(config, year, month);
  const prev = shiftMonth(config, year, month, -1);
  const next = shiftMonth(config, year, month, 1);
  const href = (t: { year: number; month: number } | null) => (t ? `/calendar?y=${t.year}&m=${t.month}` : null);
  const showingCurrent = year === current.year && month === current.month;

  return (
    <div className="max-w-4xl">
      <PageHeading Icon={CalendarDays} title="Calendar" blurb="The months and days of Asetheria, and where the story is now." />

      <p className="mb-5 text-lg" data-testid="calendar-today">
        <span className="text-muted-foreground">Today is </span>
        <strong>{formatDate(config, current, { weekday: true })}</strong>
      </p>

      {isDM && (
        <div className="mb-6">
          <CalendarControls weekLength={config.weekdays.length} />
        </div>
      )}

      <CalendarGrid
        headingId="calendar-month"
        heading={`${config.months[month - 1].name}, ${formatYear(config, year)}`}
        weekdays={config.weekdays}
        weeks={grid.weeks}
        today={showingCurrent ? current.day : null}
        prevHref={href(prev)}
        nextHref={href(next)}
      />

      {!showingCurrent && (
        <p className="mt-4 text-sm">
          <Link href="/calendar" className="text-link underline-offset-4 hover:underline">
            Back to {config.months[current.month - 1].name}, {formatYear(config, current.year)}
          </Link>
        </p>
      )}
    </div>
  );
}
