import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Search as SearchIcon, SearchX, Tag } from "lucide-react";
import { CardGrid, EmptyState, EntryCard, PageHeading } from "@/components/entry-card";
import { StaggerContainer } from "@/components/motion/stagger-container";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getCurrentUser } from "@/lib/auth";
import { listEntries, searchEntries } from "@/lib/entries";
import { KIND_BY_KEY } from "@/lib/kinds";
import { KIND_ICONS } from "@/lib/section-icons";

export const metadata: Metadata = { title: "Search" };

const TAG_RESULT_LIMIT = 500;
const SEARCH_RESULT_LIMIT = 60;

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
    const rows = await listEntries(user, { tag, limit: TAG_RESULT_LIMIT });
    return (
      <>
        <PageHeading
          Icon={Tag}
          title={`Tagged “${tag}”`}
          blurb={`${rows.length} ${rows.length === 1 ? "entry" : "entries"}`}
        />
        {rows.length === 0 ? (
          <EmptyState
            Icon={SearchX}
            title="Nothing carries that tag"
            hint="The tag may have been renamed, or the entries are not visible to you."
            action={
              <Button asChild variant="outline">
                <Link href="/search">Search the codex</Link>
              </Button>
            }
          />
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
  const hits = query ? await searchEntries(user, query, SEARCH_RESULT_LIMIT) : [];

  return (
    <>
      <PageHeading
        Icon={SearchIcon}
        title="Search"
        blurb="Looks through names, summaries, tags, and the full text of every entry."
      />

      <form action="/search" method="get" className="no-print mb-8 flex max-w-xl gap-3">
        <Input
          name="q"
          defaultValue={query}
          placeholder="Search the codex…"
          aria-label="Search query"
          autoFocus
        />
        <Button type="submit">
          <SearchIcon aria-hidden="true" />
          Search
        </Button>
      </form>

      {query && hits.length > 0 && (
        <p className="mb-4 text-sm text-muted-foreground">
          {hits.length} {hits.length === 1 ? "match" : "matches"} for “{query}”
        </p>
      )}

      {query && hits.length === 0 && (
        <EmptyState
          Icon={SearchX}
          title="No matches"
          hint="Try fewer words, a different spelling, or browse by section from the sidebar."
        />
      )}

      <StaggerContainer className="grid max-w-3xl gap-2">
        {hits.map((hit) => {
          const Icon = KIND_ICONS[hit.kind];
          return (
            <Link
              key={hit.id}
              href={`/codex/entry/${hit.slug}`}
              className="group block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Card
                size="sm"
                className="gap-1 transition-all duration-150 group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:ring-primary/40"
              >
                <CardContent className="grid gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Icon aria-hidden="true" className="size-4 text-gold" />
                    <span className="font-semibold tracking-tight">{hit.name}</span>
                    <span className="text-[11px] uppercase tracking-[0.06em] text-faint-foreground">
                      {KIND_BY_KEY[hit.kind]?.singular ?? hit.kind}
                    </span>
                    {hit.visibility === "secret" && (
                      <Badge variant="outline" className="border-secret/45 bg-secret/10 text-secret">
                        secret
                      </Badge>
                    )}
                  </div>

                  {hit.summary && <p className="text-sm text-muted-foreground">{hit.summary}</p>}

                  {hit.snippet && (
                    <p
                      className="prose-codex text-sm leading-normal text-faint-foreground"
                      // Escaped in searchEntries(); only <mark> tags survive.
                      dangerouslySetInnerHTML={{ __html: hit.snippet }}
                    />
                  )}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </StaggerContainer>
    </>
  );
}
