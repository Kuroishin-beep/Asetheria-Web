import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { asc, ne } from "drizzle-orm";
import { db } from "@/db";
import { entries } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getEntryBySlug, getRevisions } from "@/lib/entries";
import { updateEntryAction } from "@/lib/actions";
import { EntryForm } from "@/components/entry-form";
import { PageHeading } from "@/components/entry-card";
import { RevisionList } from "./revision-list";

type Params = { slug: string };

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
  if (!user) redirect("/login");
  if (user.role !== "dm") redirect(`/codex/entry/${slug}`);

  const entry = await getEntryBySlug(user.role, slug);
  if (!entry) notFound();

  const [parents, revisions] = await Promise.all([
    db
      .select({ id: entries.id, name: entries.name, kind: entries.kind })
      .from(entries)
      .where(ne(entries.id, entry.id))
      .orderBy(asc(entries.name))
      .limit(1000),
    getRevisions(entry.id),
  ]);

  // The action needs the id; bind it so the form only supplies form data.
  const action = updateEntryAction.bind(null, entry.id);

  return (
    <div style={{ maxWidth: "56rem" }}>
      <PageHeading
        title={`Editing ${entry.name}`}
        blurb="Saving keeps a snapshot of the previous version — nothing is lost."
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
        <section style={{ marginTop: "3rem" }}>
          <h2 className="label">History ({revisions.length})</h2>
          <div className="rule-fade" style={{ margin: "0.5rem 0 1rem" }} />
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
