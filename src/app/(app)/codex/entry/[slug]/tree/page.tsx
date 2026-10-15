import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { GitBranch } from "lucide-react";
import { FamilyTreeView } from "@/components/family-tree-view";
import { EmptyState, PageHeading } from "@/components/entry-card";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { getEntryBySlug } from "@/lib/entries";
import { FAMILY_NODE_CAP, familyGraph } from "@/lib/relations";
import { layoutFamily } from "@/lib/relations-core";

export const metadata: Metadata = { title: "Family tree" };

export default async function FamilyTreePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/welcome");
  const entry = await getEntryBySlug(user, slug);
  if (!entry) notFound();

  const graph = await familyGraph(user, entry.id);
  const back = (
    <Button asChild variant="outline">
      <Link href={`/codex/entry/${entry.slug}`}>Back to {entry.name}</Link>
    </Button>
  );

  return (
    <div className="max-w-6xl">
      <PageHeading Icon={GitBranch} title={`Family of ${entry.name}`} blurb="Parents, spouses and siblings, generation by generation." action={back} />
      {graph.edges.length === 0 ? (
        <EmptyState
          Icon={GitBranch}
          title="No family ties yet"
          hint={user.role === "dm" ? `Add a parent, spouse or sibling from ${entry.name}'s page and the tree draws itself.` : "Nothing has been revealed about this family yet."}
          action={back}
        />
      ) : (
        <>
          {graph.truncated && (
            <p role="note" className="mb-4 text-sm text-muted-foreground">
              This family is large; the first {FAMILY_NODE_CAP} people are shown.
            </p>
          )}
          <FamilyTreeView
            layout={layoutFamily(graph.nodes.map((n) => ({ id: n.id, name: n.name })), graph.edges)}
            people={graph.nodes.map((n) => ({ id: n.id, slug: n.slug, name: n.name }))}
            edges={graph.edges}
            rootId={entry.id}
          />
        </>
      )}
    </div>
  );
}
