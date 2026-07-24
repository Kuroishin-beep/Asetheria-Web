import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { countByKind, getRecentlyUpdated, listAllTags } from "@/lib/entries";
import { KINDS } from "@/lib/kinds";
import { CardGrid, EntryCard, PageHeading } from "@/components/entry-card";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [counts, recent, tags] = await Promise.all([
    countByKind(user.role),
    getRecentlyUpdated(user.role, 6),
    listAllTags(user.role),
  ]);

  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  const populated = KINDS.filter((k) => (counts[k.kind] ?? 0) > 0);

  return (
    <>
      <PageHeading
        title="The Continent of Asetheria"
        blurb={
          user.role === "dm"
            ? `${total} entries in the codex. Everything here is yours to change.`
            : `${total} entries the party has uncovered.`
        }
      />

      {/* ---- Section tiles ---- */}
      <section aria-labelledby="sections-heading" style={{ marginBottom: "2.5rem" }}>
        <h2 id="sections-heading" className="label">
          Browse
        </h2>
        <div
          style={{
            display: "grid",
            gap: "0.75rem",
            gridTemplateColumns:
              "repeat(auto-fill, minmax(min(100%, 11rem), 1fr))",
          }}
        >
          {populated.map((k) => (
            <Link
              key={k.kind}
              href={`/codex/${k.slug}`}
              className="card"
              style={{
                padding: "1rem",
                textDecoration: "none",
                color: "inherit",
                display: "flex",
                flexDirection: "column",
                gap: "0.15rem",
              }}
            >
              <span
                aria-hidden="true"
                style={{ fontSize: "1.35rem", lineHeight: 1 }}
              >
                {k.icon}
              </span>
              <span
                className="font-display"
                style={{ fontWeight: 600, marginTop: "0.5rem" }}
              >
                {k.label}
              </span>
              <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                {counts[k.kind]} {counts[k.kind] === 1 ? "entry" : "entries"}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ---- Recently touched ---- */}
      {recent.length > 0 && (
        <section
          aria-labelledby="recent-heading"
          style={{ marginBottom: "2.5rem" }}
        >
          <h2 id="recent-heading" className="label">
            Recently updated
          </h2>
          <CardGrid>
            {recent.map((e) => (
              <EntryCard
                key={e.id}
                slug={e.slug}
                name={e.name}
                kind={e.kind}
                summary={e.summary}
              />
            ))}
          </CardGrid>
        </section>
      )}

      {/* ---- Tag cloud ---- */}
      {tags.length > 0 && (
        <section aria-labelledby="tags-heading">
          <h2 id="tags-heading" className="label">
            Tags
          </h2>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {tags.slice(0, 40).map((t) => (
              <Link
                key={t.tag}
                href={`/search?tag=${encodeURIComponent(t.tag)}`}
                className="chip"
              >
                {t.tag}
                <span style={{ color: "var(--text-faint)" }}>{t.total}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
