import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Archive } from "lucide-react";
import { EmptyState, PageHeading } from "@/components/entry-card";
import { getCurrentUser } from "@/lib/auth";
import { listArchived } from "@/lib/entries";
import { ArchiveRow } from "./archive-row";

export const metadata: Metadata = { title: "Archive" };

export default async function ArchivePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/welcome");
  if (user.role !== "dm") redirect("/");

  const rows = await listArchived();

  return (
    <div className="max-w-4xl">
      <PageHeading
        Icon={Archive}
        title="Archive"
        blurb="Nothing here is deleted. Restore any entry to put it back in the codex."
      />

      {rows.length === 0 ? (
        <EmptyState
          Icon={Archive}
          title="The archive is empty"
          hint="Archived entries land here and can be restored at any time."
        />
      ) : (
        <div className="grid gap-2">
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
