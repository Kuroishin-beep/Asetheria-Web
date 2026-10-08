import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Network } from "lucide-react";
import { PageHeading } from "@/components/entry-card";
import { GraphView } from "@/components/graph-view";
import { getCurrentUser } from "@/lib/auth";
import { getGraphData } from "@/lib/entries";
import { buildFacets, filterGraph, parseGraphFilters } from "@/lib/graph-filter";
import { layoutGraphCached } from "@/lib/graph-cache";

export const metadata: Metadata = { title: "Graph" };

export default async function GraphPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Everything below works on pages this viewer may already see, so a filter can
  // only narrow the picture, and the facets (kinds, regions, tags) are counted
  // over those pages alone.
  const { nodes, edges } = await getGraphData(user);
  const facets = buildFacets(nodes);
  const filters = parseGraphFilters(await searchParams, facets);
  const shown = filterGraph(nodes, edges, filters);
  // Remembered by content, so repeat visits do not re-run the (CPU-heavy) layout on the server.
  const positions = layoutGraphCached(shown.nodes, shown.edges);

  return (
    <div>
      <PageHeading
        Icon={Network}
        title="Graph"
        blurb="Every page you can see, and how it connects to every other one you can see."
      />
      <GraphView
        nodes={shown.nodes}
        edges={shown.edges}
        positions={positions}
        matches={shown.matches}
        facets={facets}
        filters={filters}
        total={nodes.length}
      />
    </div>
  );
}
