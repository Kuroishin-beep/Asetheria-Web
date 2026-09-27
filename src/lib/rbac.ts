import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { entries, entryGrants, users, type EntryKind } from "@/db/schema";
import type { SessionUser } from "@/lib/session";

/**
 * Everything that decides what one specific player may see, on top of the
 * DM/secret wall in `src/lib/auth.ts`. That wall never changes: a `secret`
 * entry is excluded for every player regardless of any row in this table.
 * What this module adds is a second, additive gate — per-player grants,
 * either for a whole `kind` or for one specific entry — so a GM can show
 * "the 3 empires and these 5 cities" to one player without exposing every
 * `location`/`empire` row to everyone with a player account.
 *
 * Resolution order per (player, entry):
 *   1. `visibility = 'secret'`        -> always hidden (auth.ts's job, not ours)
 *   2. an entry-level grant exists    -> that row's `granted` wins, full stop
 *   3. else a kind-level grant exists -> that row's `granted` wins
 *   4. else                           -> hidden (no default access)
 */

/**
 * SQL fragment usable inside a `WHERE` clause: true for the DM, and for a
 * player, "this row is covered by a grant" per the resolution order above.
 * Callers must still AND this with the existing `visibility <> 'secret'`
 * check — this function does not repeat that check itself, so a bug here can
 * never *loosen* the secret wall, only fail to grant something.
 *
 * `idColumn`/`kindColumn` are passed in rather than hardcoded to `entries.id`
 * because some callers (raw-SQL full-text search) reference the table via an
 * alias (`e`) rather than through the Drizzle query builder.
 */
export function grantConditionRaw(
  user: SessionUser,
  idColumn: ReturnType<typeof sql>,
  kindColumn: ReturnType<typeof sql>,
) {
  if (user.role === "dm") return sql`true`;
  const uid = user.id;
  return sql`(
    EXISTS (
      SELECT 1 FROM entry_grants eg
      WHERE eg.entry_id = ${idColumn} AND eg.user_id = ${uid} AND eg.granted = true
    )
    OR (
      NOT EXISTS (
        SELECT 1 FROM entry_grants eg2
        WHERE eg2.entry_id = ${idColumn} AND eg2.user_id = ${uid}
      )
      AND EXISTS (
        SELECT 1 FROM entry_grants eg3
        WHERE eg3.kind = ${kindColumn} AND eg3.user_id = ${uid} AND eg3.granted = true
      )
    )
  )`;
}

export function grantCondition(user: SessionUser) {
  return grantConditionRaw(user, sql`${entries.id}`, sql`${entries.kind}`);
}

export type GrantTarget = { kind: EntryKind } | { entryId: string };

/** Sets (or overwrites) one grant/denial. `granter` must be the DM — enforced by the caller via `requireDM()`. */
export async function setGrant(
  granterId: string,
  targetUserId: string,
  target: GrantTarget,
  granted: boolean,
) {
  const kind = "kind" in target ? target.kind : null;
  const entryId = "entryId" in target ? target.entryId : null;

  await db
    .insert(entryGrants)
    .values({ userId: targetUserId, kind, entryId, granted, grantedBy: granterId })
    .onConflictDoUpdate({
      target:
        kind !== null
          ? [entryGrants.userId, entryGrants.kind]
          : [entryGrants.userId, entryGrants.entryId],
      set: { granted, grantedBy: granterId, grantedAt: new Date() },
    });
}

/** Bulk grant/deny — one transaction, so a "select all → reject" acts atomically. */
export async function bulkSetGrant(
  granterId: string,
  targetUserId: string,
  targets: GrantTarget[],
  granted: boolean,
) {
  await db.transaction(async (tx) => {
    for (const target of targets) {
      const kind = "kind" in target ? target.kind : null;
      const entryId = "entryId" in target ? target.entryId : null;
      await tx
        .insert(entryGrants)
        .values({ userId: targetUserId, kind, entryId, granted, grantedBy: granterId })
        .onConflictDoUpdate({
          target:
            kind !== null
              ? [entryGrants.userId, entryGrants.kind]
              : [entryGrants.userId, entryGrants.entryId],
          set: { granted, grantedBy: granterId, grantedAt: new Date() },
        });
    }
  });
}

export async function removeGrant(targetUserId: string, target: GrantTarget) {
  const kind = "kind" in target ? target.kind : null;
  const entryId = "entryId" in target ? target.entryId : null;
  await db
    .delete(entryGrants)
    .where(
      and(
        eq(entryGrants.userId, targetUserId),
        kind !== null ? eq(entryGrants.kind, kind) : isNull(entryGrants.kind),
        entryId !== null ? eq(entryGrants.entryId, entryId) : isNull(entryGrants.entryId),
      ),
    );
}

export async function listGrantsForUser(userId: string) {
  return db.select().from(entryGrants).where(eq(entryGrants.userId, userId));
}

export async function listPlayers() {
  return db
    .select({ id: users.id, username: users.username, displayName: users.displayName })
    .from(users)
    .where(eq(users.role, "player"))
    .orderBy(users.username);
}

/**
 * Applied once, when a player finishes the `/welcome` onboarding flow.
 * Default access: the `empire` kind in full, plus every `location` entry the
 * DM has tagged `major-city`. Materialized as concrete rows (rather than a
 * dynamic tag rule) so a location tagged `major-city` *after* a player has
 * already onboarded does not retroactively appear — that always requires an
 * explicit grant from the RBAC panel, same as any other visibility change.
 */
export async function applyDefaultGrants(newPlayerId: string) {
  const majorCities = await db
    .select({ id: entries.id })
    .from(entries)
    .where(sql`'major-city' = ANY(${entries.tags}) AND ${entries.archivedAt} IS NULL`);

  await db.transaction(async (tx) => {
    await tx
      .insert(entryGrants)
      .values({ userId: newPlayerId, kind: "empire", granted: true })
      .onConflictDoNothing();
    for (const city of majorCities) {
      await tx
        .insert(entryGrants)
        .values({ userId: newPlayerId, entryId: city.id, granted: true })
        .onConflictDoNothing();
    }
  });
}
