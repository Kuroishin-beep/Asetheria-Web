import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Share2 } from "lucide-react";
import { EmptyState, PageHeading } from "@/components/entry-card";
import { RelationWebView } from "@/components/relation-web-view";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { getCurrentUser } from "@/lib/auth";
import { KIND_BY_KEY } from "@/lib/kinds";
import { WEB_EDGE_CAP, webGraph } from "@/lib/relations";
import { RELATION_TYPES, RELATION_TYPE_KEYS, type RelationType } from "@/lib/relations-core";

export const metadata: Metadata = { title: "Relationships" };

const WEB_TYPES = RELATION_TYPE_KEYS.filter((t) => RELATION_TYPES[t].group === "web");
const asList = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

export default async function RelationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/welcome");

  const sp = await searchParams;
  const types = asList(sp.type).filter((t): t is RelationType => (WEB_TYPES as string[]).includes(t));
  const everything = await webGraph(user, { types: [], kinds: [] });
  const kindsPresent: string[] = [...new Set<string>(everything.nodes.map((n) => n.kind))].sort();
  const kinds = asList(sp.kind).filter((k) => kindsPresent.includes(k));
  const graph = types.length === 0 && kinds.length === 0 ? everything : await webGraph(user, { types, kinds });
  const filtered = types.length > 0 || kinds.length > 0;

  return (
    <div className="max-w-6xl">
      <PageHeading Icon={Share2} title="Relationships" blurb="Alliances, rivalries, overlords and memberships among the empires, groups, cities and people you know of." />

      {everything.edges.length === 0 ? (
        <EmptyState
          Icon={Share2}
          title="No relationships yet"
          hint={user.role === "dm" ? "Open any empire, organization, faction, city or person and add an alliance, a rivalry, an overlord or a membership." : "Nothing has been revealed about how these powers relate yet."}
        />
      ) : (
        <>
          <Card size="sm" className="mb-6">
            <CardContent>
              <form method="get" action="/relations" aria-label="Filter the relationships" className="grid gap-4">
                <fieldset className="flex flex-wrap gap-x-5 gap-y-2">
                  <legend className="mb-1 text-sm font-medium">Kinds of tie</legend>
                  {WEB_TYPES.map((t) => (
                    <div key={t} className="flex items-center gap-2">
                      <Checkbox id={`type-${t}`} name="type" value={t} defaultChecked={types.includes(t)} />
                      <Label htmlFor={`type-${t}`}>{RELATION_TYPES[t].label.replace(/ of$/, "")}</Label>
                    </div>
                  ))}
                </fieldset>
                <fieldset className="flex flex-wrap gap-x-5 gap-y-2">
                  <legend className="mb-1 text-sm font-medium">Only between these kinds of page</legend>
                  {kindsPresent.map((k) => (
                    <div key={k} className="flex items-center gap-2">
                      <Checkbox id={`kind-${k}`} name="kind" value={k} defaultChecked={kinds.includes(k)} />
                      <Label htmlFor={`kind-${k}`}>{KIND_BY_KEY[k as keyof typeof KIND_BY_KEY]?.label ?? k}</Label>
                    </div>
                  ))}
                </fieldset>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" variant="secondary" size="sm">Filter</Button>
                  {filtered && (
                    <Button asChild variant="ghost" size="sm">
                      <Link href="/relations">Clear filters</Link>
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>

          <p role="status" className="mb-4 text-sm text-muted-foreground" data-testid="relation-count">
            {graph.edges.length} {graph.edges.length === 1 ? "tie" : "ties"} between {graph.nodes.length} {graph.nodes.length === 1 ? "page" : "pages"}
            {graph.truncated ? `; showing the first ${WEB_EDGE_CAP}` : ""}
          </p>

          {graph.edges.length === 0 ? (
            <EmptyState
              Icon={Share2}
              title="No ties match those filters"
              hint="Try another kind of tie or kind of page, or clear the filters."
              action={
                <Button asChild variant="outline">
                  <Link href="/relations">Clear filters</Link>
                </Button>
              }
            />
          ) : (
            <RelationWebView pages={graph.nodes.map((n) => ({ id: n.id, slug: n.slug, name: n.name, kind: n.kind }))} edges={graph.edges} />
          )}
        </>
      )}
    </div>
  );
}
