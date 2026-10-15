"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One month as a keyboard-friendly grid: arrow keys move between days, Home and End go to the start and end of
 * the week, and Page Up and Page Down change the month. Only one day is a tab stop at a time (today, or the first).
 */
export function CalendarGrid({
  headingId,
  heading,
  weekdays,
  weeks,
  today,
  prevHref,
  nextHref,
}: {
  headingId: string;
  heading: string;
  weekdays: string[];
  weeks: (number | null)[][];
  /** The day of this month that is the current date, if the month shown holds it. */
  today: number | null;
  prevHref: string | null;
  nextHref: string | null;
}) {
  const router = useRouter();
  const cells = useRef(new Map<number, HTMLTableCellElement>());
  const lastDay = Math.max(...weeks.flat().filter((d): d is number => d !== null));
  const width = weekdays.length;
  const [active, setActive] = useState(today ?? 1);

  function go(day: number) {
    const clamped = Math.min(lastDay, Math.max(1, day));
    setActive(clamped);
    cells.current.get(clamped)?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTableCellElement>, day: number, column: number) {
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        return go(day + 1);
      case "ArrowLeft":
        e.preventDefault();
        return go(day - 1);
      case "ArrowDown":
        e.preventDefault();
        return go(day + width);
      case "ArrowUp":
        e.preventDefault();
        return go(day - width);
      case "Home":
        e.preventDefault();
        return go(day - column);
      case "End":
        e.preventDefault();
        return go(day + (width - 1 - column));
      case "PageUp":
        if (prevHref) {
          e.preventDefault();
          router.push(prevHref);
        }
        return;
      case "PageDown":
        if (nextHref) {
          e.preventDefault();
          router.push(nextHref);
        }
        return;
    }
  }

  const nav = "inline-flex size-9 items-center justify-center rounded-md border border-border transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        {prevHref ? (
          <Link href={prevHref} className={nav} aria-label="Previous month">
            <ChevronLeft aria-hidden="true" className="size-4" />
          </Link>
        ) : (
          <span className="size-9" aria-hidden="true" />
        )}
        <h2 id={headingId} className="font-display text-xl font-bold tracking-tight" data-testid="calendar-heading">
          {heading}
        </h2>
        {nextHref ? (
          <Link href={nextHref} className={nav} aria-label="Next month">
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        ) : (
          <span className="size-9" aria-hidden="true" />
        )}
      </div>

      <div className="overflow-x-auto">
        <table role="grid" aria-labelledby={headingId} className="w-full min-w-[20rem] table-fixed border-collapse" data-testid="calendar-grid">
          <thead>
            <tr>
              {weekdays.map((w) => (
                <th key={w} scope="col" className="truncate border border-border bg-muted/50 px-1 py-2 text-xs font-semibold text-muted-foreground" title={w}>
                  {w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, wi) => (
              <tr key={wi}>
                {week.map((day, ci) =>
                  day === null ? (
                    <td key={ci} className="border border-border bg-muted/20" aria-hidden="true" />
                  ) : (
                    <td
                      key={ci}
                      ref={(el) => {
                        if (el) cells.current.set(day, el);
                        else cells.current.delete(day);
                      }}
                      role="gridcell"
                      tabIndex={day === active ? 0 : -1}
                      aria-current={day === today ? "date" : undefined}
                      data-day={day}
                      onFocus={() => setActive(day)}
                      onKeyDown={(e) => onKeyDown(e, day, ci)}
                      className={cn(
                        "h-14 cursor-default border border-border p-1 align-top text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                        day === today && "bg-primary/10 font-semibold ring-1 ring-primary ring-inset",
                      )}
                    >
                      <span>{day}</span>
                      {day === today && <span className="ml-1 text-xs text-primary">Today</span>}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
