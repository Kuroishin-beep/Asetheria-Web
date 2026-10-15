"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { CALENDAR_LIMITS, validateConfig, type CalendarConfig, type CalendarDate } from "@/lib/calendar";

/** A whole number written with digits only (and an optional minus), else NaN: Number() alone would accept "1e3". */
const whole = (text: string) => (/^-?\d{1,9}$/.test(text.trim()) ? Number(text.trim()) : Number.NaN);

type Initial = { config: CalendarConfig; current: CalendarDate } | null;

/**
 * Defining the world's calendar: its months and how long they are, its weekdays, a label for years and the
 * current date. Nothing is filled in for the DM: the names are theirs to write.
 */
export function CalendarSetupForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [months, setMonths] = useState<{ name: string; days: string }[]>(initial ? initial.config.months.map((m) => ({ name: m.name, days: String(m.days) })) : [{ name: "", days: "" }]);
  const [weekdays, setWeekdays] = useState<string[]>(initial ? initial.config.weekdays : [""]);
  const [yearLabel, setYearLabel] = useState(initial?.config.yearLabel ?? "");
  const [firstWeekday, setFirstWeekday] = useState(String(initial?.config.firstWeekday ?? 0));
  const [year, setYear] = useState(String(initial?.current.year ?? 1));
  const [month, setMonth] = useState(String(initial?.current.month ?? 1));
  const [day, setDay] = useState(String(initial?.current.day ?? 1));
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const yearDays = months.reduce((sum, m) => sum + (Number.isInteger(whole(m.days)) ? whole(m.days) : 0), 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const config: CalendarConfig = {
      months: months.map((m) => ({ name: m.name, days: whole(m.days) })),
      weekdays,
      yearLabel,
      firstWeekday: Number(firstWeekday),
    };
    const current = { year: whole(year), month: Number(month), day: whole(day) };
    const problems = validateConfig(config);
    if (!Number.isInteger(current.year) || !Number.isInteger(current.day)) problems.push("The current year and day must be whole numbers.");
    if (problems.length > 0) {
      setErrors(problems);
      return;
    }
    setBusy(true);
    setErrors([]);
    try {
      const res = await fetch("/api/calendar", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...config, current }) });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setErrors([data?.error ?? "Could not save the calendar."]);
        return;
      }
      toast.success("Calendar saved");
      router.push("/calendar");
      router.refresh();
    } catch {
      setErrors(["Could not reach the server. Check your connection and try again."]);
    } finally {
      setBusy(false);
    }
  }

  const L = CALENDAR_LIMITS;

  return (
    <form onSubmit={submit} noValidate className="grid gap-6">
      <Card>
        <CardContent className="grid gap-4">
          <h2 className="font-display text-lg font-bold">Months</h2>
          <p className="text-[13px] text-muted-foreground">
            Name each month and say how many days it has (1 to {L.maxDaysPerMonth}). A year is the months added together: {yearDays.toLocaleString("en")} days so far.
          </p>
          <ol className="grid gap-2">
            {months.map((m, i) => (
              <li key={i} className="flex flex-wrap items-end gap-2">
                <div className="grid gap-1">
                  <Label htmlFor={`month-name-${i}`}>Month {i + 1} name</Label>
                  <Input id={`month-name-${i}`} value={m.name} onChange={(e) => setMonths((all) => all.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="w-52" maxLength={L.maxNameLength + 10} />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`month-days-${i}`}>Month {i + 1} days</Label>
                  <Input id={`month-days-${i}`} inputMode="numeric" value={m.days} onChange={(e) => setMonths((all) => all.map((x, j) => (j === i ? { ...x, days: e.target.value } : x)))} className="w-24" />
                </div>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove month ${i + 1}`} disabled={months.length === 1} onClick={() => setMonths((all) => all.filter((_, j) => j !== i))}>
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ol>
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => setMonths((all) => [...all, { name: "", days: "" }])} disabled={months.length >= L.maxMonths} data-testid="add-month">
              <Plus aria-hidden="true" />
              Add a month
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-4">
          <h2 className="font-display text-lg font-bold">Weekdays</h2>
          <ol className="grid gap-2">
            {weekdays.map((w, i) => (
              <li key={i} className="flex flex-wrap items-end gap-2">
                <div className="grid gap-1">
                  <Label htmlFor={`weekday-${i}`}>Weekday {i + 1} name</Label>
                  <Input id={`weekday-${i}`} value={w} onChange={(e) => setWeekdays((all) => all.map((x, j) => (j === i ? e.target.value : x)))} className="w-52" maxLength={L.maxNameLength + 10} />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove weekday ${i + 1}`}
                  disabled={weekdays.length === 1}
                  onClick={() => {
                    setWeekdays((all) => all.filter((_, j) => j !== i));
                    if (Number(firstWeekday) >= weekdays.length - 1) setFirstWeekday("0");
                  }}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ol>
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => setWeekdays((all) => [...all, ""])} disabled={weekdays.length >= L.maxWeekdays} data-testid="add-weekday">
              <Plus aria-hidden="true" />
              Add a weekday
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-4">
          <h2 className="font-display text-lg font-bold">Years and today</h2>
          <div className="flex flex-wrap items-end gap-4">
            <div className="grid gap-1">
              <Label htmlFor="year-label">Year label (optional)</Label>
              <Input id="year-label" value={yearLabel} onChange={(e) => setYearLabel(e.target.value)} className="w-40" maxLength={L.maxLabelLength + 10} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="first-weekday">Weekday of the first day of year 1</Label>
              <NativeSelect id="first-weekday" value={firstWeekday} onChange={(e) => setFirstWeekday(e.target.value)}>
                {weekdays.map((w, i) => (
                  <NativeSelectOption key={i} value={String(i)}>
                    {w.trim() || `Weekday ${i + 1}`}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </div>
          <fieldset className="flex flex-wrap items-end gap-4">
            <legend className="mb-2 text-sm font-medium">The current date</legend>
            <div className="grid gap-1">
              <Label htmlFor="current-year">Year</Label>
              <Input id="current-year" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} className="w-28" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="current-month">Month</Label>
              <NativeSelect id="current-month" value={month} onChange={(e) => setMonth(e.target.value)}>
                {months.map((m, i) => (
                  <NativeSelectOption key={i} value={String(i + 1)}>
                    {m.name.trim() || `Month ${i + 1}`}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="current-day">Day</Label>
              <Input id="current-day" inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)} className="w-24" />
            </div>
          </fieldset>
        </CardContent>
      </Card>

      {errors.length > 0 && (
        <div role="alert" className="rounded-lg border border-destructive/50 p-3 text-sm text-destructive" data-testid="setup-errors">
          <p className="font-semibold">The calendar can&rsquo;t be saved yet:</p>
          <ul className="mt-1 list-disc pl-5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <Button type="submit" disabled={busy} data-testid="setup-save">
          <Save aria-hidden="true" />
          Save the calendar
        </Button>
      </div>
    </form>
  );
}
