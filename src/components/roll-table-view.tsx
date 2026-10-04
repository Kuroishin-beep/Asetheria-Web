"use client";

import { useRef, useState } from "react";
import { Dices } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { roll } from "@/lib/dice";
import type { RollRow } from "@/lib/roll-table";
import { cn } from "@/lib/utils";

type Outcome = { id: number; total: number; index: number | null };

const HISTORY_LIMIT = 5;

function rangeLabel(row: RollRow): string {
  return row.min === row.max ? String(row.min) : `${row.min}-${row.max}`;
}

/**
 * A random table you can roll. Draws the table, rolls its dice with the same
 * engine as the dice tool, highlights the row that came up, and keeps the last
 * few rolls. The result is announced to screen readers when it changes.
 */
export function RollTableView({ dice, rows }: { dice: string; rows: RollRow[] }) {
  const [history, setHistory] = useState<Outcome[]>([]);
  const nextId = useRef(1);
  const latest = history[0] ?? null;

  function rollNow() {
    const total = roll(dice).total;
    const index = rows.findIndex((row) => total >= row.min && total <= row.max);
    setHistory((prev) =>
      [{ id: nextId.current++, total, index: index === -1 ? null : index }, ...prev].slice(0, HISTORY_LIMIT),
    );
  }

  return (
    <Card size="sm" className="mb-6">
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={rollNow}>
            <Dices aria-hidden="true" />
            Roll on this table
          </Button>
          <Badge variant="outline" className="font-mono">
            {dice}
          </Badge>
          <p className="min-w-48 flex-1 text-sm" role="status" aria-live="polite">
            {latest ? (
              latest.index === null ? (
                <span className="text-muted-foreground">
                  Rolled {latest.total}: no row covers that number.
                </span>
              ) : (
                <>
                  <span className="font-display text-lg font-bold text-gold">{latest.total}</span>{" "}
                  <span>{rows[latest.index].result}</span>
                </>
              )
            ) : (
              <span className="text-muted-foreground">Not rolled yet.</span>
            )}
          </p>
        </div>

        <div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-24">Roll</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => {
                const hit = latest?.index === i;
                return (
                  <TableRow
                    key={`${row.min}-${row.max}`}
                    data-hit={hit ? "true" : undefined}
                    aria-current={hit ? "true" : undefined}
                    className={cn(hit && "bg-primary/10 hover:bg-primary/10")}
                  >
                    <TableCell className={cn("font-mono tabular-nums", hit && "font-semibold text-gold")}>
                      {rangeLabel(row)}
                    </TableCell>
                    <TableCell className="whitespace-normal">{row.result}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {history.length > 1 && (
          <p className="text-xs text-muted-foreground">
            Earlier rolls: {history.slice(1).map((h) => h.total).join(", ")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
