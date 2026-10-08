import { NextResponse } from "next/server";
import { AuthError, requireDM } from "@/lib/auth";
import { createSession } from "@/lib/planner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DM only. Starts "Session N": a secret session page with the prep checklist, and returns where to find it. */
export async function POST() {
  let dm;
  try {
    dm = await requireDM();
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  try {
    const created = await createSession(dm);
    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not start a session. Try again." }, { status: 500 });
  }
}
