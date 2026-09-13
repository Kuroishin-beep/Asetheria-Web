import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public (see middleware.ts's PUBLIC_PATHS — this route is what that entry
 * was referring to before it existed). Intentionally unauthenticated and
 * minimal: no entry counts, no user info, nothing that would make this
 * useful to anyone but an uptime check or a deploy hook.
 */
export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({ ok: true, db: "up" });
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }
}
