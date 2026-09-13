import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { entries, links } from "@/db/schema";
import { buildNameIndex, resolveLinks } from "@/lib/links";

/**
 * Recomputes one entry's outgoing edges after its text or fields change.
 * Shared by every write path that touches `body`/`fields` — server actions
 * (create/update/revert) and the backup importer — so none of them can
 * silently skip rebuilding the wiki-link graph the way the importer
 * previously did.
 */
export async function rebuildLinksForEntry(
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
