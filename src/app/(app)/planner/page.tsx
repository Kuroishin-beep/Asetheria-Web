import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { NotebookPen } from "lucide-react";
import { PageHeading } from "@/components/entry-card";
import { PlannerPanels } from "@/components/planner-panels";
import { getCurrentUser } from "@/lib/auth";
import { listEntries } from "@/lib/entries";
import { recentSessions } from "@/lib/planner";
import { listPlayers } from "@/lib/rbac";

export const metadata: Metadata = { title: "Planner" };

/** The DM's table prep: start a session, build an encounter, reveal what the party learned. */
export default async function PlannerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/welcome");
  if (user.role !== "dm") redirect("/");

  const [players, tables, sessions] = await Promise.all([
    listPlayers(),
    listEntries(user, { kind: "table", limit: 300 }),
    recentSessions(5),
  ]);

  return (
    <div className="max-w-6xl">
      <PageHeading
        Icon={NotebookPen}
        title="Planner"
        blurb="Start a session, roll an encounter, and open up what the party learned."
      />
      <PlannerPanels
        players={players}
        tables={tables.map((t) => ({ slug: t.slug, name: t.name }))}
        sessions={sessions.map((s) => ({ slug: s.slug, name: s.name, playDate: s.fields?.playDate ?? "" }))}
      />
    </div>
  );
}
