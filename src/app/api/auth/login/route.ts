import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
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

const schema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a username and password." },
      { status: 400 },
    );
  }

  const { username, password } = parsed.data;
  const ip = clientIp(request.headers);

  const throttle = await checkLoginThrottle(ip, username);
  if (!throttle.allowed) {
    return NextResponse.json(
      {
        error: `Too many attempts. Try again in ${LOGIN_WINDOW_MINUTES} minutes.`,
      },
      { status: 429 },
    );
  }

  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username})`)
    .limit(1);

  // Always run a verification so a missing user and a wrong password take a
  // comparable amount of time — no username enumeration via response timing.
  const stored =
    user?.passwordHash ??
    "scrypt$32768$8$1$00000000000000000000000000000000$" + "0".repeat(128);
  const ok = await verifyPassword(password, stored);

  if (!user || !ok) {
    await recordFailedLogin(ip, username);
    return NextResponse.json(
      { error: "Incorrect username or password." },
      { status: 401 },
    );
  }

  await clearLoginThrottle(ip, username);
  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, user.id));

  const token = await createSessionToken({
    id: user.id,
    username: user.username,
    role: user.role,
    epoch: user.sessionEpoch,
  });
  await setSessionCookie(token);

  return NextResponse.json({
    ok: true,
    user: { username: user.username, role: user.role },
  });
}
