import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, type Entry, type UserRole } from "@/db/schema";
import { getSession } from "@/lib/session-cookie";
import type { SessionUser } from "@/lib/session";

/**
 * Resolves the session against the database so a revoked or deleted account
 * stops working immediately rather than at token expiry.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session) return null;

  const [row] = await db
    .select({
      id: users.id,
      username: users.username,
      role: users.role,
      sessionEpoch: users.sessionEpoch,
    })
    .from(users)
    .where(eq(users.id, session.id))
    .limit(1);

  if (!row) return null;
  if (row.sessionEpoch !== session.epoch) return null;

  return {
    id: row.id,
    username: row.username,
    role: row.role,
    epoch: row.sessionEpoch,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("You must be signed in.", 401);
  return user;
}

/** Guards every mutating path. Players are strictly read-only. */
export async function requireDM(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "dm") {
    throw new AuthError("Only the DM can change the codex.", 403);
  }
  return user;
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number = 403,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export function isDM(user: { role: UserRole } | null | undefined): boolean {
  return user?.role === "dm";
}

// ---------------------------------------------------------------------------
// Player-facing redaction
// ---------------------------------------------------------------------------

/**
 * Strips everything a player must not see. Applied at the boundary of every
 * read path, so a missed check in the UI cannot leak DM content.
 *
 * `dmNotes` is removed even from public entries — that field is the DM's
 * private margin, regardless of whether the entry itself is a secret.
 */
export function redactForPlayer<T extends Partial<Entry>>(entry: T): T {
  return { ...entry, dmNotes: "" };
}

export function redactManyForPlayer<T extends Partial<Entry>>(entries: T[]): T[] {
  return entries.map(redactForPlayer);
}

/**
 * SQL predicate limiting a query to what the given role may read.
 * Players see non-archived, non-secret entries only.
 */
export function visibilityFilter(role: UserRole) {
  return role === "dm"
    ? sql`true`
    : sql`visibility <> 'secret'`;
}
