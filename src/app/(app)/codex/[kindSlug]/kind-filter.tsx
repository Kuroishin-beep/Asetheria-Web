"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Columns3, LayoutGrid, Search, Table2 } from "lucide-react";
import { CardGrid, EmptyState, EntryCard } from "@/components/entry-card";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { EntryKind } from "@/db/schema";
import { SORT_NAME, type SortSpec } from "@/lib/field-sort";
import { cn } from "@/lib/utils";

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

const MAX_TAG_CHIPS = 24;

/**
 * The database view of a section. The view, sort order and visible columns live
 * in the URL (`?view=table&sort=costPerLb&dir=desc&cols=...`) and are applied by
 * the server across the whole section; this component only reads them and
 * writes them back. The text filter and tag chips work on the loaded page. With at most
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
  fieldDefs,
  view,
  sort,
  columns,
  defaultColumns,
  page,
  pageCount,
  basePath,
}: {
  items: Item[];
  total: number;
  noun: string;
  fieldDefs: FieldDef[];
  view: "cards" | "table";
  sort: SortSpec;
  columns: string[];
  defaultColumns: string[];
  page: number;
  pageCount: number;
  basePath: string;
}) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const paged = pageCount > 1;
  const visibleFields = fieldDefs.filter((f) => columns.includes(f.key));

  /** The URL parameters that describe a view state; defaults are left out so URLs stay short. */
  function paramsFor(nextView: "cards" | "table", nextSort: SortSpec, nextColumns: string[]) {
    const params = new URLSearchParams();
    if (nextView === "table") params.set("view", "table");
    if (nextSort.key !== SORT_NAME || nextSort.dir !== "asc") {
      params.set("sort", nextSort.key);
      params.set("dir", nextSort.dir);
    }
    const isDefault = nextColumns.length === defaultColumns.length && defaultColumns.every((k) => nextColumns.includes(k));
    if (!isDefault) params.set("cols", nextColumns.join(","));
    return params;
  }

  /** Writes a new view state to the URL; the page resets to 1 because the order changed. */
  function go(next: { view?: "cards" | "table"; sort?: SortSpec; columns?: string[] }) {
    const qs = paramsFor(next.view ?? view, next.sort ?? sort, next.columns ?? columns).toString();
    startTransition(() => router.replace(qs ? `${basePath}?${qs}` : basePath, { scroll: false }));
  }

  function pageHref(target: number) {
    const params = paramsFor(view, sort, columns);
    params.set("page", String(target));
    return `${basePath}?${params.toString()}`;
  }

  function toggleSort(key: string) {
    go({ sort: sort.key === key ? { key, dir: sort.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" } });
  }

  function toggleColumn(key: string, on: boolean) {
    const next = fieldDefs.map((f) => f.key).filter((k) => (k === key ? on : columns.includes(k)));
    go({ columns: next.length ? next : defaultColumns });
  }

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of items) {
      for (const t of it.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MAX_TAG_CHIPS);
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
      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-48 max-w-sm flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={paged ? "Filter this page…" : `Filter ${total} ${noun}…`}
            aria-label={paged ? `Filter this page of ${noun}` : `Filter ${noun}`}
            className="pl-9"
          />
        </div>
        <span className="text-[13px] text-muted-foreground">
          {paged
            ? `${filtered.length} of ${items.length} shown · ${total} total`
            : filtered.length === total
              ? `${total} total`
              : `${filtered.length} of ${total}`}
        </span>
        {fieldDefs.length > 0 && (
          <div role="group" aria-label="View" className="flex gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={view === "cards"}
              onClick={() => go({ view: "cards" })}
              className={cn(view === "cards" && "border-primary text-gold")}
            >
              <LayoutGrid aria-hidden="true" />
              Cards
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={view === "table"}
              onClick={() => go({ view: "table" })}
              className={cn(view === "table" && "border-primary text-gold")}
            >
              <Table2 aria-hidden="true" />
              Table
            </Button>
          </div>
        )}
        {view === "table" && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <Columns3 aria-hidden="true" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
              <DropdownMenuLabel>Show columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {fieldDefs.map((f) => (
                <DropdownMenuCheckboxItem
                  key={f.key}
                  checked={columns.includes(f.key)}
                  onCheckedChange={(on) => toggleColumn(f.key, on === true)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {f.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {paged && query.trim() !== "" && (
        <p className="no-print mb-4 text-[13px] text-muted-foreground">
          Filtering page {page} of {pageCount}.{" "}
          <Link href={`/search?q=${encodeURIComponent(query.trim())}`} className="text-link underline-offset-4 hover:underline">
            Search all {total} {noun} →
          </Link>
        </p>
      )}

      {allTags.length > 1 && (
        <div className="no-print mb-6 flex flex-wrap gap-1">
          <TagChip active={tag === null} onClick={() => setTag(null)}>
            All
          </TagChip>
          {allTags.map(([t, n]) => (
            <TagChip key={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)}>
              {t}
              <span className="text-faint-foreground">{n}</span>
            </TagChip>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          Icon={Search}
          title="Nothing matches that filter"
          hint="Try a different word, or clear the tag filter."
          action={
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setQuery("");
                setTag(null);
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : view === "table" ? (
        <div className={cn("max-w-full rounded-xl bg-card ring-1 ring-foreground/10", pending && "opacity-70")} aria-busy={pending}>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <SortableHeader label="Name" sortKey="name" sort={sort} onSort={toggleSort} />
                {visibleFields.map((f) => (
                  <SortableHeader key={f.key} label={f.label} sortKey={f.key} sort={sort} onSort={toggleSort} />
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <Link href={`/codex/entry/${e.slug}`} className="font-medium text-gold underline-offset-4 hover:underline">
                      {e.name}
                    </Link>
                  </TableCell>
                  {visibleFields.map((f) => (
                    <TableCell
                      key={f.key}
                      className="max-w-64 truncate text-muted-foreground"
                      title={e.fields[f.key] ?? ""}
                    >
                      {e.fields[f.key] ?? "—"}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
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
        <nav aria-label={`${noun} pages`} className="no-print mt-8 flex flex-wrap items-center justify-center gap-3">
          {page > 1 ? (
            <Button asChild variant="outline">
              <Link href={pageHref(page - 1)} rel="prev">
                <ChevronLeft aria-hidden="true" />
                Previous
              </Link>
            </Button>
          ) : (
            <Button variant="outline" disabled>
              <ChevronLeft aria-hidden="true" />
              Previous
            </Button>
          )}
          <span className="text-[13px] text-muted-foreground">
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <Button asChild variant="outline">
              <Link href={pageHref(page + 1)} rel="next">
                Next
                <ChevronRight aria-hidden="true" />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" disabled>
              Next
              <ChevronRight aria-hidden="true" />
            </Button>
          )}
        </nav>
      )}
    </>
  );
}

function TagChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      aria-pressed={active}
      onClick={onClick}
      className={cn("rounded-full font-normal", active && "border-primary bg-primary/10 text-gold")}
    >
      {children}
    </Button>
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
  sort: SortSpec;
  onSort: (key: string) => void;
}) {
  const active = sort.key === sortKey;
  const Arrow = sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className="p-0">
      <Button
        type="button"
        variant="ghost"
        onClick={() => onSort(sortKey)}
        className={cn("h-10 w-full justify-start rounded-none px-3 font-semibold", active && "text-gold")}
      >
        {label}
        {active && <Arrow aria-hidden="true" className="size-3" />}
      </Button>
    </TableHead>
  );
}
