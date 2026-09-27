import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { getGraphData } from "@/lib/entries";
import { PageHeading } from "@/components/entry-card";
import { GraphView } from "@/components/graph-view";

export const metadata: Metadata = { title: "Graph" };

export default async function GraphPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { nodes, edges } = await getGraphData(user);

  return (
    <div>
      <PageHeading
        icon="🕸"
        title="Graph"
        blurb="Every page you can see, and how it connects to every other one you can see."
      />
      <GraphView nodes={nodes} edges={edges} />
    </div>
  );
}
