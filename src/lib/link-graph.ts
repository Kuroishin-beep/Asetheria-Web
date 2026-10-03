import "server-only";
import { eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { entries, links } from "@/db/schema";
import { buildNameIndex, parseAliases, resolveAllLinks } from "@/lib/links";

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
  // Archived entries are left out so a merged duplicate's name resolves to the
  // surviving entry (which lists it under `aliases`), not to the archived twin.
  const all = await db
    .select({ id: entries.id, name: entries.name, kind: entries.kind, fields: entries.fields })
    .from(entries)
    .where(isNull(entries.archivedAt));
  const named = all.map((e) => ({ id: e.id, name: e.name, kind: e.kind, aliases: parseAliases(e.fields) }));
  const nameIndex = buildNameIndex(named);

  await db.delete(links).where(eq(links.sourceId, entryId));
  const resolved = resolveAllLinks(entryId, body, fields, nameIndex, named);
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
