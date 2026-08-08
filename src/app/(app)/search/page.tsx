import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { listEntries, searchEntries } from "@/lib/entries";
import { kindIcon, KIND_BY_KEY } from "@/lib/kinds";
import { CardGrid, EntryCard, PageHeading } from "@/components/entry-card";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/welcome");

  const { q, tag } = await searchParams;

  // Tag browsing and full-text search share this page.
  if (tag) {
    const rows = await listEntries(user.role, { tag, limit: 500 });
    return (
      <>
        <PageHeading
          title={`Tagged “${tag}”`}
          blurb={`${rows.length} ${rows.length === 1 ? "entry" : "entries"}`}
        />
        {rows.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>Nothing carries that tag.</p>
        ) : (
          <CardGrid>
            {rows.map((e) => (
              <EntryCard
                key={e.id}
                slug={e.slug}
                name={e.name}
                kind={e.kind}
                summary={e.summary}
                tags={e.tags}
                visibility={e.visibility}
              />
            ))}
          </CardGrid>
        )}
      </>
    );
  }

  const query = (q ?? "").trim();
  const hits = query ? await searchEntries(user.role, query, 60) : [];

  return (
    <>
      <PageHeading
        title="Search"
        blurb="Looks through names, summaries, tags, and the full text of every entry."
      />

      <form
        action="/search"
        method="get"
        className="no-print"
        style={{ display: "flex", gap: "0.6rem", marginBottom: "1.75rem" }}
      >
        <input
          name="q"
          className="input"
          defaultValue={query}
          placeholder="Search the codex…"
          aria-label="Search query"
          autoFocus
          style={{ maxWidth: "32rem" }}
        />
        <button type="submit" className="btn btn-primary">
          Search
        </button>
      </form>

      {query && (
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "0.875rem",
            marginBottom: "1rem",
          }}
        >
          {hits.length === 0
            ? "No matches."
            : `${hits.length} ${hits.length === 1 ? "match" : "matches"} for “${query}”`}
        </p>
      )}

      <div style={{ display: "grid", gap: "0.6rem", maxWidth: "52rem" }}>
        {hits.map((hit) => (
          <Link
            key={hit.id}
            href={`/codex/entry/${hit.slug}`}
            className="card"
            style={{
              display: "block",
              padding: "0.9rem 1.1rem",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "0.5rem",
                flexWrap: "wrap",
              }}
            >
              <span aria-hidden="true">{kindIcon(hit.kind)}</span>
              <span className="font-display" style={{ fontWeight: 600 }}>
                {hit.name}
              </span>
              <span
                style={{
                  fontSize: "0.6875rem",
                  color: "var(--text-faint)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {KIND_BY_KEY[hit.kind]?.singular ?? hit.kind}
              </span>
              {hit.visibility === "secret" && (
                <span className="chip chip-secret">secret</span>
              )}
            </div>

            {hit.summary && (
              <p
                style={{
                  fontSize: "0.875rem",
                  color: "var(--text-muted)",
                  marginTop: "0.3rem",
                }}
              >
                {hit.summary}
              </p>
            )}

            {hit.snippet && (
              <p
                className="prose-codex"
                style={{
                  fontSize: "0.875rem",
                  color: "var(--text-faint)",
                  marginTop: "0.4rem",
                  lineHeight: 1.5,
                }}
                // ts_headline output: Postgres escapes the text and only ever
                // inserts the <mark> tags we asked for.
                dangerouslySetInnerHTML={{ __html: hit.snippet }}
              />
            )}
          </Link>
        ))}
      </div>
    </>
  );
}
