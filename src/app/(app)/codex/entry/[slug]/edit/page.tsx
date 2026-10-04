import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { and, asc, isNull, ne } from "drizzle-orm";
import { PencilLine } from "lucide-react";
import { db } from "@/db";
import { entries } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getEntryBySlug, getRevisions } from "@/lib/entries";
import { updateEntryAction } from "@/lib/actions";
import { EntryForm } from "@/components/entry-form";
import { PageHeading } from "@/components/entry-card";
import { Eyebrow } from "@/components/shared/eyebrow";
import { RevisionList } from "./revision-list";

type Params = { slug: string };

/** The parent picker is a plain list; beyond this many entries it is truncated. */
const PARENT_OPTION_LIMIT = 1000;

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Editing ${slug}` };
}

export default async function EditEntryPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/welcome");
  if (user.role !== "dm") redirect(`/codex/entry/${slug}`);

  const entry = await getEntryBySlug(user, slug);
  if (!entry) notFound();

  const [parents, revisions] = await Promise.all([
    db
      .select({ id: entries.id, name: entries.name, kind: entries.kind })
      .from(entries)
      // An archived page can't be a parent: its children would point at a 404.
      .where(and(ne(entries.id, entry.id), isNull(entries.archivedAt)))
      .orderBy(asc(entries.name))
      .limit(PARENT_OPTION_LIMIT),
    getRevisions(entry.id),
  ]);

  // The action needs the id; bind it so the form only supplies form data.
  const action = updateEntryAction.bind(null, entry.id);

  return (
    <div className="max-w-4xl">
      <PageHeading
        Icon={PencilLine}
        title={`Editing ${entry.name}`}
        blurb="Saving keeps a snapshot of the previous version. Nothing is lost."
      />
      <EntryForm
        action={action}
        cancelHref={`/codex/entry/${entry.slug}`}
        submitLabel="Save changes"
        parents={parents}
        initial={{
          id: entry.id,
          name: entry.name,
          kind: entry.kind,
          summary: entry.summary,
          body: entry.body,
          dmNotes: entry.dmNotes,
          visibility: entry.visibility,
          tags: entry.tags,
          fields: entry.fields ?? {},
          parentId: entry.parentId,
        }}
      />

      {revisions.length > 0 && (
        <section className="mt-12">
          <h2>
            <Eyebrow>History ({revisions.length})</Eyebrow>
          </h2>
          <div className="mb-4 mt-2 h-px bg-linear-to-r from-transparent via-border to-transparent" />
          <RevisionList
            revisions={revisions.map((r) => ({
              id: r.id,
              action: r.action,
              authorName: r.authorName,
              createdAt: r.createdAt.toISOString(),
            }))}
          />
        </section>
      )}
    </div>
  );
}
