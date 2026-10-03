"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { renderMarkdown } from "@/lib/markdown";

type Suggestion = { id: string; name: string; kind: string; summary: string };

const DRAFT_PREFIX = "asetheria-draft:";

function readDraft(key: string): string | null {
  try {
    return localStorage.getItem(DRAFT_PREFIX + key);
  } catch {
    return null;
  }
}

function writeDraft(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(DRAFT_PREFIX + key);
    else localStorage.setItem(DRAFT_PREFIX + key, value);
  } catch {
    // Private mode or storage full: drafts are a convenience, not a guarantee.
  }
}

/** Clears a draft once the form holding it has been submitted. */
export function clearDraft(key: string) {
  writeDraft(key, null);
}

/**
 * The description editor: a plain markdown textarea with the three things
 * that make writing a wiki bearable —
 *
 *  - **[[ autocomplete** (Obsidian): typing `[[` suggests entries by name, and
 *    Enter/Tab inserts a link that resolves;
 *  - **Preview** (Notion): see the page as it will read, links included;
 *  - **Draft recovery**: every keystroke is kept in this browser until the
 *    form is saved, so a closed tab or a crash never loses an evening's notes.
 */
export function MarkdownEditor({
  id,
  name,
  defaultValue,
  draftKey,
  minHeight = "22rem",
}: {
  id: string;
  name: string;
  defaultValue: string;
  draftKey: string;
  minHeight?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [pendingDraft, setPendingDraft] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);
  const [linkQuery, setLinkQuery] = useState<{ start: number; text: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const requestId = useRef(0);

  // Offer an unsaved draft from a previous visit, if it differs from what's saved.
  useEffect(() => {
    const draft = readDraft(draftKey);
    if (draft !== null && draft !== defaultValue) setPendingDraft(draft);
  }, [draftKey, defaultValue]);

  useEffect(() => {
    if (pendingDraft !== null) return; // don't overwrite the draft before it's been offered
    const timer = setTimeout(() => {
      writeDraft(draftKey, value === defaultValue ? null : value);
    }, 400);
    return () => clearTimeout(timer);
  }, [value, draftKey, defaultValue, pendingDraft]);

  // [[ autocomplete
  useEffect(() => {
    if (!linkQuery || linkQuery.text.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const reqId = ++requestId.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/find?q=${encodeURIComponent(linkQuery.text)}`);
        const data = await res.json();
        if (reqId !== requestId.current) return;
        setSuggestions((data.results ?? []).slice(0, 8));
        setActive(0);
      } catch {
        if (reqId === requestId.current) setSuggestions([]);
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [linkQuery]);

  function detectLinkQuery(text: string, caret: number) {
    const before = text.slice(0, caret);
    const open = before.lastIndexOf("[[");
    if (open === -1) return setLinkQuery(null);
    const fragment = before.slice(open + 2);
    if (fragment.includes("]]") || fragment.includes("\n") || fragment.length > 60) {
      return setLinkQuery(null);
    }
    setLinkQuery({ start: open, text: fragment.split("|")[0] });
  }

  function insertLink(s: Suggestion) {
    const el = textareaRef.current;
    if (!el || !linkQuery) return;
    const caret = el.selectionStart;
    const after = value.slice(caret);
    // Swallow an auto-typed or existing closing bracket pair after the caret.
    const rest = after.startsWith("]]") ? after.slice(2) : after;
    const link = `[[${s.name}]]`;
    const next = value.slice(0, linkQuery.start) + link + rest;
    setValue(next);
    setLinkQuery(null);
    setSuggestions([]);
    requestAnimationFrame(() => {
      const pos = linkQuery.start + link.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, suggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertLink(suggestions[active]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSuggestions([]);
        setLinkQuery(null);
        return;
      }
    }
  }

  const previewHtml = useMemo(
    () => (tab === "preview" ? renderMarkdown(value) : ""),
    [tab, value],
  );

  const tabStyle = (on: boolean): React.CSSProperties => ({
    borderColor: on ? "var(--accent)" : undefined,
    color: on ? "var(--accent)" : undefined,
  });

  return (
    <div style={{ display: "grid", gap: "0.5rem", position: "relative" }}>
      {pendingDraft !== null && (
        <div
          role="status"
          className="card"
          style={{
            padding: "0.6rem 0.8rem",
            display: "flex",
            gap: "0.6rem",
            alignItems: "center",
            flexWrap: "wrap",
            fontSize: "0.8125rem",
          }}
        >
          <span style={{ flex: 1, minWidth: "12rem" }}>
            You have unsaved changes from an earlier visit.
          </span>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setValue(pendingDraft);
              setPendingDraft(null);
            }}
          >
            Restore draft
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              writeDraft(draftKey, null);
              setPendingDraft(null);
            }}
          >
            Discard
          </button>
        </div>
      )}

      <div role="tablist" aria-label="Editor mode" style={{ display: "flex", gap: "0.35rem" }}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "write"}
          className="chip"
          style={tabStyle(tab === "write")}
          onClick={() => setTab("write")}
        >
          ✎ Write
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "preview"}
          className="chip"
          style={tabStyle(tab === "preview")}
          onClick={() => setTab("preview")}
        >
          👁 Preview
        </button>
      </div>

      {/* The textarea stays mounted (hidden in preview) so the form always submits it. */}
      <textarea
        ref={textareaRef}
        id={id}
        name={name}
        className="textarea"
        style={{
          minHeight,
          fontFamily: "var(--font-prose)",
          display: tab === "write" ? undefined : "none",
        }}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          detectLinkQuery(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setSuggestions([]), 150)}
        aria-autocomplete="list"
        aria-controls={suggestions.length ? `${id}-links` : undefined}
        aria-expanded={suggestions.length > 0}
      />

      {tab === "preview" && (
        <div
          className="prose-codex card"
          style={{ minHeight, padding: "1rem 1.15rem" }}
          // renderMarkdown escapes the source first; only its own tags are emitted.
          dangerouslySetInnerHTML={{
            __html: previewHtml || "<p><em>Nothing written yet.</em></p>",
          }}
        />
      )}

      {suggestions.length > 0 && tab === "write" && (
        <ul
          id={`${id}-links`}
          role="listbox"
          aria-label="Link to an entry"
          className="card"
          style={{
            position: "absolute",
            left: "0.5rem",
            right: "0.5rem",
            bottom: "0.5rem",
            zIndex: 20,
            listStyle: "none",
            margin: 0,
            padding: "0.3rem",
            maxHeight: "16rem",
            overflowY: "auto",
          }}
        >
          {suggestions.map((s, idx) => (
            <li
              key={s.id}
              role="option"
              aria-selected={idx === active}
              onMouseDown={(e) => {
                e.preventDefault();
                insertLink(s);
              }}
              onMouseEnter={() => setActive(idx)}
              style={{
                padding: "0.45rem 0.6rem",
                borderRadius: 6,
                cursor: "pointer",
                background: idx === active ? "var(--bg-sunken)" : "transparent",
              }}
            >
              <span style={{ fontWeight: 500 }}>{s.name}</span>{" "}
              <span style={{ fontSize: "0.75rem", color: "var(--text-faint)", textTransform: "uppercase" }}>
                {s.kind}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
