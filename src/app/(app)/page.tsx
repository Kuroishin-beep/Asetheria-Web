import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { CardGrid, EntryCard, PageHeading } from "@/components/entry-card";
import { Prologue } from "@/components/prologue";
import { HomePageSkeleton } from "@/components/shared/skeletons";
import { Eyebrow } from "@/components/shared/eyebrow";
import { badgeVariants } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { EntryKind } from "@/db/schema";
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
import { iconForSection } from "@/lib/section-icons";
import type { SessionUser } from "@/lib/session";

/** How many entries a front-page strip shows before pointing at the full section. */
const STRIP_LIMIT = 12;
const MAX_TAGS_SHOWN = 40;

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
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-4">
      <h2 id={id}>
        <Eyebrow>{title}</Eyebrow>
      </h2>
      {href && (
        <Link href={href} className="inline-flex min-h-6 items-center gap-1 text-[13px] text-link underline-offset-4 hover:underline">
          {more}
          <ArrowRight aria-hidden="true" className="size-3" />
        </Link>
      )}
    </div>
  );
}

type StripEntry = {
  id: string;
  slug: string;
  name: string;
  kind: EntryKind;
  summary: string;
  tags: string[];
  visibility: string;
};

/** A titled strip of entry cards with an optional "N more" overflow link. */
function EntryStrip({
  id,
  title,
  href,
  more,
  entries,
  limit,
  overflowNoun,
}: {
  id: string;
  title: string;
  href: string;
  more: string;
  entries: StripEntry[];
  limit?: number;
  overflowNoun?: string;
}) {
  if (entries.length === 0) return null;
  const shown = limit ? entries.slice(0, limit) : entries;
  return (
    <section aria-labelledby={id} className="mb-10">
      <SectionHeading id={id} title={title} href={href} more={more} />
      <CardGrid>
        {shown.map((e) => (
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
      {limit && overflowNoun && entries.length > limit && (
        <p className="mt-3 text-[13px]">
          <Link href={href} className="inline-flex min-h-6 items-center text-link underline-offset-4 hover:underline">
            {entries.length - limit} more {overflowNoun} →
          </Link>
        </p>
      )}
    </section>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/welcome");

  return (
    <Suspense fallback={<HomePageSkeleton />}>
      <Dashboard user={user} />
    </Suspense>
  );
}

async function Dashboard({ user }: { user: SessionUser }) {
  const [counts, tierCounts, recent, tags, empires, lore, capitals, majorCities, towns] =
    await Promise.all([
      countByKind(user),
      countLocationsByTier(user),
      getRecentlyUpdated(user, 6),
      listAllTags(user),
      listEntriesBySlugs(user, STANDING_EMPIRE_SLUGS),
      listLoreWithContent(user, 6),
      listLocationsByTier(user, "capital"),
      listLocationsByTier(user, "city"),
      listLocationsByTier(user, "town"),
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

      <EntryStrip id="empires-heading" title="The Three Empires" href="/codex/empires" more="All empires" entries={empires} />
      <EntryStrip id="lore-heading" title="Lore of the Continent" href="/codex/lore" more="All lore" entries={lore} />
      <EntryStrip
        id="capitals-heading"
        title={`Capitals (${capitals.length})`}
        href="/codex/capitals"
        more="All capitals"
        entries={capitals}
      />
      <EntryStrip
        id="major-heading"
        title={`Major Cities (${majorCities.length})`}
        href="/codex/cities"
        more="All cities"
        entries={majorCities}
        limit={STRIP_LIMIT}
        overflowNoun="cities"
      />
      <EntryStrip
        id="towns-heading"
        title={`Towns (${towns.length})`}
        href="/codex/towns"
        more="All towns"
        entries={towns}
        limit={STRIP_LIMIT}
        overflowNoun="towns"
      />

      {/* ---- Section tiles ---- */}
      <section aria-labelledby="sections-heading" className="mb-10">
        <h2 id="sections-heading" className="mb-3">
          <Eyebrow>Browse</Eyebrow>
        </h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,11rem),1fr))] gap-3">
          {populated.map((k) => {
            const Icon = iconForSection(k.slug, k.kind);
            const count = sectionCount(k);
            return (
              <Link key={k.slug} href={`/codex/${k.slug}`} className="group rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                <Card
                  size="sm"
                  className="h-full gap-1 transition-all duration-150 group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:ring-primary/40"
                >
                  <div className="grid gap-1 px-4">
                    <Icon aria-hidden="true" className="size-5 text-gold" />
                    <span className="mt-2 font-semibold tracking-tight">{k.label}</span>
                    <span className="text-[13px] text-muted-foreground">
                      {count} {count === 1 ? "entry" : "entries"}
                    </span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ---- Recently touched ---- */}
      {recent.length > 0 && (
        <section aria-labelledby="recent-heading" className="mb-10">
          <h2 id="recent-heading" className="mb-3">
            <Eyebrow>Recently updated</Eyebrow>
          </h2>
          <CardGrid>
            {recent.map((e) => (
              <EntryCard key={e.id} slug={e.slug} name={e.name} kind={e.kind} summary={e.summary} />
            ))}
          </CardGrid>
        </section>
      )}

      {/* ---- Tag cloud ---- */}
      {tags.length > 0 && (
        <section aria-labelledby="tags-heading">
          <h2 id="tags-heading" className="mb-3">
            <Eyebrow>Tags</Eyebrow>
          </h2>
          <div className="flex flex-wrap gap-2">
            {tags.slice(0, MAX_TAGS_SHOWN).map((t) => (
              <Link
                key={t.tag}
                href={`/search?tag=${encodeURIComponent(t.tag)}`}
                className={badgeVariants({ variant: "secondary" })}
              >
                {t.tag}
                <span className="text-faint-foreground">{t.total}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
