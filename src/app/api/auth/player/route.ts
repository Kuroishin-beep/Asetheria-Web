import { NextResponse } from "next/server";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/password";
import { createSessionToken } from "@/lib/session";
import { setSessionCookie } from "@/lib/session-cookie";
import {
  checkLoginThrottle,
  clearLoginThrottle,
  clientIp,
  recordFailedLogin,
  LOGIN_WINDOW_MINUTES,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

const schema = z.object({ password: z.string().min(1).max(200) });

/**
 * The party door: one shared player account, opened with the party password
 * (the shared player account's password, set by `npm run db:seed` from
 * PLAYER_PASSWORD). Without it, anyone who found the deployment URL could read
 * everything the party has uncovered. Throttled exactly like the DM login.
 *
 * The session is issued against the real player account, so revoking that
 * account (or bumping its session epoch via `npm run user:add`) still kicks
 * every guest out at once.
 */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter the party password." }, { status: 400 });
  }

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

  const ip = clientIp(request.headers);
  const throttle = await checkLoginThrottle(ip, account.username);
  if (!throttle.allowed) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${LOGIN_WINDOW_MINUTES} minutes.` },
      { status: 429 },
    );
  }

  if (!(await verifyPassword(parsed.data.password, account.passwordHash))) {
    await recordFailedLogin(ip, account.username);
    return NextResponse.json({ error: "That isn't the party password." }, { status: 401 });
  }
  await clearLoginThrottle(ip, account.username);

  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, account.id));

  const token = await createSessionToken({
    id: account.id,
    username: account.username,
    role: account.role,
    epoch: account.sessionEpoch,
    displayName: account.displayName,
  });
  await setSessionCookie(token);

  return NextResponse.json({
    ok: true,
    user: { username: account.username, role: account.role },
  });
}
