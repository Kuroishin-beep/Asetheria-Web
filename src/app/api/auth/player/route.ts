import { NextResponse } from "next/server";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSessionToken } from "@/lib/session";
import { setSessionCookie } from "@/lib/session-cookie";

export const runtime = "nodejs";

/**
 * Passwordless entry for the party. The player side of the codex contains
 * nothing secret by construction — every read path is filtered in SQL — so the
 * shared player account opens without a key. The DM still signs in normally.
 *
 * The session is issued against the real player account, so revoking that
 * account (or bumping its session epoch via `npm run user:add`) still kicks
 * every guest out at once.
 */
export async function POST() {
  const preferred = process.env.PLAYER_USERNAME || "party";

  let [account] = await db
    .select()
    .from(users)
    .where(
      sql`lower(${users.username}) = lower(${preferred}) and ${users.role} = 'player'`,
    )
    .limit(1);

  if (!account) {
    [account] = await db
      .select()
      .from(users)
      .where(eq(users.role, "player"))
      .orderBy(asc(users.createdAt))
      .limit(1);
  }

  if (!account) {
    return NextResponse.json(
      { error: "No player account exists yet. Ask the DM to run the setup." },
      { status: 503 },
    );
  }

  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, account.id));

  const token = await createSessionToken({
    id: account.id,
    username: account.username,
    role: account.role,
    epoch: account.sessionEpoch,
  });
  await setSessionCookie(token);

  return NextResponse.json({
    ok: true,
    user: { username: account.username, role: account.role },
  });
}
