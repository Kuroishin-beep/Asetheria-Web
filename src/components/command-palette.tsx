"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

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

/**
 * Ctrl/Cmd-K search. Deliberately keyboard-first: at the table you want to find
 * an NPC in two seconds without reaching for the mouse.
 */
export function CommandPalette() {
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

  const go = useCallback(
    (hit: Hit) => {
      setOpen(false);
      router.push(`/codex/entry/${hit.slug}`);
    },
    [router],
  );

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[active]) go(results[active]);
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
                placeholder="Find a god, city, faction, NPC…"
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
              {results.length === 0 && query.trim().length >= 2 && !loading && (
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
              {results.map((hit, idx) => (
                <button
                  key={hit.id}
                  type="button"
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => go(hit)}
                  style={{
                    display: "flex",
                    gap: "0.75rem",
                    alignItems: "baseline",
                    width: "100%",
                    textAlign: "left",
                    padding: "0.7rem 1rem",
                    background:
                      idx === active ? "var(--bg-sunken)" : "transparent",
                    border: 0,
                    borderLeft:
                      idx === active
                        ? "2px solid var(--accent)"
                        : "2px solid transparent",
                    cursor: "pointer",
                    color: "var(--text)",
                  }}
                >
                  <span aria-hidden="true">{ICONS[hit.kind] ?? "✦"}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 500 }}>
                      {hit.name}
                    </span>
                    {hit.summary && (
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
                        {hit.summary}
                      </span>
                    )}
                  </span>
                  <span
                    style={{
                      fontSize: "0.6875rem",
                      color: "var(--text-faint)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {hit.kind}
                  </span>
                </button>
              ))}
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
            </div>
          </div>
        </div>
      )}
    </>
  );
}
