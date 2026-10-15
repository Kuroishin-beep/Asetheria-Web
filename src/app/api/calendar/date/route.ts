import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { AuthError, requireDM } from "@/lib/auth";
import { setCurrentDate } from "@/lib/calendar-store";

export const runtime = "nodejs";

const schema = z.object({ year: z.number(), month: z.number(), day: z.number() }).strict();

/** Sets the current date to a chosen one. DM only. */
export async function PUT(request: Request) {
  let dm;
  try {
    dm = await requireDM();
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Send a year, a month and a day." }, { status: 400 });
  try {
    const result = await setCurrentDate(dm, parsed.data);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    revalidatePath("/calendar");
    return NextResponse.json({ calendar: result.calendar });
  } catch {
    return NextResponse.json({ error: "Could not set the date. Try again." }, { status: 500 });
  }
}
