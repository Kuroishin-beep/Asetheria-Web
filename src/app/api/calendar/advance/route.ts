import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { AuthError, requireDM } from "@/lib/auth";
import { advanceDate } from "@/lib/calendar-store";

export const runtime = "nodejs";

const schema = z.object({ days: z.number() }).strict();

/** Moves the current date forwards or back by a number of days. DM only. */
export async function POST(request: Request) {
  let dm;
  try {
    dm = await requireDM();
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Send the number of days to move." }, { status: 400 });
  try {
    const result = await advanceDate(dm, parsed.data.days);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    revalidatePath("/calendar");
    return NextResponse.json({ calendar: result.calendar });
  } catch {
    return NextResponse.json({ error: "Could not move the date. Try again." }, { status: 500 });
  }
}
