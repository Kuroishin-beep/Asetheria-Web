"use client";

import Link from "next/link";
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
 * Client-side filter over an already-loaded page of a section. With at most
 * `PAGE_SIZE` entries in memory this is instant and avoids a round-trip per
 * keystroke.
 *
 * Once a section spans more than one page the filter and the tag chips can only
 * describe the loaded page, so both say so and point at full-text search rather
 * than quietly reporting a partial count as if it were the whole section.
 */
export function KindFilter({
  items,
  total,
  noun,
  page,
  pageCount,
  basePath,
}: {
  items: Item[];
  total: number;
  noun: string;
  page: number;
  pageCount: number;
  basePath: string;
}) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const paged = pageCount > 1;

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
          placeholder={paged ? `Filter this page…` : `Filter ${total} ${noun}…`}
          aria-label={paged ? `Filter this page of ${noun}` : `Filter ${noun}`}
          style={{ flex: 1, minWidth: "12rem", maxWidth: "24rem" }}
        />
        <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
          {paged
            ? `${filtered.length} of ${items.length} shown · ${total} total`
            : filtered.length === total
              ? `${total} total`
              : `${filtered.length} of ${total}`}
        </span>
      </div>

      {paged && query.trim() !== "" && (
        <p
          className="no-print"
          style={{
            fontSize: "0.8125rem",
            color: "var(--text-muted)",
            marginBottom: "1rem",
          }}
        >
          Filtering page {page} of {pageCount}.{" "}
          <Link href={`/search?q=${encodeURIComponent(query.trim())}`}>
            Search all {total} {noun} →
          </Link>
        </p>
      )}

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

      {paged && (
        <nav
          className="no-print"
          aria-label={`${noun} pages`}
          style={{
            display: "flex",
            gap: "0.6rem",
            alignItems: "center",
            justifyContent: "center",
            flexWrap: "wrap",
            marginTop: "2rem",
          }}
        >
          {page > 1 ? (
            <Link className="btn" href={`${basePath}?page=${page - 1}`} rel="prev">
              ← Previous
            </Link>
          ) : (
            <span className="btn" aria-disabled="true" style={{ opacity: 0.45 }}>
              ← Previous
            </span>
          )}
          <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <Link className="btn" href={`${basePath}?page=${page + 1}`} rel="next">
              Next →
            </Link>
          ) : (
            <span className="btn" aria-disabled="true" style={{ opacity: 0.45 }}>
              Next →
            </span>
          )}
        </nav>
      )}
    </>
  );
}
