import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { listPlayers, listGrantsForUser } from "@/lib/rbac";
import { db } from "@/db";
import { entries } from "@/db/schema";
import { isNull } from "drizzle-orm";
import { KINDS } from "@/lib/kinds";
import { PageHeading } from "@/components/entry-card";
import { RbacPanel } from "@/components/rbac-panel";

export const metadata: Metadata = { title: "Players & Access" };

export default async function RbacAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ player?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "dm") redirect("/");

  const { player: selectedPlayerId } = await searchParams;

  const [players, allEntries] = await Promise.all([
    listPlayers(),
    db
      .select({ id: entries.id, name: entries.name, kind: entries.kind, slug: entries.slug })
      .from(entries)
      .where(isNull(entries.archivedAt))
      .orderBy(entries.name),
  ]);

  const activePlayer =
    players.find((p) => p.id === selectedPlayerId) ?? players[0] ?? null;
  const grants = activePlayer ? await listGrantsForUser(activePlayer.id) : [];

  return (
    <div style={{ maxWidth: "64rem" }}>
      <PageHeading
        icon="🛡"
        title="Players & Access"
        blurb="Decide what each player can see. Nothing is visible to a player until it's granted here — a secret entry never is, no matter what."
      />
      <RbacPanel
        players={players}
        activePlayerId={activePlayer?.id ?? null}
        grants={grants.map((g) => ({ kind: g.kind, entryId: g.entryId, granted: g.granted }))}
        entries={allEntries}
        kinds={KINDS.map((k) => ({ kind: k.kind, label: k.label, icon: k.icon }))}
      />
    </div>
  );
}
