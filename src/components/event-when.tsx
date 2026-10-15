"use client";

import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { CalendarConfig } from "@/lib/calendar";

function DateInputs({ prefix, label, calendar, fields }: { prefix: "" | "end"; label: string; calendar: CalendarConfig; fields: Record<string, string> }) {
  const key = (k: "Year" | "Month" | "Day") => (prefix === "" ? k.toLowerCase() : `end${k}`);
  const id = (k: "year" | "month" | "day") => `event-${prefix ? "end-" : ""}${k}`;
  return (
    <fieldset className="flex flex-wrap items-end gap-3">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <div className="grid gap-1">
        <Label htmlFor={id("year")}>{prefix ? "End year" : "Year"}</Label>
        <Input id={id("year")} name={`fields[${key("Year")}]`} defaultValue={fields[key("Year")] ?? ""} inputMode="numeric" className="w-28" />
      </div>
      <div className="grid gap-1">
        <Label htmlFor={id("month")}>{prefix ? "End month" : "Month"}</Label>
        <NativeSelect id={id("month")} name={`fields[${key("Month")}]`} defaultValue={fields[key("Month")] ?? ""}>
          <NativeSelectOption value="">Choose a month</NativeSelectOption>
          {calendar.months.map((m, i) => (
            <NativeSelectOption key={m.name} value={String(i + 1)}>
              {m.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-1">
        <Label htmlFor={id("day")}>{prefix ? "End day" : "Day"}</Label>
        <Input id={id("day")} name={`fields[${key("Day")}]`} defaultValue={fields[key("Day")] ?? ""} inputMode="numeric" className="w-24" />
      </div>
    </fieldset>
  );
}

/**
 * When an event happened, in the world's own calendar. All three of year, month and day, or none at all (an
 * undated event); an end date is optional. The months are the ones the DM defined, so nothing is made up here.
 */
export function EventWhen({ calendar, fields }: { calendar: CalendarConfig | null; fields: Record<string, string> }) {
  if (!calendar) {
    return (
      <p className="text-[13px] text-muted-foreground" data-testid="event-no-calendar">
        An event can only be dated once the calendar is set up, because its months and days come from there.{" "}
        <Link href="/calendar/setup" className="text-link underline-offset-4 hover:underline">
          Set up the calendar
        </Link>
        . Until then it is saved undated.
      </p>
    );
  }
  return (
    <div className="grid gap-4">
      <p className="text-[13px] text-muted-foreground">Fill in the year, month and day, or leave all three empty for an undated event. Years may be zero or negative.</p>
      <DateInputs prefix="" label="Starts" calendar={calendar} fields={fields} />
      <DateInputs prefix="end" label="Ends (only if it lasted more than a day)" calendar={calendar} fields={fields} />
    </div>
  );
}
