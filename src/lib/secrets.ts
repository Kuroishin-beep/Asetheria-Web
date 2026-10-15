import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { entrySecrets, secretReveals, users, type EntrySecret } from "@/db/schema";
import { buildBody, inlineBody, isSecretId, markerIds, splitInline, type Segment } from "@/lib/secret-blocks";
import type { SessionUser } from "@/lib/session";

/**
 * Secret blocks: the database side.
 *
 * Saves are ordered so that a failure half-way can only leave invisible rows, never exposed text
 * (production uses a driver without interactive transactions): the block rows are written first,
 * then the page body with its markers, then rows the body no longer points at are removed.
 */

export type PlannedBlock = { id: string; text: string };
export type SecretPlan = { ok: true; body: string; blocks: PlannedBlock[] } | { ok: false; error: string };

/**
 * Turns the editor's inline body into the stored body plus the blocks to write.
 * A block keeps its id when it names a row that belongs to this page (so who it was revealed to
 * survives an edit); an id from another page, a repeated id, or none at all gets a new one, so one
 * page can never take over the reveals of another's block. An id that exists nowhere is reused,
 * which is how a revision is restored.
 */
export async function planSecrets(entryId: string | null, inline: string): Promise<SecretPlan> {
  const split = splitInline(inline);
  if (!split.ok) return { ok: false, error: split.error };
  const blocks = split.segments.filter((s): s is Extract<Segment, { type: "block" }> => s.type === "block");
  if (blocks.length === 0) return { ok: true, body: buildBody(split.segments, () => randomUUID()), blocks: [] };

  const wanted = [...new Set(blocks.map((b) => b.id).filter((id): id is string => !!id && isSecretId(id)))];
  const existing = wanted.length
    ? await db.select({ id: entrySecrets.id, entryId: entrySecrets.entryId }).from(entrySecrets).where(inArray(entrySecrets.id, wanted))
    : [];
  const owner = new Map(existing.map((r) => [r.id, r.entryId]));

  const used = new Set<string>();
  const ids = blocks.map((b) => {
    const candidate = b.id;
    if (candidate && !used.has(candidate)) {
      const own = owner.get(candidate);
      if (own === undefined || (entryId !== null && own === entryId)) {
        used.add(candidate);
        return candidate;
      }
    }
    let fresh = randomUUID();
    while (used.has(fresh)) fresh = randomUUID();
    used.add(fresh);
    return fresh;
  });

  return { ok: true, body: buildBody(split.segments, (i) => ids[i]), blocks: blocks.map((b, i) => ({ id: ids[i], text: b.text })) };
}

/** Writes the planned blocks for a page (insert new, update changed). Call before the page body is saved. */
export async function writeSecrets(entryId: string, blocks: PlannedBlock[]): Promise<void> {
  for (const b of blocks) {
    await db
      .insert(entrySecrets)
      .values({ id: b.id, entryId, body: b.text })
      .onConflictDoUpdate({ target: entrySecrets.id, set: { body: b.text, updatedAt: new Date() }, setWhere: eq(entrySecrets.entryId, entryId) });
  }
}

/** Removes this page's block rows that its body no longer points at. Call after the page body is saved. */
export async function pruneSecrets(entryId: string, body: string): Promise<void> {
  const keep = markerIds(body);
  await db.delete(entrySecrets).where(keep.length ? and(eq(entrySecrets.entryId, entryId), notInArray(entrySecrets.id, keep)) : eq(entrySecrets.entryId, entryId));
}

/** All blocks of a page, in no particular order (DM use only). */
export async function listSecrets(entryId: string): Promise<EntrySecret[]> {
  return db.select().from(entrySecrets).where(eq(entrySecrets.entryId, entryId));
}

/** The editor's inline form of a stored body. DM only: the caller must have checked the role. */
export async function inlineForDm(entryId: string, body: string): Promise<string> {
  if (markerIds(body).length === 0) return body;
  const rows = await listSecrets(entryId);
  return inlineBody(body, new Map(rows.map((r) => [r.id, r.body])));
}

/** The same for many pages at once (export). One query, not one per page. */
export async function inlineManyForDm<T extends { id: string; body: string }>(rows: T[]): Promise<T[]> {
  const withMarkers = rows.filter((r) => markerIds(r.body).length > 0);
  if (withMarkers.length === 0) return rows;
  const secrets = await db.select().from(entrySecrets).where(inArray(entrySecrets.entryId, withMarkers.map((r) => r.id)));
  const byEntry = new Map<string, Map<string, string>>();
  for (const s of secrets) {
    const m = byEntry.get(s.entryId) ?? new Map<string, string>();
    m.set(s.id, s.body);
    byEntry.set(s.entryId, m);
  }
  return rows.map((r) => (markerIds(r.body).length > 0 ? { ...r, body: inlineBody(r.body, byEntry.get(r.id) ?? new Map()) } : r));
}

export type VisibleSecret = { id: string; text: string; revealedTo: { id: string; name: string }[] };

/**
 * The blocks of a page this viewer may read: all of them for the DM (with who each is revealed to),
 * and for a player only the blocks revealed to that player. A grant on the page reveals nothing here.
 */
export async function secretsForViewer(user: SessionUser, entryId: string): Promise<Map<string, VisibleSecret>> {
  const out = new Map<string, VisibleSecret>();
  if (user.role === "dm") {
    const rows = await listSecrets(entryId);
    if (rows.length === 0) return out;
    const reveals = await db
      .select({ secretId: secretReveals.secretId, userId: secretReveals.userId, username: users.username, displayName: users.displayName })
      .from(secretReveals)
      .innerJoin(users, eq(users.id, secretReveals.userId))
      .where(inArray(secretReveals.secretId, rows.map((r) => r.id)));
    for (const r of rows) {
      out.set(r.id, {
        id: r.id,
        text: r.body,
        revealedTo: reveals.filter((v) => v.secretId === r.id).map((v) => ({ id: v.userId, name: v.displayName || v.username })),
      });
    }
    return out;
  }
  const rows = await db
    .select({ id: entrySecrets.id, body: entrySecrets.body })
    .from(entrySecrets)
    .innerJoin(secretReveals, and(eq(secretReveals.secretId, entrySecrets.id), eq(secretReveals.userId, user.id)))
    .where(eq(entrySecrets.entryId, entryId));
  for (const r of rows) out.set(r.id, { id: r.id, text: r.body, revealedTo: [] });
  return out;
}

export type RevealResult = { revealedTo: { id: string; name: string }[]; ignored: string[] } | { notFound: true };

/**
 * Sets exactly who a block is revealed to. Only players can be chosen (the DM already sees everything);
 * unknown ids and the DM are ignored and reported back. An empty list hides the block from everyone.
 */
export async function setReveals(dm: { id: string }, secretId: string, playerIds: string[]): Promise<RevealResult> {
  const [secret] = await db.select({ id: entrySecrets.id }).from(entrySecrets).where(eq(entrySecrets.id, secretId)).limit(1);
  if (!secret) return { notFound: true };

  const unique = [...new Set(playerIds)];
  const players = unique.length
    ? await db.select({ id: users.id, username: users.username, displayName: users.displayName }).from(users).where(and(inArray(users.id, unique), eq(users.role, "player")))
    : [];
  const valid = new Set(players.map((p) => p.id));
  const ids = [...valid];

  if (ids.length === 0) await db.delete(secretReveals).where(eq(secretReveals.secretId, secretId));
  else {
    await db.delete(secretReveals).where(and(eq(secretReveals.secretId, secretId), notInArray(secretReveals.userId, ids)));
    await db
      .insert(secretReveals)
      .values(ids.map((userId) => ({ secretId, userId, revealedBy: dm.id })))
      .onConflictDoNothing();
  }
  return { revealedTo: players.map((p) => ({ id: p.id, name: p.displayName || p.username })), ignored: unique.filter((id) => !valid.has(id)) };
}
