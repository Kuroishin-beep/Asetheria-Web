"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Eye, Pencil } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { renderMarkdown } from "@/lib/markdown";
import { cn } from "@/lib/utils";

type Suggestion = { id: string; name: string; kind: string; summary: string };

const DRAFT_PREFIX = "asetheria-draft:";
const DRAFT_SAVE_DELAY_MS = 400;
const SUGGESTION_DELAY_MS = 120;
const MAX_SUGGESTIONS = 8;
const MIN_QUERY_LENGTH = 2;

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
 * that make writing a wiki bearable:
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
  minHeightClass = "min-h-88",
}: {
  id: string;
  name: string;
  defaultValue: string;
  draftKey: string;
  /** Tailwind min-height class for the writing area (default 22rem). */
  minHeightClass?: string;
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
    }, DRAFT_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [value, draftKey, defaultValue, pendingDraft]);

  // [[ autocomplete
  useEffect(() => {
    if (!linkQuery || linkQuery.text.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      return;
    }
    const reqId = ++requestId.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/find?q=${encodeURIComponent(linkQuery.text)}`);
        const data = await res.json();
        if (reqId !== requestId.current) return;
        setSuggestions((data.results ?? []).slice(0, MAX_SUGGESTIONS));
        setActive(0);
      } catch {
        if (reqId === requestId.current) setSuggestions([]);
      }
    }, SUGGESTION_DELAY_MS);
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

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertLink(suggestions[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setSuggestions([]);
      setLinkQuery(null);
    }
  }

  const previewHtml = useMemo(() => (tab === "preview" ? renderMarkdown(value) : ""), [tab, value]);

  return (
    <div className="relative grid gap-2">
      {pendingDraft !== null && (
        <Alert role="status" className="flex flex-wrap items-center gap-3">
          <AlertDescription className="min-w-48 flex-1">
            You have unsaved changes from an earlier visit.
          </AlertDescription>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setValue(pendingDraft);
              setPendingDraft(null);
            }}
          >
            Restore draft
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              writeDraft(draftKey, null);
              setPendingDraft(null);
            }}
          >
            Discard
          </Button>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v === "preview" ? "preview" : "write")}>
        <TabsList aria-label="Editor mode">
          <TabsTrigger value="write">
            <Pencil aria-hidden="true" />
            Write
          </TabsTrigger>
          <TabsTrigger value="preview">
            <Eye aria-hidden="true" />
            Preview
          </TabsTrigger>
        </TabsList>

        {/* Both panels stay mounted so the textarea is always part of the form that submits. */}
        <TabsContent value="write" forceMount className="relative data-[state=inactive]:hidden">
          <Textarea
            ref={textareaRef}
            id={id}
            name={name}
            className={cn("font-prose text-base leading-relaxed", minHeightClass)}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              detectLinkQuery(e.target.value, e.target.selectionStart);
            }}
            onKeyDown={onKeyDown}
            onBlur={() => setTimeout(() => setSuggestions([]), 150)}
            aria-label="Description"
            aria-autocomplete="list"
            aria-controls={suggestions.length ? `${id}-links` : undefined}
            aria-activedescendant={suggestions.length ? `${id}-option-${active}` : undefined}
          />

          {suggestions.length > 0 && (
            <ul
              id={`${id}-links`}
              role="listbox"
              aria-label="Link to an entry"
              className="absolute inset-x-2 bottom-2 z-20 max-h-64 overflow-y-auto rounded-lg bg-popover p-1 shadow-lg ring-1 ring-foreground/10"
            >
              {suggestions.map((s, idx) => (
                <li
                  key={s.id}
                  id={`${id}-option-${idx}`}
                  role="option"
                  aria-selected={idx === active}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertLink(s);
                  }}
                  onMouseEnter={() => setActive(idx)}
                  className={cn("cursor-pointer rounded-md px-3 py-2", idx === active && "bg-accent")}
                >
                  <span className="font-medium">{s.name}</span>{" "}
                  <span className="text-xs uppercase text-faint-foreground">{s.kind}</span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="preview" forceMount className="data-[state=inactive]:hidden">
          <div
            className={cn("prose-codex rounded-xl bg-card p-4 ring-1 ring-foreground/10", minHeightClass)}
            // renderMarkdown escapes the source first; only its own tags are emitted.
            dangerouslySetInnerHTML={{
              __html: previewHtml || "<p><em>Nothing written yet.</em></p>",
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
