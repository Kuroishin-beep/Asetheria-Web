import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { entries, entryKind, links, type EntryKind } from "@/db/schema";
import type { CalendarConfig } from "@/lib/calendar";
import { liveOnly, readable } from "@/lib/entries";
import { daysInMonth, groupByEra, parseEventDates, type EraGroup, type EventDates, type TimelineEvent } from "@/lib/events";
import type { SessionUser } from "@/lib/session";

/**
 * The timeline: every event page this viewer may read, in date order, grouped by era. Events are ordinary pages,
 * so who can see which one is decided by the same rules as every other page, and a linked page the viewer may
 * not read is never named.
 */

export type LinkedPage = { slug: string; name: string; kind: EntryKind };
export type TimelineItem = TimelineEvent & { slug: string; summary: string; tags: string[]; linked: LinkedPage[] };

export type TimelineFilters = { era: string; tag: string; kind: EntryKind | ""; from: number | null; to: number | null };
export const NO_FILTERS: TimelineFilters = { era: "", tag: "", kind: "", from: null, to: null };

export type Facet = { value: string; count: number };
export type Timeline = {
  total: number;
  shown: number;
  groups: EraGroup<TimelineItem>[];
  facets: { eras: Facet[]; tags: Facet[]; kinds: Facet[] };
  /** Events that carry a date although no calendar exists to order them by. */
  needsCalendar: boolean;
};

const intOrNull = (v: string | undefined) => (v !== undefined && /^-?\d{1,7}$/.test(v) ? Number(v) : null);

/** Reads the filters from the address; anything that is not a real option is ignored. */
export function parseTimelineFilters(sp: Record<string, string | undefined>): TimelineFilters {
  const kind = (entryKind.enumValues as readonly string[]).includes(sp.kind ?? "") ? (sp.kind as EntryKind) : "";
  return { era: (sp.era ?? "").trim().slice(0, 80), tag: (sp.tag ?? "").trim().slice(0, 80), kind, from: intOrNull(sp.from), to: intOrNull(sp.to) };
}

function facet(values: string[]): Facet[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => a.value.localeCompare(b.value, "en"));
}

/** Every readable event with its dates read and its readable linked pages, unfiltered. */
export async function getTimelineItems(user: SessionUser, cfg: CalendarConfig | null): Promise<TimelineItem[]> {
  const rows = await db
    .select({ id: entries.id, slug: entries.slug, name: entries.name, summary: entries.summary, tags: entries.tags, fields: entries.fields })
    .from(entries)
    .where(and(eq(entries.kind, "event"), liveOnly(), readable(user)));
  if (rows.length === 0) return [];

  const edges = await db
    .select({ source: links.sourceId, slug: entries.slug, name: entries.name, kind: entries.kind })
    .from(links)
    .innerJoin(entries, eq(entries.id, links.targetId))
    .where(and(inArray(links.sourceId, rows.map((r) => r.id)), liveOnly(), readable(user)));
  const linkedBy = new Map<string, LinkedPage[]>();
  for (const e of edges) {
    const list = linkedBy.get(e.source) ?? [];
    if (!list.some((p) => p.slug === e.slug)) list.push({ slug: e.slug, name: e.name, kind: e.kind });
    linkedBy.set(e.source, list);
  }

  return rows.map((r) => {
    const parsed = parseEventDates(r.fields ?? {}, cfg);
    const dates: EventDates = parsed.ok ? parsed.dates : { start: null, end: null };
    return { id: r.id, slug: r.slug, name: r.name, summary: r.summary, tags: r.tags, era: (r.fields?.era ?? "").trim(), dates, linked: (linkedBy.get(r.id) ?? []).sort((a, b) => a.name.localeCompare(b.name, "en")) };
  });
}

function matches(item: TimelineItem, f: TimelineFilters): boolean {
  if (f.era && item.era !== f.era) return false;
  if (f.tag && !item.tags.includes(f.tag)) return false;
  if (f.kind && !item.linked.some((p) => p.kind === f.kind)) return false;
  if (f.from !== null || f.to !== null) {
    const start = item.dates.start?.year;
    if (start === undefined) return false; // an undated event is in no range
    const end = item.dates.end?.year ?? start;
    if (f.from !== null && end < f.from) return false;
    if (f.to !== null && start > f.to) return false;
  }
  return true;
}

export async function getTimeline(user: SessionUser, cfg: CalendarConfig | null, filters: TimelineFilters): Promise<Timeline> {
  const all = await getTimelineItems(user, cfg);
  const shown = all.filter((i) => matches(i, filters));
  const empty = (e: string) => e !== "";
  return {
    total: all.length,
    shown: shown.length,
    groups: cfg ? groupByEra(cfg, shown) : [],
    facets: {
      eras: facet(all.map((i) => i.era).filter(empty)),
      tags: facet(all.flatMap((i) => i.tags)),
      kinds: facet(all.flatMap((i) => [...new Set(i.linked.map((p) => p.kind))])),
    },
    needsCalendar: !cfg && all.length > 0,
  };
}

/** The events a viewer may read that fall in one month, by day of the month. */
export function eventsByDay(cfg: CalendarConfig, items: TimelineItem[], year: number, month: number): Map<number, TimelineItem[]> {
  const out = new Map<number, TimelineItem[]>();
  for (const item of items) for (const day of daysInMonth(cfg, item.dates, year, month)) out.set(day, [...(out.get(day) ?? []), item]);
  for (const list of out.values()) list.sort((a, b) => a.name.localeCompare(b.name, "en"));
  return out;
}
