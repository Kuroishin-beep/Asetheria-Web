import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { entries, mapPins, maps, type EntryKind, type MapRow } from "@/db/schema";
import { liveOnly, readable } from "@/lib/entries";
import type { SessionUser } from "@/lib/session";

export type MapPin = {
  id: string;
  x: number;
  y: number;
  label: string | null;
  entry: { id: string; slug: string; name: string; kind: EntryKind; summary: string };
};

export async function listMaps(): Promise<MapRow[]> {
  return db.select().from(maps).orderBy(asc(maps.createdAt));
}

export async function getMapBySlug(slug: string): Promise<MapRow | null> {
  const [row] = await db.select().from(maps).where(eq(maps.slug, slug)).limit(1);
  return row ?? null;
}

/**
 * The pins on a map that this viewer may see. Access is decided here, in the
 * query, by the same rules as every other read: a pin whose entry is secret,
 * ungranted or archived is never selected, so its coordinates, label, name and
 * id never leave Postgres for that viewer (risk R6). Nothing is filtered later
 * in the browser.
 */
export async function getPinsForMap(user: SessionUser, mapId: string): Promise<MapPin[]> {
  const conditions = [eq(mapPins.mapId, mapId), liveOnly(), readable(user)].filter(Boolean);
  const rows = await db
    .select({
      id: mapPins.id,
      x: mapPins.x,
      y: mapPins.y,
      label: mapPins.label,
      entryId: entries.id,
      slug: entries.slug,
      name: entries.name,
      kind: entries.kind,
      summary: entries.summary,
    })
    .from(mapPins)
    .innerJoin(entries, eq(entries.id, mapPins.entryId))
    .where(and(...conditions))
    .orderBy(asc(mapPins.createdAt));

  return rows.map((r) => ({
    id: r.id,
    x: r.x,
    y: r.y,
    label: r.label,
    entry: { id: r.entryId, slug: r.slug, name: r.name, kind: r.kind, summary: r.summary },
  }));
}

export type NewPin = { mapId: string; entryId: string; x: number; y: number; label: string | null; createdBy: string };

/** DM only (the caller has already passed `requireDM`). Returns null when the entry is gone or archived. */
export async function createPin(input: NewPin): Promise<{ id: string } | null> {
  const [entry] = await db
    .select({ id: entries.id })
    .from(entries)
    .where(and(eq(entries.id, input.entryId), liveOnly()))
    .limit(1);
  if (!entry) return null;
  const [row] = await db
    .insert(mapPins)
    .values({ mapId: input.mapId, entryId: input.entryId, x: input.x, y: input.y, label: input.label, createdBy: input.createdBy })
    .returning({ id: mapPins.id });
  return row ?? null;
}

export async function deletePin(mapId: string, pinId: string): Promise<boolean> {
  const rows = await db
    .delete(mapPins)
    .where(and(eq(mapPins.id, pinId), eq(mapPins.mapId, mapId)))
    .returning({ id: mapPins.id });
  return rows.length > 0;
}
