"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { entries, links, revisions, rollTables, type Entry } from "@/db/schema";
import { requireDM } from "@/lib/auth";
import { kindSlug } from "@/lib/kinds";
import { buildNameIndex, resolveLinks, slugify } from "@/lib/links";
import {
  parseEntryForm,
  rollTableInputSchema,
  type EntryInput,
} from "@/lib/validation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Writes a full snapshot of an entry before it changes. Combined with soft
 * deletes, this is what makes every destructive-looking action reversible.
 */
async function snapshot(
  entry: Entry,
  action: string,
  author: { id: string; username: string },
) {
  await db.insert(revisions).values({
    entryId: entry.id,
    snapshot: entry as unknown as Record<string, unknown>,
    action,
    authorId: author.id,
    authorName: author.username,
  });
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = slugify(base);
  for (let n = 0; n < 500; n++) {
    const candidate = n === 0 ? root : `${root}-${n + 1}`;
    const where = excludeId
      ? and(eq(entries.slug, candidate), ne(entries.id, excludeId))
      : eq(entries.slug, candidate);
    const [clash] = await db
      .select({ id: entries.id })
      .from(entries)
      .where(where)
      .limit(1);
    if (!clash) return candidate;
  }
  return `${root}-${Date.now()}`;
}

/** Recomputes this entry's outgoing edges after its text or fields change. */
async function rebuildLinks(
  entryId: string,
  body: string,
  fields: Record<string, string>,
) {
  const all = await db.select({ id: entries.id, name: entries.name }).from(entries);
  const nameIndex = buildNameIndex(all);

  await db.delete(links).where(eq(links.sourceId, entryId));
  const resolved = resolveLinks(entryId, body, fields, nameIndex);
  if (resolved.length) {
    await db
      .insert(links)
      .values(
        resolved.map((l) => ({
          sourceId: entryId,
          targetId: l.targetId,
          relation: l.relation,
          context: l.context ?? null,
        })),
      )
      .onConflictDoNothing();
  }
}

function revalidateEntry(slug?: string, kind?: Entry["kind"]) {
  revalidatePath("/");
  if (kind) revalidatePath(`/codex/${kindSlug(kind)}`);
  if (slug) revalidatePath(`/codex/entry/${slug}`);
}

// ---------------------------------------------------------------------------
// Entry mutations
// ---------------------------------------------------------------------------

export async function createEntryAction(_prev: unknown, formData: FormData) {
  const user = await requireDM();
  const parsed = parseEntryForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const input: EntryInput = parsed.data;
  const slug = await uniqueSlug(input.name);

  const [row] = await db
    .insert(entries)
    .values({
      slug,
      kind: input.kind,
      name: input.name,
      summary: input.summary,
      body: input.body,
      dmNotes: input.dmNotes,
      fields: input.fields,
      tags: input.tags,
      visibility: input.visibility,
      parentId: input.parentId,
    })
    .returning();

  await snapshot(row, "create", user);
  await rebuildLinks(row.id, row.body, row.fields);
  revalidateEntry(row.slug, row.kind);
  redirect(`/codex/entry/${row.slug}`);
}

export async function updateEntryAction(
  entryId: string,
  _prev: unknown,
  formData: FormData,
) {
  const user = await requireDM();
  const parsed = parseEntryForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const input = parsed.data;

  const [current] = await db
    .select()
    .from(entries)
    .where(eq(entries.id, entryId))
    .limit(1);
  if (!current) return { error: "Entry not found." };

  await snapshot(current, "update", user);

  // The slug only follows a rename when the name actually changed, so existing
  // links and bookmarks keep working through ordinary edits.
  const slug =
    current.name === input.name
      ? current.slug
      : await uniqueSlug(input.name, current.id);

  const [row] = await db
    .update(entries)
    .set({
      kind: input.kind,
      name: input.name,
      slug,
      summary: input.summary,
      body: input.body,
      dmNotes: input.dmNotes,
      fields: input.fields,
      tags: input.tags,
      visibility: input.visibility,
      parentId: input.parentId,
      // Once the body has been edited by hand it is no longer generated text,
      // so the banner disappears and the revert command leaves it alone.
      bodySource: input.body === current.body ? current.bodySource : null,
      updatedAt: new Date(),
    })
    .where(eq(entries.id, entryId))
    .returning();

  await rebuildLinks(row.id, row.body, row.fields);
  revalidateEntry(row.slug, row.kind);
  redirect(`/codex/entry/${row.slug}`);
}

/**
 * "Delete" in the UI. The row stays in the table with `archivedAt` set and can
 * be restored from /archive at any time.
 */
export async function archiveEntryAction(entryId: string) {
  const user = await requireDM();
  const [current] = await db
    .select()
    .from(entries)
    .where(eq(entries.id, entryId))
    .limit(1);
  if (!current) return { error: "Entry not found." };
  if (current.archivedAt) return { ok: true };

  await snapshot(current, "archive", user);
  await db
    .update(entries)
    .set({ archivedAt: new Date() })
    .where(eq(entries.id, entryId));

  revalidateEntry(current.slug, current.kind);
  revalidatePath("/archive");
  redirect(`/codex/${kindSlug(current.kind)}`);
}

export async function restoreEntryAction(entryId: string) {
  const user = await requireDM();
  const [current] = await db
    .select()
    .from(entries)
    .where(eq(entries.id, entryId))
    .limit(1);
  if (!current) return { error: "Entry not found." };

  await snapshot(current, "restore", user);
  await db
    .update(entries)
    .set({ archivedAt: null })
    .where(eq(entries.id, entryId));

  revalidateEntry(current.slug, current.kind);
  revalidatePath("/archive");
  return { ok: true };
}

/**
 * The single path that removes a row for good — and it refuses to run on
 * anything that holds content. Only genuinely empty entries can be purged.
 */
export async function purgeBlankEntryAction(entryId: string) {
  await requireDM();
  const [current] = await db
    .select()
    .from(entries)
    .where(eq(entries.id, entryId))
    .limit(1);
  if (!current) return { error: "Entry not found." };

  const hasContent =
    current.body.trim().length > 0 ||
    current.summary.trim().length > 0 ||
    current.dmNotes.trim().length > 0 ||
    current.tags.length > 0 ||
    Object.values(current.fields ?? {}).some((v) => String(v).trim().length > 0);

  if (hasContent) {
    return {
      error:
        "This entry still has content, so it can only be archived — never deleted.",
    };
  }

  await db.delete(entries).where(eq(entries.id, entryId));
  revalidatePath("/archive");
  revalidateEntry(current.slug, current.kind);
  return { ok: true };
}

/** Rolls an entry back to an earlier revision, snapshotting the current state first. */
export async function revertToRevisionAction(revisionId: string) {
  const user = await requireDM();
  const [rev] = await db
    .select()
    .from(revisions)
    .where(eq(revisions.id, revisionId))
    .limit(1);
  if (!rev) return { error: "Revision not found." };

  const [current] = await db
    .select()
    .from(entries)
    .where(eq(entries.id, rev.entryId))
    .limit(1);
  if (!current) return { error: "Entry not found." };

  await snapshot(current, "update", user);
  const snap = rev.snapshot as Partial<Entry>;

  const [row] = await db
    .update(entries)
    .set({
      name: snap.name ?? current.name,
      summary: snap.summary ?? current.summary,
      body: snap.body ?? current.body,
      dmNotes: snap.dmNotes ?? current.dmNotes,
      fields: (snap.fields as Record<string, string>) ?? current.fields,
      tags: snap.tags ?? current.tags,
      visibility: snap.visibility ?? current.visibility,
      kind: snap.kind ?? current.kind,
      updatedAt: new Date(),
    })
    .where(eq(entries.id, rev.entryId))
    .returning();

  await rebuildLinks(row.id, row.body, row.fields);
  revalidateEntry(row.slug, row.kind);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Roll tables
// ---------------------------------------------------------------------------

export async function saveRollTableAction(
  tableId: string | null,
  _prev: unknown,
  formData: FormData,
) {
  await requireDM();

  let items: unknown = [];
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { error: "Table rows are malformed." };
  }

  const parsed = rollTableInputSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    dice: String(formData.get("dice") ?? "1d20"),
    visibility: String(formData.get("visibility") ?? "secret"),
    items,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid table." };
  }
  const input = parsed.data;

  if (tableId) {
    await db
      .update(rollTables)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(rollTables.id, tableId));
  } else {
    const base = slugify(input.name);
    const [clash] = await db
      .select({ id: rollTables.id })
      .from(rollTables)
      .where(eq(rollTables.slug, base))
      .limit(1);
    await db
      .insert(rollTables)
      .values({ ...input, slug: clash ? `${base}-${Date.now()}` : base });
  }

  revalidatePath("/tools/tables");
  return { ok: true };
}

export async function archiveRollTableAction(tableId: string) {
  await requireDM();
  await db
    .update(rollTables)
    .set({ archivedAt: new Date() })
    .where(eq(rollTables.id, tableId));
  revalidatePath("/tools/tables");
  return { ok: true };
}

export async function restoreRollTableAction(tableId: string) {
  await requireDM();
  await db
    .update(rollTables)
    .set({ archivedAt: null })
    .where(eq(rollTables.id, tableId));
  revalidatePath("/tools/tables");
  return { ok: true };
}
