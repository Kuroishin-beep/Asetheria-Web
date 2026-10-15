import Link from "next/link";
import { GitBranch, Share2 } from "lucide-react";
import { RelationEditor, RemoveRelationButton } from "@/components/relation-editor";
import { Card, CardContent } from "@/components/ui/card";
import { RELATION_TYPES } from "@/lib/relations-core";
import type { ShownRelation } from "@/lib/relations";

/**
 * The relations of a page as a list, each as it reads from this page ("Parent of Aria"), with links to the
 * other page. Only relations whose other end the viewer may read are here, so a hidden page is never named.
 */
export function RelationsPanel({ entryId, slug, shown, forDm }: { entryId: string; slug: string; shown: ShownRelation[]; forDm: boolean }) {
  const hasFamily = shown.some((r) => RELATION_TYPES[r.type].group === "family");
  const hasWeb = shown.some((r) => RELATION_TYPES[r.type].group === "web");
  if (shown.length === 0 && !forDm) return null;

  return (
    <Card size="sm" className="mb-6" data-testid="relations-panel">
      <CardContent>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.07em] text-muted-foreground">Relationships</h2>
        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">No relations yet.</p>
        ) : (
          <ul className="grid gap-1.5 text-[15px]">
            {shown.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-2" data-testid="relation-item">
                <span>
                  {r.text.slice(0, r.text.length - r.other.name.length)}
                  <Link href={`/codex/entry/${r.other.slug}`} className="text-link underline-offset-4 hover:underline">
                    {r.other.name}
                  </Link>
                </span>
                {r.note && <span className="text-sm text-muted-foreground">({r.note})</span>}
                {forDm && <RemoveRelationButton id={r.id} label={r.text} />}
              </li>
            ))}
          </ul>
        )}
        {(hasFamily || hasWeb) && (
          <p className="no-print mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {hasFamily && (
              <Link href={`/codex/entry/${slug}/tree`} className="inline-flex items-center gap-1 text-link underline-offset-4 hover:underline">
                <GitBranch aria-hidden="true" className="size-4" />
                View the family tree
              </Link>
            )}
            {hasWeb && (
              <Link href="/relations" className="inline-flex items-center gap-1 text-link underline-offset-4 hover:underline">
                <Share2 aria-hidden="true" className="size-4" />
                See all alliances and rivalries
              </Link>
            )}
          </p>
        )}
        {forDm && <RelationEditor entryId={entryId} />}
      </CardContent>
    </Card>
  );
}
