import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { entries, links, revisions, rollTables } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { PageHeading } from "@/components/entry-card";
import { ImportPanel } from "./import-panel";

export const metadata: Metadata = { title: "Backup & Import" };

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/welcome");
  if (user.role !== "dm") redirect("/");

  const [
    [entryCount],
    [linkCount],
    [revCount],
    [tableCount],
    [archivedCount],
    [generatedCount],
  ] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(entries),
    db.select({ n: sql<number>`count(*)::int` }).from(links),
    db.select({ n: sql<number>`count(*)::int` }).from(revisions),
    db.select({ n: sql<number>`count(*)::int` }).from(rollTables),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(entries)
      .where(sql`archived_at IS NOT NULL`),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(entries)
      .where(sql`body_source = 'generated'`),
  ]);

  const stats = [
    { label: "Entries", value: entryCount.n },
    { label: "Connections", value: linkCount.n },
    { label: "Revisions kept", value: revCount.n },
    { label: "Random tables", value: tableCount.n },
    { label: "Archived", value: archivedCount.n },
  ];

  return (
    <div style={{ maxWidth: "48rem" }}>
      <PageHeading
        icon="⚙"
        title="Backup & Import"
        blurb="Take a copy of everything, or restore from one."
      />

      <section style={{ marginBottom: "2.5rem" }}>
        <h2 className="label">The codex right now</h2>
        <div
          style={{
            display: "grid",
            gap: "0.6rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 8rem), 1fr))",
          }}
        >
          {stats.map((s) => (
            <div key={s.label} className="card" style={{ padding: "0.85rem 1rem" }}>
              <p
                className="font-display"
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  color: "var(--accent)",
                }}
              >
                {s.value.toLocaleString()}
              </p>
              <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: "2.5rem" }}>
        <h2 className="label">Download a backup</h2>
        <p
          style={{
            fontSize: "0.875rem",
            color: "var(--text-muted)",
            marginBottom: "0.85rem",
          }}
        >
          The JSON file is a complete copy — every entry, secret, DM note, link,
          and table. Keep one somewhere safe. Markdown is for reading and
          printing, not for restoring.
        </p>
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          <a href="/api/export?format=json" className="btn btn-primary" download>
            ↓ Download JSON backup
          </a>
          <a href="/api/export?format=markdown" className="btn" download>
            ↓ Download as Markdown
          </a>
        </div>
      </section>

      {generatedCount.n > 0 && (
        <section style={{ marginBottom: "2.5rem" }}>
          <h2 className="label">Generated descriptions</h2>
          <p
            style={{
              fontSize: "0.875rem",
              color: "var(--text-muted)",
              marginBottom: "0.85rem",
            }}
          >
            {generatedCount.n.toLocaleString()}{" "}
            {generatedCount.n === 1 ? "entry has" : "entries have"} a description
            written from its own properties rather than by you. Each one is
            labelled on its page, and editing it by hand makes it yours. To clear
            them all and go back to empty entries, run{" "}
            <code
              style={{
                background: "var(--bg-sunken)",
                padding: "0.05rem 0.35rem",
                borderRadius: 4,
              }}
            >
              npm run describe -- --revert
            </code>
            .
          </p>
        </section>
      )}

      <section>
        <h2 className="label">Restore from a backup</h2>
        <ImportPanel />
      </section>
    </div>
  );
}
