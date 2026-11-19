import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { passwordResetRequests, users } from "@/db/schema";

/**
 * "Forgot password" without email: the codex holds no addresses, so a player's request goes to the DM,
 * who sets a new password from the Party page and tells them. The request names no one back to the
 * asker (the reply is the same whether or not the name exists), so it can't be used to find accounts.
 */

export const RESET_NOTE_MAX = 280;

export interface ResetRequest {
  note: string;
  requestedAt: string;
}

/** Records (or refreshes) a request for a player account. Unknown names and the DM are silently ignored. */
export async function requestPasswordReset(username: string, note: string): Promise<void> {
  const [player] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(sql`lower(${users.username}) = lower(${username})`, eq(users.role, "player")))
    .limit(1);
  if (!player) return;
  await db
    .insert(passwordResetRequests)
    .values({ userId: player.id, note })
    .onConflictDoUpdate({ target: passwordResetRequests.userId, set: { note, requestedAt: new Date() } });
}

/** Open requests by player id, for the DM's panel. */
export async function listResetRequests(): Promise<Map<string, ResetRequest>> {
  const rows = await db.select().from(passwordResetRequests);
  return new Map(rows.map((r) => [r.userId, { note: r.note, requestedAt: r.requestedAt.toISOString() }]));
}

/** Closes a player's request once the DM has set a new password. */
export async function clearResetRequest(userId: string): Promise<void> {
  await db.delete(passwordResetRequests).where(eq(passwordResetRequests.userId, userId));
}
