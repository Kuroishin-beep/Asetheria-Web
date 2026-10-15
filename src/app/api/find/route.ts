import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { entryKind } from "@/db/schema";
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

  // An optional kind narrows the search (the character home picker asks for locations only).
  const kind = new URL(request.url).searchParams.get("kind");
  const results = await quickFind(user, q, 12, entryKind.enumValues.find((k) => k === kind));
  return NextResponse.json({ results });
}
