import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import { DatabaseBackup, Download, FileText } from "lucide-react";
import { db } from "@/db";
import { entries, links, revisions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { PageHeading } from "@/components/entry-card";
import { Eyebrow } from "@/components/shared/eyebrow";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ImportPanel } from "./import-panel";

export const metadata: Metadata = { title: "Backup & Import" };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-10 grid gap-3">
      <h2>
        <Eyebrow>{title}</Eyebrow>
      </h2>
      {children}
    </section>
  );
}

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
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(entries)
      .where(sql`kind = 'table' AND archived_at IS NULL`),
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
    <div className="max-w-3xl">
      <PageHeading
        Icon={DatabaseBackup}
        title="Backup & Import"
        blurb="Take a copy of everything, or restore from one."
      />

      <Section title="The codex right now">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] gap-3">
          {stats.map((s) => (
            <Card key={s.label} size="sm">
              <CardContent>
                <p className="font-display text-2xl font-bold text-gold">{s.value.toLocaleString()}</p>
                <p className="text-[13px] text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Download a backup">
        <p className="text-sm text-muted-foreground">
          The JSON file is a complete copy: every entry, secret, DM note, link, and table. Keep one somewhere safe.
          Markdown is for reading and printing, not for restoring.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <a href="/api/export?format=json" download>
              <Download aria-hidden="true" />
              Download JSON backup
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href="/api/export?format=markdown" download>
              <FileText aria-hidden="true" />
              Download as Markdown
            </a>
          </Button>
        </div>
      </Section>

      {generatedCount.n > 0 && (
        <Section title="Generated descriptions">
          <p className="text-sm text-muted-foreground">
            {generatedCount.n.toLocaleString()} {generatedCount.n === 1 ? "entry has" : "entries have"} a description
            written from its own properties rather than by you. Each one is labelled on its page, and editing it by
            hand makes it yours. To clear them all and go back to empty entries, run{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">npm run describe -- --revert</code>.
          </p>
        </Section>
      )}

      <Section title="Restore from a backup">
        <ImportPanel />
      </Section>
    </div>
  );
}
