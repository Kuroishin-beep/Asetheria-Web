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
  fields: Record<string, string>;
  haystack: string;
};

type FieldDef = { key: string; label: string };

/**
 * Client-side filter over an already-loaded section. With at most a few hundred
 * entries per kind this is instant and avoids a round-trip per keystroke.
 */
export function KindFilter({
  items,
  total,
  noun,
  fieldDefs,
}: {
  items: Item[];
  total: number;
  noun: string;
  fieldDefs: FieldDef[];
}) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [view, setView] = useState<"cards" | "table">("cards");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "name", dir: 1 });

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

  const sorted = useMemo(() => {
    const value = (it: Item) => (sort.key === "name" ? it.name : it.fields[sort.key] ?? "");
    return [...filtered].sort(
      (a, b) => value(a).localeCompare(value(b), undefined, { numeric: true }) * sort.dir,
    );
  }, [filtered, sort]);

  function toggleSort(key: string) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  }

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
        {fieldDefs.length > 0 && (
          <div role="group" aria-label="View" style={{ display: "flex", gap: "0.25rem" }}>
            <button
              type="button"
              className="chip"
              aria-pressed={view === "cards"}
              onClick={() => setView("cards")}
              style={
                view === "cards"
                  ? { borderColor: "var(--accent)", color: "var(--accent)" }
                  : undefined
              }
            >
              ▦ Cards
            </button>
            <button
              type="button"
              className="chip"
              aria-pressed={view === "table"}
              onClick={() => setView("table")}
              style={
                view === "table"
                  ? { borderColor: "var(--accent)", color: "var(--accent)" }
                  : undefined
              }
            >
              ☰ Table
            </button>
          </div>
        )}
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
      ) : view === "table" ? (
        <div className="card" style={{ overflowX: "auto", padding: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr>
                <SortableHeader label="Name" sortKey="name" sort={sort} onSort={toggleSort} />
                {fieldDefs.map((f) => (
                  <SortableHeader key={f.key} label={f.label} sortKey={f.key} sort={sort} onSort={toggleSort} />
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((e) => (
                <tr key={e.id} style={{ borderTop: "1px solid var(--border-soft)" }}>
                  <td style={{ padding: "0.5rem 0.75rem" }}>
                    <Link href={`/codex/entry/${e.slug}`} style={{ color: "var(--accent)" }}>
                      {e.name}
                    </Link>
                  </td>
                  {fieldDefs.map((f) => (
                    <td
                      key={f.key}
                      style={{
                        padding: "0.5rem 0.75rem",
                        color: "var(--text-muted)",
                        maxWidth: "16rem",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={e.fields[f.key] ?? ""}
                    >
                      {e.fields[f.key] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <CardGrid>
          {sorted.map((e) => (
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

function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: string;
  sort: { key: string; dir: 1 | -1 };
  onSort: (key: string) => void;
}) {
  const active = sort.key === sortKey;
  return (
    <th style={{ textAlign: "left", padding: 0 }}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "0.5rem 0.75rem",
          background: "transparent",
          border: 0,
          font: "inherit",
          fontWeight: 600,
          color: active ? "var(--accent)" : "var(--text)",
          cursor: "pointer",
        }}
        aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
      >
        {label} {active ? (sort.dir === 1 ? "▲" : "▼") : ""}
      </button>
    </th>
  );
}
