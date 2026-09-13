import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { asc, desc, isNull, isNotNull, and, ne } from "drizzle-orm";
import { db } from "@/db";
import { rollTables } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { PageHeading } from "@/components/entry-card";
import { TableManager } from "./table-manager";

export const metadata: Metadata = { title: "Random Tables" };

export default async function TablesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const isDM = user.role === "dm";

  const rows = await db
    .select()
    .from(rollTables)
    .where(
      isDM
        ? isNull(rollTables.archivedAt)
        : and(isNull(rollTables.archivedAt), ne(rollTables.visibility, "secret")),
    )
    .orderBy(asc(rollTables.name));

  // Archived tables have no browse view of their own (unlike entries'
  // /archive) — only the DM can see and restore them, from right here.
  const archivedRows = isDM
    ? await db
        .select()
        .from(rollTables)
        .where(isNotNull(rollTables.archivedAt))
        .orderBy(desc(rollTables.updatedAt))
    : [];

  return (
    <div style={{ maxWidth: "52rem" }}>
      <PageHeading
        icon="🎰"
        title="Random Tables"
        blurb="Roll for names, loot, weather, rumours — whatever you need mid-session."
      />
      <TableManager
        isDM={isDM}
        tables={rows.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          dice: t.dice,
          items: t.items,
          visibility: t.visibility,
        }))}
        archivedTables={archivedRows.map((t) => ({ id: t.id, name: t.name }))}
      />
    </div>
  );
}
