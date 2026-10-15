import "server-only";
import { NextResponse } from "next/server";
import { AuthError, requireDM } from "@/lib/auth";
import type { SessionUser } from "@/lib/session";

/** For route handlers that only the DM may call: the DM, or the 401/403 response to return. */
export async function guardDm(): Promise<{ dm: SessionUser; response?: undefined } | { dm?: undefined; response: NextResponse }> {
  try {
    return { dm: await requireDM() };
  } catch (e) {
    if (e instanceof AuthError) return { response: NextResponse.json({ error: e.message }, { status: e.status }) };
    throw e;
  }
}
