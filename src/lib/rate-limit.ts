import { createHash } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { loginAttempts } from "@/db/schema";

const WINDOW_MINUTES = 15;
const MAX_ATTEMPTS = 8;
// Deliberately looser than the login limit. A whole party registering from one
// table shares an address, and every attempt is counted — including mistyped
// invite codes — so a tight cap would lock out the people it is meant to serve.
// The invite code is the gate; this only stops bulk creation.
const MAX_SIGNUPS = 10;

/**
 * Sign-ups are counted per address only. Keying them the way logins are keyed —
 * on address *and* name — would count nothing, because someone creating
 * accounts in bulk supplies a different name every time. The NUL prefix keeps
 * this bucket from colliding with a real username.
 */
const SIGNUP_BUCKET = "\u0000signup";

/**
 * Identifiers are hashed with the server secret so the table never holds raw
 * IP addresses — it stays useful for throttling without becoming a log of who
 * connected from where.
 */
function identify(ip: string, username: string): string {
  return createHash("sha256")
    .update(`${ip}|${username.toLowerCase()}|${process.env.AUTH_SECRET ?? ""}`)
    .digest("hex");
}

export function clientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}

export type ThrottleResult = { allowed: boolean; remaining: number };

export async function checkLoginThrottle(
  ip: string,
  username: string,
): Promise<ThrottleResult> {
  const identifier = identify(ip, username);
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.identifier, identifier),
        gte(loginAttempts.attemptedAt, since),
      ),
    );

  const used = row?.count ?? 0;
  return { allowed: used < MAX_ATTEMPTS, remaining: Math.max(0, MAX_ATTEMPTS - used) };
}

export async function recordFailedLogin(ip: string, username: string) {
  await db.insert(loginAttempts).values({ identifier: identify(ip, username) });
}

/** Clears the counter after a successful sign-in, and prunes stale rows. */
export async function clearLoginThrottle(ip: string, username: string) {
  const identifier = identify(ip, username);
  await db.delete(loginAttempts).where(eq(loginAttempts.identifier, identifier));
  const cutoff = new Date(Date.now() - 24 * 60 * 60_000);
  await db
    .delete(loginAttempts)
    .where(sql`${loginAttempts.attemptedAt} < ${cutoff.toISOString()}`);
}

/**
 * Throttles account creation from one address. Counted on every attempt rather
 * than only on failures, since a successful sign-up is the thing being abused.
 */
export async function checkSignupThrottle(ip: string): Promise<ThrottleResult> {
  const identifier = identify(ip, SIGNUP_BUCKET);
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.identifier, identifier),
        gte(loginAttempts.attemptedAt, since),
      ),
    );

  const used = row?.count ?? 0;
  return { allowed: used < MAX_SIGNUPS, remaining: Math.max(0, MAX_SIGNUPS - used) };
}

export async function recordSignupAttempt(ip: string) {
  await db.insert(loginAttempts).values({ identifier: identify(ip, SIGNUP_BUCKET) });
}

export const LOGIN_WINDOW_MINUTES = WINDOW_MINUTES;
export const SIGNUP_WINDOW_MINUTES = WINDOW_MINUTES;
export const MAX_SIGNUPS_PER_WINDOW = MAX_SIGNUPS;
