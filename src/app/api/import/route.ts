import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { entries, revisions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { entryInputSchema } from "@/lib/validation";
import { slugify } from "@/lib/links";

export const runtime = "nodejs";
export const maxDuration = 60;

const importEntrySchema = entryInputSchema
  .partial()
  .extend({
    slug: z.string().optional(),
    name: z.string().min(1),
    sourcePath: z.string().nullable().optional(),
  });

const payloadSchema = z.object({
  format: z.literal("asetheria-codex").optional(),
  entries: z.array(importEntrySchema).max(20_000),
});

/**
 * Restores a backup produced by /api/export.
 *
 * Import is strictly additive-or-updating: entries already present (matched by
 * slug) are updated, new ones are inserted, and anything in the database that
 * is *not* in the file is left completely alone. An import can therefore never
 * delete your work.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "dm") {
    return NextResponse.json(
      { error: "Only the DM can import." },
      { status: 403 },
    );
  }

  const raw = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "That file isn't a valid Asetheria backup." },
      { status: 400 },
    );
  }

  const existing = await db
    .select({ id: entries.id, slug: entries.slug })
    .from(entries);
  const bySlug = new Map(existing.map((e) => [e.slug, e.id]));

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of parsed.data.entries) {
    const name = item.name?.trim();
    // Skip only rows with nothing in them at all.
    if (!name && !item.body?.trim() && !item.summary?.trim()) {
      skipped++;
      continue;
    }

    const slug = item.slug?.trim() || slugify(name ?? "entry");
    const foundId = bySlug.get(slug);

    if (foundId) {
      const [current] = await db
        .select()
        .from(entries)
        .where(eq(entries.id, foundId))
        .limit(1);
      if (current) {
        await db.insert(revisions).values({
          entryId: current.id,
          snapshot: current as unknown as Record<string, unknown>,
          action: "import",
          authorId: user.id,
          authorName: user.username,
        });
      }
      await db
        .update(entries)
        .set({
          name: name ?? current!.name,
          kind: item.kind ?? current!.kind,
          summary: item.summary ?? current!.summary,
          body: item.body ?? current!.body,
          dmNotes: item.dmNotes ?? current!.dmNotes,
          fields: item.fields ?? current!.fields,
          tags: item.tags ?? current!.tags,
          visibility: item.visibility ?? current!.visibility,
          updatedAt: new Date(),
        })
        .where(eq(entries.id, foundId));
      updated++;
    } else {
      const [row] = await db
        .insert(entries)
        .values({
          slug,
          name: name!,
          kind: item.kind ?? "note",
          summary: item.summary ?? "",
          body: item.body ?? "",
          dmNotes: item.dmNotes ?? "",
          fields: item.fields ?? {},
          tags: item.tags ?? [],
          visibility: item.visibility ?? "public",
          sourcePath: item.sourcePath ?? null,
        })
        .returning({ id: entries.id, slug: entries.slug });
      bySlug.set(row.slug, row.id);
      created++;
    }
  }

  return NextResponse.json({ ok: true, created, updated, skipped });
}
