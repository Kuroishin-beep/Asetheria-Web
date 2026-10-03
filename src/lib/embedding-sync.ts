import "server-only";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { entries } from "@/db/schema";

/**
 * Keeps an entry's semantic-search vector in step with its text.
 *
 * Every write path clears the stale vector in the same UPDATE that changes the
 * text, then calls this. The new vector is computed after the response has
 * gone out (`after`), so a save never waits on the model. If the model is
 * unavailable the entry simply stays un-embedded — keyword search still finds
 * it, and `npm run embeddings:generate` picks it up later because it embeds
 * every row whose vector is null.
 */
export function refreshEmbeddingAfterResponse(entryId: string) {
  refreshEmbeddingsAfterResponse([entryId]);
}

/** One background pass over many entries, one at a time — a bulk import must not run the model thousands of times in parallel. */
export function refreshEmbeddingsAfterResponse(entryIds: string[]) {
  if (entryIds.length === 0) return;
  after(async () => {
    for (const entryId of entryIds) {
      try {
        const [row] = await db
          .select({
            name: entries.name,
            summary: entries.summary,
            body: entries.body,
            fields: entries.fields,
          })
          .from(entries)
          .where(eq(entries.id, entryId))
          .limit(1);
        if (!row) continue;

        const { embed, entryEmbeddingText } = await import("@/lib/embeddings");
        const vector = await embed(entryEmbeddingText(row));
        await db.update(entries).set({ embedding: vector }).where(eq(entries.id, entryId));
      } catch (err) {
        console.error(
          JSON.stringify({
            event: "embedding_refresh_failed",
            entryId,
            message: err instanceof Error ? err.message : String(err),
          }),
        );
        // The model failing once means it will fail for the rest; leave them
        // null for `npm run embeddings:generate` rather than retrying N times.
        return;
      }
    }
  });
}
