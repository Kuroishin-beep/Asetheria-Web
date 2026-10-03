"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { actionsFor, type AppAction } from "@/lib/shortcuts";

type Hit = {
  id: string;
  slug: string;
  name: string;
  kind: string;
  summary: string;
};

const ICONS: Record<string, string> = {
  deity: "☀", pantheon: "⛩", organization: "⚜", faction: "⚔", location: "⛰",
  empire: "👑", npc: "☗", family: "🛡", creature: "🐉", item: "⚗", ore: "⛏",
  flora: "🌿", lore: "📜", quest: "🗝", session: "🕮", rule: "⚖", system: "⚙",
  note: "✎",
};

type Row = { type: "action"; action: AppAction } | { type: "entry"; hit: Hit };

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
  const inputRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape") setOpen(false);
      // "/" opens search, unless the user is already typing somewhere.
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
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
      // Wait for the dialog to mount before focusing.
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    if (query.trim().length < 2) {
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
    }, 140);
    return () => clearTimeout(timer);
  }, [query]);

  // Commands first (all of them on an empty box, matching ones as you type),
  // then entries.
  const rows: Row[] = [
    ...actionsFor(isDM)
      .filter((a) => (query.trim() ? matchesAction(a, query.trim()) : true))
      .slice(0, query.trim() ? 4 : 12)
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

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
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
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn"
        style={{ gap: "0.6rem", color: "var(--text-muted)" }}
        aria-label="Search the codex"
        title="Search and commands (Ctrl K) — press ? for all shortcuts"
      >
        <span aria-hidden="true">⌕</span>
        <span className="hidden sm:inline">Search…</span>
        <kbd
          className="hidden md:inline"
          style={{
            fontSize: "0.6875rem",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: "0.05rem 0.3rem",
            color: "var(--text-faint)",
          }}
        >
          Ctrl K
        </kbd>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Search the codex"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgb(0 0 0 / 0.55)",
            backdropFilter: "blur(3px)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "max(3vh, 1rem) 1rem 1rem",
          }}
        >
          <div
            className="card"
            style={{
              width: "min(42rem, 100%)",
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                padding: "0.85rem 1rem",
                borderBottom: "1px solid var(--border-soft)",
              }}
            >
              <span aria-hidden="true" style={{ color: "var(--text-faint)" }}>
                ⌕
              </span>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKey}
                placeholder="Find a god, city, NPC — or type a command…"
                aria-label="Search query"
                style={{
                  flex: 1,
                  background: "transparent",
                  border: 0,
                  outline: "none",
                  color: "var(--text)",
                  fontSize: "1rem",
                }}
              />
              {loading && (
                <span style={{ fontSize: "0.75rem", color: "var(--text-faint)" }}>
                  …
                </span>
              )}
            </div>

            <div style={{ overflowY: "auto" }}>
              {rows.length === 0 && query.trim().length >= 2 && !loading && (
                <p
                  style={{
                    padding: "1.25rem 1rem",
                    color: "var(--text-muted)",
                    fontSize: "0.875rem",
                  }}
                >
                  Nothing found. Press Enter for a full-text search.
                </p>
              )}
              {rows.map((row, idx) => {
                const key = row.type === "entry" ? row.hit.id : `action-${row.action.id}`;
                const icon = row.type === "entry" ? (ICONS[row.hit.kind] ?? "✦") : "↳";
                const title = row.type === "entry" ? row.hit.name : row.action.label;
                const subtitle = row.type === "entry" ? row.hit.summary : null;
                const tag = row.type === "entry" ? row.hit.kind : row.action.keys.join(" then ");
                return (
                  <button
                    key={key}
                    type="button"
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => run(row)}
                    data-row-type={row.type}
                    style={{
                      display: "flex",
                      gap: "0.75rem",
                      alignItems: "baseline",
                      width: "100%",
                      textAlign: "left",
                      padding: "0.7rem 1rem",
                      background: idx === active ? "var(--bg-sunken)" : "transparent",
                      border: 0,
                      borderLeft: idx === active ? "2px solid var(--accent)" : "2px solid transparent",
                      cursor: "pointer",
                      color: "var(--text)",
                    }}
                  >
                    <span aria-hidden="true">{icon}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontWeight: 500 }}>{title}</span>
                      {subtitle && (
                        <span
                          style={{
                            display: "block",
                            fontSize: "0.8125rem",
                            color: "var(--text-muted)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {subtitle}
                        </span>
                      )}
                    </span>
                    <span
                      style={{
                        fontSize: "0.6875rem",
                        color: "var(--text-faint)",
                        textTransform: row.type === "entry" ? "uppercase" : "none",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {tag}
                    </span>
                  </button>
                );
              })}
            </div>

            <div
              style={{
                borderTop: "1px solid var(--border-soft)",
                padding: "0.5rem 1rem",
                fontSize: "0.6875rem",
                color: "var(--text-faint)",
                display: "flex",
                gap: "1rem",
                flexWrap: "wrap",
              }}
            >
              <span>↑↓ navigate</span>
              <span>↵ open</span>
              <span>esc close</span>
              <span>? all shortcuts</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
