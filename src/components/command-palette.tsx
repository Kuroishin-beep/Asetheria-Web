"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, CornerDownRight, Search } from "lucide-react";
import type { EntryKind } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { KIND_ICONS } from "@/lib/section-icons";
import { actionsFor, type AppAction } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

type Hit = {
  id: string;
  slug: string;
  name: string;
  kind: string;
  summary: string;
};

type Row = { type: "action"; action: AppAction } | { type: "entry"; hit: Hit };

const MIN_QUERY_LENGTH = 2;
const SEARCH_DELAY_MS = 140;
const EMPTY_BOX_COMMANDS = 12;
const TYPED_COMMANDS = 4;

function matchesAction(a: AppAction, q: string): boolean {
  const hay = `${a.label} ${a.keywords ?? ""}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

/**
 * Ctrl/Cmd-K: search entries and run commands from one box, Superhuman-style.
 * Deliberately keyboard-first: at the table you want to find an NPC, or jump
 * to the dice, in two seconds without reaching for the mouse.
 */
export function CommandPalette({ isDM = false }: { isDM?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      // "/" opens search, unless the user is already typing somewhere.
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setActive(0);
    } else {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    if (query.trim().length < MIN_QUERY_LENGTH) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/find?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        // Ignore responses that arrive after a newer keystroke.
        if (id !== requestId.current) return;
        setResults(data.results ?? []);
        setActive(0);
      } catch {
        if (id === requestId.current) setResults([]);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // Commands first (all of them on an empty box, matching ones as you type),
  // then entries.
  const rows: Row[] = [
    ...actionsFor(isDM)
      .filter((a) => (query.trim() ? matchesAction(a, query.trim()) : true))
      .slice(0, query.trim() ? TYPED_COMMANDS : EMPTY_BOX_COMMANDS)
      .map((action) => ({ type: "action" as const, action })),
    ...results.map((hit) => ({ type: "entry" as const, hit })),
  ];

  const run = useCallback(
    (row: Row) => {
      setOpen(false);
      if (row.type === "entry") router.push(`/codex/entry/${row.hit.slug}`);
      else if (row.action.href) router.push(row.action.href);
    },
    [router],
  );

  function onInputKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (rows[active]) run(rows[active]);
      else if (query.trim()) {
        setOpen(false);
        router.push(`/search?q=${encodeURIComponent(query)}`);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* A real trigger, so closing the dialog returns focus to this button. */}
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="gap-2 text-muted-foreground max-sm:size-9 max-sm:px-0"
          aria-label="Search the codex"
          title="Search and commands (Ctrl K). Press ? for all shortcuts"
        >
          <Search aria-hidden="true" />
          <span className="hidden sm:inline">Search…</span>
          <Kbd className="hidden md:inline-flex">Ctrl K</Kbd>
        </Button>
      </DialogTrigger>

        <DialogContent
          showCloseButton={false}
          className="top-[12vh] flex max-h-[80vh] translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        >
          <DialogTitle className="sr-only">Search the codex</DialogTitle>
          <DialogDescription className="sr-only">
            Find entries or run a command. Use the arrow keys to move and Enter to open.
          </DialogDescription>

          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <Search aria-hidden="true" className="size-4 shrink-0 text-faint-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKey}
              placeholder="Find a god, city, NPC, or type a command…"
              aria-label="Search query"
              className="h-auto min-w-0 flex-1 border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
            {loading && <span className="text-xs text-faint-foreground">…</span>}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {rows.length === 0 && query.trim().length >= MIN_QUERY_LENGTH && !loading && (
              <p className="px-4 py-5 text-sm text-muted-foreground">
                Nothing found. Press Enter for a full-text search.
              </p>
            )}
            {rows.map((row, idx) => {
              const key = row.type === "entry" ? row.hit.id : `action-${row.action.id}`;
              const Icon = row.type === "entry" ? (KIND_ICONS[row.hit.kind as EntryKind] ?? Search) : CornerDownRight;
              const title = row.type === "entry" ? row.hit.name : row.action.label;
              const subtitle = row.type === "entry" ? row.hit.summary : null;
              const tag = row.type === "entry" ? row.hit.kind : row.action.keys.join(" then ");
              return (
                <Button
                  key={key}
                  type="button"
                  variant="ghost"
                  data-row-type={row.type}
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => run(row)}
                  className={cn(
                    "h-auto w-full justify-start gap-3 rounded-none border-l-2 border-transparent px-4 py-3 text-left font-normal",
                    idx === active && "border-l-primary bg-accent",
                  )}
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0 text-gold" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{title}</span>
                    {subtitle && (
                      <span className="block truncate text-[13px] text-muted-foreground">{subtitle}</span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "text-[11px] tracking-[0.06em] text-faint-foreground",
                      row.type === "entry" && "uppercase",
                    )}
                  >
                    {tag}
                  </span>
                </Button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-4 border-t border-border px-4 py-2 text-[11px] text-faint-foreground">
            <span>↑↓ navigate</span>
            <span className="inline-flex items-center gap-1">
              <CornerDownLeft aria-hidden="true" className="size-3" /> open
            </span>
            <span>esc close</span>
            <span>? all shortcuts</span>
          </div>
        </DialogContent>
    </Dialog>
  );
}
