import "server-only";
import { and, asc, eq, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { entries, mapLayers, mapPins, mapRegions, maps, type EntryKind, type MapRow } from "@/db/schema";
import { liveOnly, readable } from "@/lib/entries";
import { REGION_TONES, validatePolygon, wouldLoopMaps, type RegionTone } from "@/lib/map-geometry";
import type { SessionUser } from "@/lib/session";

export const MAP_LIMITS = { regionsPerMap: 300, layersPerMap: 20, nameLength: 120, layerNameLength: 60 } as const;

export type EntryRef = { id: string; slug: string; name: string; kind: EntryKind; summary: string };

export type MapPin = {
  id: string;
  x: number;
  y: number;
  label: string | null;
  layerId: string | null;
  /** Another map this pin opens (a city's own map), if any. */
  childMap: { slug: string; name: string } | null;
  entry: EntryRef;
};

export type MapRegion = {
  id: string;
  name: string;
  points: [number, number][];
  tone: RegionTone;
  layerId: string | null;
  /** The page the region is linked to; null for a region only the DM can see. */
  entry: EntryRef | null;
};

export type MapLayer = { id: string; name: string; defaultOn: boolean };

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
  const child = alias(maps, "child_map");
  const conditions = [eq(mapPins.mapId, mapId), liveOnly(), readable(user)].filter(Boolean);
  const rows = await db
    .select({
      id: mapPins.id,
      x: mapPins.x,
      y: mapPins.y,
      label: mapPins.label,
      layerId: mapPins.layerId,
      childSlug: child.slug,
      childName: child.name,
      entryId: entries.id,
      slug: entries.slug,
      name: entries.name,
      kind: entries.kind,
      summary: entries.summary,
    })
    .from(mapPins)
    .innerJoin(entries, eq(entries.id, mapPins.entryId))
    .leftJoin(child, eq(child.id, mapPins.childMapId))
    .where(and(...conditions))
    .orderBy(asc(mapPins.createdAt));

  return rows.map((r) => ({
    id: r.id,
    x: r.x,
    y: r.y,
    label: r.label,
    layerId: r.layerId,
    childMap: r.childSlug && r.childName ? { slug: r.childSlug, name: r.childName } : null,
    entry: { id: r.entryId, slug: r.slug, name: r.name, kind: r.kind, summary: r.summary },
  }));
}

/**
 * The regions on a map that this viewer may see. A region linked to a page is seen by whoever may read that page
 * (a secret, ungranted or archived page's region is never selected); a region with no page is the DM's alone.
 */
export async function getRegionsForMap(user: SessionUser, mapId: string): Promise<MapRegion[]> {
  const select = {
    id: mapRegions.id,
    name: mapRegions.name,
    points: mapRegions.points,
    tone: mapRegions.tone,
    layerId: mapRegions.layerId,
    entryId: entries.id,
    slug: entries.slug,
    entryName: entries.name,
    kind: entries.kind,
    summary: entries.summary,
  };
  const rows =
    user.role === "dm"
      ? await db
          .select(select)
          .from(mapRegions)
          .leftJoin(entries, eq(entries.id, mapRegions.entryId))
          .where(and(eq(mapRegions.mapId, mapId), or(isNull(mapRegions.entryId), isNull(entries.archivedAt))))
          .orderBy(asc(mapRegions.createdAt))
      : await db
          .select(select)
          .from(mapRegions)
          .innerJoin(entries, eq(entries.id, mapRegions.entryId))
          .where(and(eq(mapRegions.mapId, mapId), isNotNull(mapRegions.entryId), liveOnly(), readable(user)))
          .orderBy(asc(mapRegions.createdAt));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    points: r.points,
    tone: (REGION_TONES as readonly string[]).includes(r.tone) ? (r.tone as RegionTone) : "1",
    layerId: r.layerId,
    entry: r.entryId && r.slug && r.entryName && r.kind ? { id: r.entryId, slug: r.slug, name: r.entryName, kind: r.kind, summary: r.summary ?? "" } : null,
  }));
}

/**
 * The layers a viewer is told about. The DM sees them all; a player sees only a layer that holds something they
 * can see, so the name of a layer that holds only hidden things (say "Cult hideouts") is never sent to them.
 */
export async function getLayersForMap(user: SessionUser, mapId: string, visible: { pins: MapPin[]; regions: MapRegion[] }): Promise<MapLayer[]> {
  const rows = await db.select().from(mapLayers).where(eq(mapLayers.mapId, mapId)).orderBy(asc(mapLayers.createdAt));
  const inUse = new Set([...visible.pins.map((p) => p.layerId), ...visible.regions.map((r) => r.layerId)].filter((x): x is string => !!x));
  return rows.filter((l) => user.role === "dm" || inUse.has(l.id)).map((l) => ({ id: l.id, name: l.name, defaultOn: l.defaultOn }));
}

/** The map a viewer came from: the map holding a pin that opens this one, if any. */
export async function parentMapOf(mapId: string): Promise<{ slug: string; name: string } | null> {
  const [row] = await db
    .select({ slug: maps.slug, name: maps.name })
    .from(mapPins)
    .innerJoin(maps, eq(maps.id, mapPins.mapId))
    .where(eq(mapPins.childMapId, mapId))
    .orderBy(asc(mapPins.createdAt))
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Pins (DM)
// ---------------------------------------------------------------------------

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

export type Result = { ok: true } | { ok: false; errors: string[]; status: 400 | 404 };
const fail = (status: 400 | 404, ...errors: string[]): Result => ({ ok: false, errors, status });

async function layerBelongsTo(mapId: string, layerId: string): Promise<boolean> {
  const [row] = await db.select({ id: mapLayers.id }).from(mapLayers).where(and(eq(mapLayers.id, layerId), eq(mapLayers.mapId, mapId))).limit(1);
  return !!row;
}

export type PinPatch = { layerId?: string | null; childMapId?: string | null; label?: string | null };

/** Sets a pin's layer, the city map it opens, or its label. A city map may never lead back to where it started. */
export async function updatePin(mapId: string, pinId: string, patch: PinPatch): Promise<Result> {
  const [pin] = await db.select({ id: mapPins.id }).from(mapPins).where(and(eq(mapPins.id, pinId), eq(mapPins.mapId, mapId))).limit(1);
  if (!pin) return fail(404, "Pin not found.");
  const set: Partial<typeof mapPins.$inferInsert> = {};
  if (patch.label !== undefined) set.label = patch.label;
  if (patch.layerId !== undefined) {
    if (patch.layerId !== null && !(await layerBelongsTo(mapId, patch.layerId))) return fail(400, "That layer does not belong to this map.");
    set.layerId = patch.layerId;
  }
  if (patch.childMapId !== undefined) {
    if (patch.childMapId !== null) {
      const [target] = await db.select({ id: maps.id }).from(maps).where(eq(maps.id, patch.childMapId)).limit(1);
      if (!target) return fail(400, "That map does not exist.");
      const links = await db
        .select({ from: mapPins.mapId, to: mapPins.childMapId })
        .from(mapPins)
        .where(and(isNotNull(mapPins.childMapId), ne(mapPins.id, pinId)));
      const edges = links.filter((l): l is { from: string; to: string } => !!l.to);
      if (wouldLoopMaps(edges, mapId, patch.childMapId)) return fail(400, patch.childMapId === mapId ? "A pin cannot open the map it is on." : "That would make two maps open each other. A city map can only lead further down, never back.");
    }
    set.childMapId = patch.childMapId;
  }
  if (Object.keys(set).length === 0) return { ok: true };
  await db.update(mapPins).set(set).where(eq(mapPins.id, pinId));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Layers (DM)
// ---------------------------------------------------------------------------

export async function createLayer(mapId: string, name: string): Promise<({ ok: true; id: string } | { ok: false; errors: string[]; status: 400 | 404 })> {
  const clean = name.trim();
  if (clean.length < 1 || clean.length > MAP_LIMITS.layerNameLength) return fail(400, `A layer name is 1 to ${MAP_LIMITS.layerNameLength} characters.`) as { ok: false; errors: string[]; status: 400 };
  const existing = await db.select({ id: mapLayers.id, name: mapLayers.name }).from(mapLayers).where(eq(mapLayers.mapId, mapId));
  if (existing.length >= MAP_LIMITS.layersPerMap) return fail(400, `A map can have at most ${MAP_LIMITS.layersPerMap} layers.`) as { ok: false; errors: string[]; status: 400 };
  if (existing.some((l) => l.name.toLowerCase() === clean.toLowerCase())) return fail(400, `There is already a layer called "${clean}".`) as { ok: false; errors: string[]; status: 400 };
  try {
    const [row] = await db.insert(mapLayers).values({ mapId, name: clean }).returning({ id: mapLayers.id });
    return { ok: true, id: row.id };
  } catch (e) {
    if ((e as { code?: string; cause?: { code?: string } }).code === "23505" || (e as { cause?: { code?: string } }).cause?.code === "23505") return fail(400, `There is already a layer called "${clean}".`) as { ok: false; errors: string[]; status: 400 };
    throw e;
  }
}

export async function updateLayer(mapId: string, layerId: string, patch: { name?: string; defaultOn?: boolean }): Promise<Result> {
  if (!(await layerBelongsTo(mapId, layerId))) return fail(404, "Layer not found.");
  const set: Partial<typeof mapLayers.$inferInsert> = {};
  if (patch.defaultOn !== undefined) set.defaultOn = patch.defaultOn;
  if (patch.name !== undefined) {
    const clean = patch.name.trim();
    if (clean.length < 1 || clean.length > MAP_LIMITS.layerNameLength) return fail(400, `A layer name is 1 to ${MAP_LIMITS.layerNameLength} characters.`);
    const clash = await db.select({ id: mapLayers.id }).from(mapLayers).where(and(eq(mapLayers.mapId, mapId), ne(mapLayers.id, layerId), sql`lower(${mapLayers.name}) = ${clean.toLowerCase()}`));
    if (clash.length > 0) return fail(400, `There is already a layer called "${clean}".`);
    set.name = clean;
  }
  if (Object.keys(set).length > 0) await db.update(mapLayers).set(set).where(eq(mapLayers.id, layerId));
  return { ok: true };
}

/** Deleting a layer leaves its pins and regions on the map, with no layer. */
export async function deleteLayer(mapId: string, layerId: string): Promise<boolean> {
  const rows = await db.delete(mapLayers).where(and(eq(mapLayers.id, layerId), eq(mapLayers.mapId, mapId))).returning({ id: mapLayers.id });
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Regions (DM)
// ---------------------------------------------------------------------------

export type RegionInput = { name: string; points: unknown; entryId?: string | null; layerId?: string | null; tone?: string };

async function checkEntry(entryId: string): Promise<boolean> {
  const [row] = await db.select({ id: entries.id }).from(entries).where(and(eq(entries.id, entryId), liveOnly())).limit(1);
  return !!row;
}

export async function createRegion(mapId: string, dmId: string, input: RegionInput): Promise<({ ok: true; id: string } | { ok: false; errors: string[]; status: 400 | 404 })> {
  const errors: string[] = [];
  const name = (input.name ?? "").trim();
  if (name.length < 1 || name.length > MAP_LIMITS.nameLength) errors.push(`A region name is 1 to ${MAP_LIMITS.nameLength} characters.`);
  errors.push(...validatePolygon(input.points));
  const tone = input.tone ?? "1";
  if (!(REGION_TONES as readonly string[]).includes(tone)) errors.push("Choose one of the five colours.");
  if (errors.length > 0) return { ok: false, errors, status: 400 };

  if (input.entryId && !(await checkEntry(input.entryId))) return { ok: false, errors: ["That page no longer exists."], status: 404 };
  if (input.layerId && !(await layerBelongsTo(mapId, input.layerId))) return { ok: false, errors: ["That layer does not belong to this map."], status: 400 };
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(mapRegions).where(eq(mapRegions.mapId, mapId));
  if (n >= MAP_LIMITS.regionsPerMap) return { ok: false, errors: [`A map can have at most ${MAP_LIMITS.regionsPerMap} regions.`], status: 400 };

  const [row] = await db
    .insert(mapRegions)
    .values({ mapId, name, points: input.points as [number, number][], entryId: input.entryId ?? null, layerId: input.layerId ?? null, tone, createdBy: dmId })
    .returning({ id: mapRegions.id });
  return { ok: true, id: row.id };
}

export type RegionPatch = { name?: string; entryId?: string | null; layerId?: string | null; tone?: string };

export async function updateRegion(mapId: string, regionId: string, patch: RegionPatch): Promise<Result> {
  const [region] = await db.select({ id: mapRegions.id }).from(mapRegions).where(and(eq(mapRegions.id, regionId), eq(mapRegions.mapId, mapId))).limit(1);
  if (!region) return fail(404, "Region not found.");
  const set: Partial<typeof mapRegions.$inferInsert> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name.length < 1 || name.length > MAP_LIMITS.nameLength) return fail(400, `A region name is 1 to ${MAP_LIMITS.nameLength} characters.`);
    set.name = name;
  }
  if (patch.tone !== undefined) {
    if (!(REGION_TONES as readonly string[]).includes(patch.tone)) return fail(400, "Choose one of the five colours.");
    set.tone = patch.tone;
  }
  if (patch.entryId !== undefined) {
    if (patch.entryId !== null && !(await checkEntry(patch.entryId))) return fail(404, "That page no longer exists.");
    set.entryId = patch.entryId;
  }
  if (patch.layerId !== undefined) {
    if (patch.layerId !== null && !(await layerBelongsTo(mapId, patch.layerId))) return fail(400, "That layer does not belong to this map.");
    set.layerId = patch.layerId;
  }
  if (Object.keys(set).length > 0) await db.update(mapRegions).set(set).where(eq(mapRegions.id, regionId));
  return { ok: true };
}

export async function deleteRegion(mapId: string, regionId: string): Promise<boolean> {
  const rows = await db.delete(mapRegions).where(and(eq(mapRegions.id, regionId), eq(mapRegions.mapId, mapId))).returning({ id: mapRegions.id });
  return rows.length > 0;
}

/** Maps a pin could open: every other registered map. */
export async function mapChoices(excludeId: string): Promise<{ id: string; slug: string; name: string }[]> {
  return db.select({ id: maps.id, slug: maps.slug, name: maps.name }).from(maps).where(ne(maps.id, excludeId)).orderBy(asc(maps.name));
}

