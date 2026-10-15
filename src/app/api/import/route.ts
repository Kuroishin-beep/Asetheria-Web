import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { entries, revisions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { entryInputSchema } from "@/lib/validation";
import { slugify } from "@/lib/links";
import { rebuildLinksForEntry } from "@/lib/link-graph";
import { refreshEmbeddingsAfterResponse } from "@/lib/embedding-sync";
import { inlineForDm, planSecrets, pruneSecrets, writeSecrets } from "@/lib/secrets";

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
  const toEmbed: string[] = [];
  let skipped = 0;
  // A page whose secret blocks are malformed is skipped with its reason; the rest of the file still imports.
  const rejected: { name: string; error: string }[] = [];

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
      // The row this import file matched by slug was removed (e.g. purged)
      // between the initial slug lookup and now — skip it rather than throw,
      // so one concurrent edit can't fail an entire import.
      if (!current) {
        skipped++;
        continue;
      }

      let plan: Awaited<ReturnType<typeof planSecrets>> | null = null;
      if (item.body !== undefined) {
        plan = await planSecrets(current.id, item.body);
        if (!plan.ok) {
          rejected.push({ name: current.name, error: plan.error });
          skipped++;
          continue;
        }
        await writeSecrets(current.id, plan.blocks);
      }

      await db.insert(revisions).values({
        entryId: current.id,
        snapshot: { ...current, body: await inlineForDm(current.id, current.body) } as unknown as Record<string, unknown>,
        action: "import",
        authorId: user.id,
        authorName: user.username,
      });

      const [row] = await db
        .update(entries)
        .set({
          name: name ?? current.name,
          kind: item.kind ?? current.kind,
          summary: item.summary ?? current.summary,
          body: plan?.ok ? plan.body : current.body,
          dmNotes: item.dmNotes ?? current.dmNotes,
          fields: item.fields ?? current.fields,
          tags: item.tags ?? current.tags,
          visibility: item.visibility ?? current.visibility,
          embedding: null,
          updatedAt: new Date(),
        })
        .where(eq(entries.id, foundId))
        .returning();
      if (plan?.ok) await pruneSecrets(row.id, row.body);
      await rebuildLinksForEntry(row.id, row.body, row.fields);
      toEmbed.push(row.id);
      updated++;
    } else {
      const plan = await planSecrets(null, item.body ?? "");
      if (!plan.ok) {
        rejected.push({ name: name ?? slug, error: plan.error });
        skipped++;
        continue;
      }
      const [row] = await db
        .insert(entries)
        .values({
          slug,
          name: name!,
          kind: item.kind ?? "note",
          summary: item.summary ?? "",
          body: plan.body,
          dmNotes: item.dmNotes ?? "",
          fields: item.fields ?? {},
          tags: item.tags ?? [],
          visibility: item.visibility ?? "public",
          sourcePath: item.sourcePath ?? null,
        })
        .returning();
      bySlug.set(row.slug, row.id);
      await writeSecrets(row.id, plan.blocks);
      await rebuildLinksForEntry(row.id, row.body, row.fields);
      toEmbed.push(row.id);
      created++;
    }
  }

  refreshEmbeddingsAfterResponse(toEmbed);
  return NextResponse.json({ ok: true, created, updated, skipped, rejected: rejected.slice(0, 20) });
}
