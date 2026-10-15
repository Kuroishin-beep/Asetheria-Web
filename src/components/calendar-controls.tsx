"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** The DM's controls for the current date: a day back, a day on, or any number of days. */
export function CalendarControls({ weekLength }: { weekLength: number }) {
  const router = useRouter();
  const [days, setDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function move(n: number) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/calendar/advance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ days: n }) });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "Could not move the date.");
        return;
      }
      toast.success(n > 0 ? `Moved on ${n} ${n === 1 ? "day" : "days"}` : `Moved back ${-n} ${n === -1 ? "day" : "days"}`);
      router.replace("/calendar");
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    // Digits only (with an optional minus): Number() would also accept things like "1e3" or " 0x10".
    const n = /^-?\d{1,5}$/.test(days.trim()) ? Number(days.trim()) : Number.NaN;
    if (!Number.isInteger(n) || n === 0) {
      setError("Type a whole number of days, such as 3 or -2.");
      return;
    }
    void move(n);
  }

  return (
    <div className="no-print grid gap-3 rounded-xl border border-border bg-card p-4" role="group" aria-label="Move the current date">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => move(-1)} disabled={busy} data-testid="day-back">
          <ArrowLeft aria-hidden="true" />
          Previous day
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => move(1)} disabled={busy} data-testid="day-next">
          Next day
          <ArrowRight aria-hidden="true" />
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => move(weekLength)} disabled={busy} data-testid="week-next">
          Next week
        </Button>
        <Button asChild variant="ghost" size="sm" className="ml-auto">
          <Link href="/calendar/setup">
            <Settings2 aria-hidden="true" />
            Calendar setup
          </Link>
        </Button>
      </div>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <Label htmlFor="advance-days">Move by this many days (negative goes back)</Label>
          <Input id="advance-days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} className="w-40" placeholder="for example 10" />
        </div>
        <Button type="submit" size="sm" disabled={busy} data-testid="advance-go">
          Move
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-destructive" data-testid="calendar-error">
          {error}
        </p>
      )}
    </div>
  );
}
