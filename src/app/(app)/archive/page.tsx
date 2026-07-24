import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { listArchived } from "@/lib/entries";
import { PageHeading, EmptyState } from "@/components/entry-card";
import { ArchiveRow } from "./archive-row";

export const metadata: Metadata = { title: "Archive" };

export default async function ArchivePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "dm") redirect("/");

  const rows = await listArchived();

  return (
    <div style={{ maxWidth: "56rem" }}>
      <PageHeading
        icon="🗄"
        title="Archive"
        blurb="Nothing here is deleted. Restore any entry to put it back in the codex."
      />

      {rows.length === 0 ? (
        <EmptyState
          title="The archive is empty"
          hint="Archived entries land here and can be restored at any time."
        />
      ) : (
        <div style={{ display: "grid", gap: "0.5rem" }}>
          {rows.map((e) => {
            const isBlank =
              !e.body.trim() &&
              !e.summary.trim() &&
              !e.dmNotes.trim() &&
              e.tags.length === 0 &&
              !Object.values(e.fields ?? {}).some((v) => String(v).trim());

            return (
              <ArchiveRow
                key={e.id}
                id={e.id}
                name={e.name}
                kind={e.kind}
                summary={e.summary}
                archivedAt={e.archivedAt?.toISOString() ?? null}
                isBlank={isBlank}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
