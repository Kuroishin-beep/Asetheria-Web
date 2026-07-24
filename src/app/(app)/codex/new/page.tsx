import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { entries, type EntryKind } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { createEntryAction } from "@/lib/actions";
import { KIND_BY_KEY } from "@/lib/kinds";
import { EntryForm } from "@/components/entry-form";
import { PageHeading } from "@/components/entry-card";

export const metadata: Metadata = { title: "New entry" };

export default async function NewEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "dm") redirect("/");

  const { kind: kindParam } = await searchParams;
  const kind: EntryKind =
    kindParam && KIND_BY_KEY[kindParam as EntryKind]
      ? (kindParam as EntryKind)
      : "note";

  const parents = await db
    .select({ id: entries.id, name: entries.name, kind: entries.kind })
    .from(entries)
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
        cancelHref={`/codex/${KIND_BY_KEY[kind].slug}`}
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
