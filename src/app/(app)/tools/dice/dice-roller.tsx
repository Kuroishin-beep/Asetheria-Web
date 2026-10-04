"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, Dices, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/entry-card";
import { FormMessage } from "@/components/shared/form-message";
import { Eyebrow } from "@/components/shared/eyebrow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DiceError, rollMany, type RollResult } from "@/lib/dice";
import { cn } from "@/lib/utils";

const PRESETS = [
  "1d20",
  "1d20adv",
  "1d20dis",
  "1d4",
  "1d6",
  "1d8",
  "1d10",
  "1d12",
  "2d6",
  "1d100",
  "4d6kh3",
  "6x4d6kh3",
];

const NOTATION_REFERENCE: [string, string][] = [
  ["2d6+3", "two six-sided dice, plus three"],
  ["1d20adv", "advantage (roll twice, keep the best)"],
  ["1d20dis", "disadvantage"],
  ["4d6kh3", "roll four, keep the highest three"],
  ["2d20kl1", "roll two, keep the lowest"],
  ["3d6!", "exploding: max rolls again"],
  ["6x4d6kh3", "repeat the roll six times"],
  ["1d8+2d6-1", "combine any number of terms"],
];

const LOG_KEY = "asetheria-dice-log";
const LOG_LIMIT = 50;

type LogEntry = {
  id: number;
  at: string;
  results: RollResult[];
};

export function DiceRoller() {
  const [expr, setExpr] = useState("1d20");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const nextId = useRef(1);

  // Restore the log so a refresh mid-session doesn't lose the history.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(LOG_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as LogEntry[];
        setLog(parsed);
        nextId.current = (parsed[0]?.id ?? 0) + 1;
      }
    } catch {
      // Nothing worth surfacing: start with an empty log.
    }
    setRestored(true);
  }, []);

  // Saving waits until the saved log has been read. Without this, the first
  // save wrote the still-empty log over it (visible when React runs effects twice in development).
  useEffect(() => {
    if (!restored) return;
    try {
      sessionStorage.setItem(LOG_KEY, JSON.stringify(log.slice(0, LOG_LIMIT)));
    } catch {
      // Storage full or blocked; the log just won't persist.
    }
  }, [log, restored]);

  function doRoll(expression: string) {
    try {
      const results = rollMany(expression);
      setError(null);
      setLog((prev) =>
        [{ id: nextId.current++, at: new Date().toLocaleTimeString(), results }, ...prev].slice(0, LOG_LIMIT),
      );
    } catch (e) {
      setError(e instanceof DiceError ? e.message : "That roll didn't work.");
    }
  }

  return (
    <div className="grid gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          doRoll(expr);
        }}
        className="flex gap-3"
      >
        <Input
          value={expr}
          onChange={(e) => setExpr(e.target.value)}
          placeholder="1d20+5, 4d6kh3, 6x4d6kh3…"
          aria-label="Dice expression"
          className="font-mono text-base"
        />
        <Button type="submit">
          <Dices aria-hidden="true" />
          Roll
        </Button>
      </form>

      <div className="flex flex-wrap gap-1" role="group" aria-label="Common rolls">
        {PRESETS.map((p) => (
          <Button
            key={p}
            type="button"
            variant="outline"
            size="xs"
            className="rounded-full font-mono font-normal"
            onClick={() => {
              setExpr(p);
              doRoll(p);
            }}
          >
            {p}
          </Button>
        ))}
      </div>

      {error && <FormMessage>{error}</FormMessage>}

      <div className="mt-2 flex items-center justify-between">
        <h2>
          <Eyebrow>Rolls</Eyebrow>
        </h2>
        {log.length > 0 && (
          <Button type="button" variant="outline" size="xs" onClick={() => setLog([])}>
            <Trash2 aria-hidden="true" />
            Clear
          </Button>
        )}
      </div>

      {log.length === 0 ? (
        <EmptyState
          Icon={Dices}
          title="Nothing rolled yet"
          hint="Type an expression above, or tap a common roll."
          className="py-8"
        />
      ) : (
        <ul className="grid gap-2">
          {log.map((entry) => (
            <li key={entry.id}>
              <Card size="sm">
                <CardContent>
                  {entry.results.map((r, i) => (
                    <div
                      key={i}
                      className={cn("flex flex-wrap items-baseline gap-3", i > 0 && "mt-2 border-t border-border pt-2")}
                    >
                      <span
                        className={cn(
                          "font-display min-w-10 text-2xl font-bold",
                          r.crit === "hit" ? "text-success" : r.crit === "miss" ? "text-destructive" : "text-gold",
                        )}
                      >
                        {r.total}
                      </span>

                      <span className="min-w-40 flex-1">
                        <span className="font-mono text-[13px] text-muted-foreground">{r.expression}</span>
                        <span className="mt-0.5 block text-[13px] text-faint-foreground">
                          {r.groups.map((g, gi) => (
                            <span key={gi} className="mr-3">
                              {g.notation}: [{g.kept.join(", ")}
                              {g.dropped.length > 0 && (
                                <span className="line-through opacity-60"> {g.dropped.join(", ")}</span>
                              )}
                              ]
                            </span>
                          ))}
                          {r.modifier !== 0 && (
                            <span>
                              {r.modifier > 0 ? "+" : ""}
                              {r.modifier}
                            </span>
                          )}
                        </span>
                      </span>

                      {r.crit === "hit" && (
                        <Badge variant="outline" className="border-success text-success">
                          critical
                        </Badge>
                      )}
                      {r.crit === "miss" && (
                        <Badge variant="outline" className="border-destructive text-destructive">
                          fumble
                        </Badge>
                      )}
                      {i === 0 && <span className="text-[11px] text-faint-foreground">{entry.at}</span>}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card size="sm" className="mt-4">
        <CardContent>
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
              <ChevronRight aria-hidden="true" className="size-4 transition-transform duration-150 group-open:rotate-90" />
              Notation reference
            </summary>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              {NOTATION_REFERENCE.map(([code, desc]) => (
                <div key={code} className="contents">
                  <dt className="font-mono text-gold">{code}</dt>
                  <dd className="text-muted-foreground">{desc}</dd>
                </div>
              ))}
            </dl>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}
