"use client";

import { useMemo, useState } from "react";
import { CardGrid, EntryCard } from "@/components/entry-card";
import type { EntryKind } from "@/db/schema";

type Item = {
  id: string;
  slug: string;
  name: string;
  kind: EntryKind;
  summary: string;
  tags: string[];
  visibility: string;
  haystack: string;
};

/**
 * Client-side filter over an already-loaded section. With at most a few hundred
 * entries per kind this is instant and avoids a round-trip per keystroke.
 */
export function KindFilter({
  items,
  total,
  noun,
}: {
  items: Item[];
  total: number;
  noun: string;
}) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of items) {
      for (const t of it.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 24);
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (tag && !it.tags.includes(tag)) return false;
      if (!q) return true;
      return it.haystack.includes(q);
    });
  }, [items, query, tag]);

  return (
    <>
      <div
        className="no-print"
        style={{
          display: "flex",
          gap: "0.6rem",
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <input
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Filter ${total} ${noun}…`}
          aria-label={`Filter ${noun}`}
          style={{ flex: 1, minWidth: "12rem", maxWidth: "24rem" }}
        />
        <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
          {filtered.length === total
            ? `${total} total`
            : `${filtered.length} of ${total}`}
        </span>
      </div>

      {allTags.length > 1 && (
        <div
          className="no-print"
          style={{
            display: "flex",
            gap: "0.35rem",
            flexWrap: "wrap",
            marginBottom: "1.25rem",
          }}
        >
          <button
            type="button"
            className="chip"
            onClick={() => setTag(null)}
            style={
              tag === null
                ? { borderColor: "var(--accent)", color: "var(--accent)" }
                : undefined
            }
          >
            All
          </button>
          {allTags.map(([t, n]) => (
            <button
              key={t}
              type="button"
              className="chip"
              onClick={() => setTag(tag === t ? null : t)}
              style={
                tag === t
                  ? { borderColor: "var(--accent)", color: "var(--accent)" }
                  : undefined
              }
            >
              {t}
              <span style={{ color: "var(--text-faint)" }}>{n}</span>
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <p style={{ color: "var(--text-muted)", padding: "2rem 0" }}>
          Nothing matches that filter.
        </p>
      ) : (
        <CardGrid>
          {filtered.map((e) => (
            <EntryCard
              key={e.id}
              slug={e.slug}
              name={e.name}
              kind={e.kind}
              summary={e.summary}
              tags={e.tags}
              visibility={e.visibility}
            />
          ))}
        </CardGrid>
      )}
    </>
  );
}
