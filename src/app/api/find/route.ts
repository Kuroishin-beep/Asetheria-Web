import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { quickFind } from "@/lib/entries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Backs the command palette. Results are already scoped to the caller's role. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = new URL(request.url).searchParams.get("q") ?? "";
  if (q.trim().length < 2) return NextResponse.json({ results: [] });

  const results = await quickFind(user.role, q, 12);
  return NextResponse.json({ results });
}
