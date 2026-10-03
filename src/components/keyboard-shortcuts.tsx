"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PAGE_KEYS, actionsFor, isTypingTarget } from "@/lib/shortcuts";

/** How long after `g` the second key of a chord is still accepted. */
const CHORD_WINDOW_MS = 1200;

function Keys({ keys }: { keys: string[] }) {
  return (
    <span style={{ display: "inline-flex", gap: "0.25rem" }}>
      {keys.map((k, i) => (
        <kbd
          key={`${k}-${i}`}
          style={{
            fontSize: "0.75rem",
            border: "1px solid var(--border-strong)",
            borderRadius: 4,
            padding: "0.05rem 0.4rem",
            minWidth: "1.4rem",
            textAlign: "center",
            color: "var(--text-muted)",
          }}
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}

/**
 * Global keyboard navigation, Superhuman-style: `g` then a letter jumps to a
 * section, `c` creates, `e` edits the page in front of you, and `?` lists it
 * all. Keystrokes typed into a field are never intercepted.
 */
export function KeyboardShortcuts({ isDM }: { isDM: boolean }) {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);
  const pendingG = useRef<number | null>(null);

  useEffect(() => {
    const actions = actionsFor(isDM);

    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]') && e.key !== "Escape") {
        return; // the palette or another dialog owns the keyboard
      }

      const key = e.key.toLowerCase();

      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        setHelpOpen(false);
        pendingG.current = null;
        return;
      }

      const now = Date.now();
      if (pendingG.current && now - pendingG.current < CHORD_WINDOW_MS) {
        pendingG.current = null;
        const hit = actions.find((a) => a.keys.length === 2 && a.keys[1] === key);
        if (hit?.href) {
          e.preventDefault();
          router.push(hit.href);
        }
        return;
      }
      if (key === "g") {
        pendingG.current = now;
        return;
      }

      const single = actions.find((a) => a.keys.length === 1 && a.keys[0] === key);
      if (single?.href) {
        e.preventDefault();
        router.push(single.href);
        return;
      }

      if (key === "e" && isDM) {
        const edit = document.querySelector<HTMLAnchorElement>('a[data-shortcut="edit"]');
        if (edit) {
          e.preventDefault();
          router.push(edit.getAttribute("href") ?? "/");
        }
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDM, router]);

  if (!helpOpen) return null;

  const nav = actionsFor(isDM);
  const page = PAGE_KEYS.filter((k) => isDM || !k.dmOnly);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setHelpOpen(false);
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 110,
        background: "rgb(0 0 0 / 0.55)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "max(5vh, 1rem) 1rem 1rem",
      }}
    >
      <div className="card" style={{ width: "min(36rem, 100%)", maxHeight: "85vh", overflowY: "auto", padding: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <h2 className="font-display" style={{ fontSize: "1.125rem", fontWeight: 700 }}>
            Keyboard shortcuts
          </h2>
          <button type="button" className="btn" onClick={() => setHelpOpen(false)} aria-label="Close shortcuts">
            ✕
          </button>
        </div>
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.5rem 1rem", alignItems: "center" }}>
          {[...page.map((k) => ({ keys: k.keys, label: k.label })), ...nav.map((a) => ({ keys: a.keys, label: a.label }))].map(
            (row) => (
              <div key={row.label} style={{ display: "contents" }}>
                <dt>
                  <Keys keys={row.keys} />
                </dt>
                <dd style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>{row.label}</dd>
              </div>
            ),
          )}
        </dl>
      </div>
    </div>
  );
}
