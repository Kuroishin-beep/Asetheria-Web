import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword, passwordProblem } from "@/lib/password";
import { createSessionToken } from "@/lib/session";
import { setSessionCookie } from "@/lib/session-cookie";
import {
  checkSignupThrottle,
  clientIp,
  recordSignupAttempt,
  SIGNUP_WINDOW_MINUTES,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Self-service registration, for players.
 *
 * Three things about this route are load-bearing and should not be relaxed:
 *
 * 1. **The role is not in the request.** It is written as `player` below and
 *    there is no code path here that can produce a DM. Adding one would mean
 *    anyone who can reach this URL can read every secret in the codex.
 * 2. **It is off unless `SIGNUP_CODE` is set.** Failing closed matters because
 *    the alternative is a private campaign readable by anyone who finds the
 *    deployment.
 * 3. **It is throttled per address**, because the abuse here is bulk creation
 *    rather than guessing.
 */
const schema = z.object({
  // Letters, digits, space, and the few marks people actually use in a handle.
  username: z
    .string()
    .trim()
    .min(3, "Name must be at least 3 characters.")
    .max(32, "Name must be under 32 characters.")
    .regex(
      /^[\p{L}\p{N}][\p{L}\p{N} _'\-.]*$/u,
      "Use letters, numbers, spaces, and - _ . ' only.",
    ),
  password: z.string().min(1).max(200),
  code: z.string().max(200).optional(),
});

/** Compares the invite code without leaking its length through timing. */
function codeMatches(supplied: string, expected: string): boolean {
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // Still do the work, so a wrong length is not measurably faster.
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const expectedCode = process.env.SIGNUP_CODE?.trim();
  if (!expectedCode) {
    return NextResponse.json(
      { error: "Registration is closed. Ask the DM for an account." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the form and try again." },
      { status: 400 },
    );
  }

  const { username, password, code } = parsed.data;
  const ip = clientIp(request.headers);

  const throttle = await checkSignupThrottle(ip);
  if (!throttle.allowed) {
    return NextResponse.json(
      { error: `Too many accounts from here. Try again in ${SIGNUP_WINDOW_MINUTES} minutes.` },
      { status: 429 },
    );
  }
  // Counted before any check succeeds, so failed guesses at the code are
  // limited too rather than being free.
  await recordSignupAttempt(ip);

  if (!codeMatches(code ?? "", expectedCode)) {
    return NextResponse.json({ error: "That invite code is not right." }, { status: 403 });
  }

  const problem = passwordProblem(password);
  if (problem) {
    return NextResponse.json({ error: problem }, { status: 400 });
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username})`)
    .limit(1);

  if (existing) {
    return NextResponse.json({ error: "That name is taken." }, { status: 409 });
  }

  let created;
  try {
    [created] = await db
      .insert(users)
      .values({
        username,
        passwordHash: await hashPassword(password),
        // Never from the request body. See the note at the top of this file.
        role: "player",
        displayName: username,
      })
      .returning({
        id: users.id,
        username: users.username,
        role: users.role,
        sessionEpoch: users.sessionEpoch,
      });
  } catch {
    // The unique index on lower(username) is the real guard against two
    // simultaneous registrations of the same name; the check above only makes
    // the common case a friendly message.
    return NextResponse.json({ error: "That name is taken." }, { status: 409 });
  }

  const token = await createSessionToken({
    id: created.id,
    username: created.username,
    role: created.role,
    epoch: created.sessionEpoch,
  });
  await setSessionCookie(token);

  return NextResponse.json({
    ok: true,
    user: { username: created.username, role: created.role },
  });
}
