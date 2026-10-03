import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { asc, isNull } from "drizzle-orm";
import { db } from "@/db";
import { entries, type EntryKind } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { createEntryAction } from "@/lib/actions";
import { KIND_BY_KEY, sectionPath } from "@/lib/kinds";
import { EntryForm } from "@/components/entry-form";
import { PageHeading } from "@/components/entry-card";

export const metadata: Metadata = { title: "New entry" };

export default async function NewEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/welcome");
  if (user.role !== "dm") redirect("/");

  const { kind: kindParam } = await searchParams;
  const kind: EntryKind =
    kindParam && KIND_BY_KEY[kindParam as EntryKind]
      ? (kindParam as EntryKind)
      : "note";

  const parents = await db
    .select({ id: entries.id, name: entries.name, kind: entries.kind })
    .from(entries)
    // An archived page can't be a parent: its children would point at a 404.
    .where(isNull(entries.archivedAt))
    .orderBy(asc(entries.name))
    .limit(1000);

  return (
    <div style={{ maxWidth: "56rem" }}>
      <PageHeading
        title={`New ${KIND_BY_KEY[kind].singular}`}
        blurb="Everything here can be changed later, and every edit is kept in history."
      />
      <EntryForm
        action={createEntryAction}
        cancelHref={sectionPath(kind)}
        submitLabel="Create entry"
        parents={parents}
        initial={{
          name: "",
          kind,
          summary: "",
          body: "",
          dmNotes: "",
          visibility: "public",
          tags: [],
          fields: {},
          parentId: null,
        }}
      />
    </div>
  );
}
