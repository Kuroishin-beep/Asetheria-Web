import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listEntriesBySlugs } from "@/lib/entries";
import { RECENT_LIMIT } from "@/lib/recent-views";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLUG = /^[a-z0-9][a-z0-9-]{0,200}$/;

/**
 * Backs the palette's "Recently viewed". The browser sends the slugs it
 * remembers; this returns only those the caller may read now, in the order
 * given, so a page that has since been hidden, ungranted or archived never
 * has its name sent back.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = new URL(request.url).searchParams.get("slugs") ?? "";
  const slugs = [...new Set(raw.split(",").map((s) => s.trim()).filter((s) => SLUG.test(s)))].slice(0, RECENT_LIMIT);
  const rows = await listEntriesBySlugs(user, slugs);
  return NextResponse.json({
    results: rows.map((e) => ({ id: e.id, slug: e.slug, name: e.name, kind: e.kind, summary: e.summary })),
  });
}
