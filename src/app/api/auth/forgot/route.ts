import { NextResponse } from "next/server";
import { z } from "zod";
import { requestPasswordReset, RESET_NOTE_MAX } from "@/lib/password-resets";
import { checkResetThrottle, clientIp, recordResetAttempt, RESET_WINDOW_MINUTES } from "@/lib/rate-limit";

export const runtime = "nodejs";

const schema = z.object({
  username: z.string().trim().min(1, "Enter your name.").max(100),
  note: z.string().trim().max(RESET_NOTE_MAX, `Keep the note under ${RESET_NOTE_MAX} characters.`).optional(),
});

/** The same answer whether or not the name exists, so this can't be used to find accounts. */
const SENT = "If that name belongs to a player, your DM has been asked to set a new password.";

/** "Forgot password": asks the DM to set a new password. Public, throttled per address. */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Enter your name." }, { status: 400 });
  }

  const ip = clientIp(request.headers);
  const throttle = await checkResetThrottle(ip);
  if (!throttle.allowed) {
    return NextResponse.json({ error: `Too many requests from here. Try again in ${RESET_WINDOW_MINUTES} minutes.` }, { status: 429 });
  }
  await recordResetAttempt(ip);

  await requestPasswordReset(parsed.data.username, parsed.data.note ?? "");
  return NextResponse.json({ ok: true, message: SENT });
}
