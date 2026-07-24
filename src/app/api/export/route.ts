import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { entries, links, rollTables } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Full backup of the codex. DM only — an export contains every secret and all
 * DM notes, so it must never be reachable by a player account.
 *
 * `?format=markdown` produces a single readable document instead of JSON.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "dm") {
    return NextResponse.json(
      { error: "Only the DM can export the codex." },
      { status: 403 },
    );
  }

  const format = new URL(request.url).searchParams.get("format") ?? "json";
  const stamp = new Date().toISOString().slice(0, 10);

  const allEntries = await db.select().from(entries).orderBy(asc(entries.name));

  if (format === "markdown") {
    const parts: string[] = [
      `# The Continent of Asetheria`,
      ``,
      `_Exported ${new Date().toUTCString()} — ${allEntries.length} entries._`,
      ``,
    ];

    const byKind = new Map<string, typeof allEntries>();
    for (const e of allEntries) {
      if (!byKind.has(e.kind)) byKind.set(e.kind, []);
      byKind.get(e.kind)!.push(e);
    }

    for (const [kind, rows] of [...byKind.entries()].sort()) {
      parts.push(`\n\n---\n\n# ${kind.toUpperCase()}\n`);
      for (const e of rows) {
        parts.push(`\n## ${e.name}\n`);
        if (e.visibility === "secret") parts.push(`> **DM ONLY**\n`);
        if (e.tags.length) parts.push(`Tags: ${e.tags.join(", ")}\n`);
        for (const [k, v] of Object.entries(e.fields ?? {})) {
          if (v) parts.push(`${k}: ${v}\n`);
        }
        if (e.summary) parts.push(`\n_${e.summary}_\n`);
        if (e.body) parts.push(`\n${e.body}\n`);
        if (e.dmNotes) parts.push(`\n### DM Notes\n\n${e.dmNotes}\n`);
      }
    }

    return new NextResponse(parts.join(""), {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="asetheria-${stamp}.md"`,
      },
    });
  }

  const [allLinks, allTables] = await Promise.all([
    db.select().from(links),
    db.select().from(rollTables),
  ]);

  const payload = {
    format: "asetheria-codex",
    version: 1,
    exportedAt: new Date().toISOString(),
    counts: {
      entries: allEntries.length,
      links: allLinks.length,
      rollTables: allTables.length,
    },
    entries: allEntries,
    links: allLinks,
    rollTables: allTables,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="asetheria-${stamp}.json"`,
    },
  });
}
