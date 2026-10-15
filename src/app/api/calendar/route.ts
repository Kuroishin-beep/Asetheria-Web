import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { AuthError, getCurrentUser, requireDM } from "@/lib/auth";
import { getCalendar, saveCalendar } from "@/lib/calendar-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The shape only; the calendar's own limits (and their plain-words messages) are checked by validateConfig.
const setupSchema = z
  .object({
    months: z.array(z.object({ name: z.string().max(200), days: z.number() }).strict()).max(200),
    weekdays: z.array(z.string().max(200)).max(200),
    yearLabel: z.string().max(200),
    firstWeekday: z.number(),
    current: z.object({ year: z.number(), month: z.number(), day: z.number() }).strict(),
  })
  .strict();

/** Anyone signed in may read the calendar. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ calendar: await getCalendar() });
}

/** Sets up the calendar (its months, weekdays and the current date together). DM only. */
export async function PUT(request: Request) {
  let dm;
  try {
    dm = await requireDM();
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  const parsed = setupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Send the months, the weekdays, the year label, the first weekday and the current date." }, { status: 400 });
  const { current, ...config } = parsed.data;
  try {
    const result = await saveCalendar(dm, config, current);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    revalidatePath("/calendar");
    return NextResponse.json({ calendar: result.calendar });
  } catch {
    return NextResponse.json({ error: "Could not save the calendar. Try again." }, { status: 500 });
  }
}
