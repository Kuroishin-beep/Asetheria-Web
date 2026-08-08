import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  countByKind,
  countLocationsByTier,
  getRecentlyUpdated,
  listAllTags,
  listEntriesBySlugs,
  listLocationsByTier,
  listLoreWithContent,
} from "@/lib/entries";
import { SECTIONS, STANDING_EMPIRE_SLUGS } from "@/lib/kinds";
import { CardGrid, EntryCard, PageHeading } from "@/components/entry-card";
import { Prologue } from "@/components/prologue";

/** Heading with an optional "see all" link, used by the front-page sections. */
function SectionHeading({
  id,
  title,
  href,
  more,
}: {
  id: string;
  title: string;
  href?: string;
  more?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: "1rem",
        flexWrap: "wrap",
      }}
    >
      <h2 id={id} className="label">
        {title}
      </h2>
      {href && (
        <Link href={href} style={{ fontSize: "0.8125rem" }}>
          {more} →
        </Link>
      )}
    </div>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/welcome");

  const [counts, tierCounts, recent, tags, empires, lore, capitals, majorCities, towns] =
    await Promise.all([
      countByKind(user.role),
      countLocationsByTier(user.role),
      getRecentlyUpdated(user.role, 6),
      listAllTags(user.role),
      listEntriesBySlugs(user.role, STANDING_EMPIRE_SLUGS),
      listLoreWithContent(user.role, 6),
      listLocationsByTier(user.role, "capital"),
      listLocationsByTier(user.role, "city"),
      listLocationsByTier(user.role, "town"),
    ]);

  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  const sectionCount = (s: (typeof SECTIONS)[number]) =>
    s.tier ? (tierCounts[s.tier] ?? 0) : (counts[s.kind] ?? 0);
  const populated = SECTIONS.filter((s) => sectionCount(s) > 0);

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

      {/* ---- The story so far ---- */}
      <Prologue />

      {/* ---- The three standing empires ---- */}
      {empires.length > 0 && (
        <section
          aria-labelledby="empires-heading"
          style={{ marginBottom: "2.5rem" }}
        >
          <SectionHeading
            id="empires-heading"
            title="The Three Empires"
            href="/codex/empires"
            more="All empires"
          />
          <CardGrid>
            {empires.map((e) => (
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
        </section>
      )}

      {/* ---- Lore of the Continent ---- */}
      {lore.length > 0 && (
        <section
          aria-labelledby="lore-heading"
          style={{ marginBottom: "2.5rem" }}
        >
          <SectionHeading
            id="lore-heading"
            title="Lore of the Continent"
            href="/codex/lore"
            more="All lore"
          />
          <CardGrid>
            {lore.map((e) => (
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
        </section>
      )}

      {/* ---- Capitals ---- */}
      {capitals.length > 0 && (
        <section
          aria-labelledby="capitals-heading"
          style={{ marginBottom: "2.5rem" }}
        >
          <SectionHeading
            id="capitals-heading"
            title={`Capitals (${capitals.length})`}
            href="/codex/capitals"
            more="All capitals"
          />
          <CardGrid>
            {capitals.map((e) => (
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
        </section>
      )}

      {/* ---- Major cities ---- */}
      {majorCities.length > 0 && (
        <section
          aria-labelledby="major-heading"
          style={{ marginBottom: "2.5rem" }}
        >
          <SectionHeading
            id="major-heading"
            title={`Major Cities (${majorCities.length})`}
            href="/codex/cities"
            more="All cities"
          />
          <CardGrid>
            {majorCities.slice(0, 12).map((e) => (
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
          {majorCities.length > 12 && (
            <p style={{ marginTop: "0.75rem", fontSize: "0.8125rem" }}>
              <Link href="/codex/cities">
                {majorCities.length - 12} more cities →
              </Link>
            </p>
          )}
        </section>
      )}

      {/* ---- Towns ---- */}
      {towns.length > 0 && (
        <section
          aria-labelledby="towns-heading"
          style={{ marginBottom: "2.5rem" }}
        >
          <SectionHeading
            id="towns-heading"
            title={`Towns (${towns.length})`}
            href="/codex/towns"
            more="All towns"
          />
          <CardGrid>
            {towns.slice(0, 12).map((e) => (
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
          {towns.length > 12 && (
            <p style={{ marginTop: "0.75rem", fontSize: "0.8125rem" }}>
              <Link href="/codex/towns">{towns.length - 12} more towns →</Link>
            </p>
          )}
        </section>
      )}

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
              key={k.slug}
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
                {sectionCount(k)} {sectionCount(k) === 1 ? "entry" : "entries"}
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
