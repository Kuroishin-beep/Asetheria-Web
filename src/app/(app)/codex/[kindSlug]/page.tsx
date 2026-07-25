import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { countEntries, listEntries, PAGE_SIZE } from "@/lib/entries";
import { SECTION_BY_SLUG } from "@/lib/kinds";
import {
  CardGrid,
  EmptyState,
  EntryCard,
  PageHeading,
} from "@/components/entry-card";
import { KindFilter } from "./kind-filter";

type Params = { kindSlug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { kindSlug } = await params;
  const def = SECTION_BY_SLUG[kindSlug];
  return { title: def?.label ?? "Codex" };
}

export default async function KindPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { kindSlug } = await params;
  const def = SECTION_BY_SLUG[kindSlug];
  if (!def) notFound();

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const total = await countEntries(user.role, {
    kind: def.kind,
    tier: def.tier,
  });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Clamp rather than 404: a stale bookmark should land on a real page.
  const requested = Number((await searchParams).page);
  const page = Math.min(
    Math.max(1, Number.isFinite(requested) ? Math.trunc(requested) : 1),
    pageCount,
  );

  const rows = await listEntries(user.role, {
    kind: def.kind,
    tier: def.tier,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  return (
    <>
      <PageHeading
        icon={def.icon}
        title={def.label}
        blurb={def.blurb}
        action={
          user.role === "dm" ? (
            <Link
              href={`/codex/new?kind=${def.kind}`}
              className="btn btn-primary"
            >
              + New {def.singular}
            </Link>
          ) : null
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title={`No ${def.label.toLowerCase()} yet`}
          hint={
            user.role === "dm"
              ? "Create the first one — it'll show up here and in search."
              : "Nothing here has been revealed to the party."
          }
          action={
            user.role === "dm" ? (
              <Link
                href={`/codex/new?kind=${def.kind}`}
                className="btn btn-primary"
              >
                + New {def.singular}
              </Link>
            ) : null
          }
        />
      ) : (
        <KindFilter
          total={total}
          noun={def.label.toLowerCase()}
          page={page}
          pageCount={pageCount}
          basePath={`/codex/${kindSlug}`}
          items={rows.map((e) => ({
            id: e.id,
            slug: e.slug,
            name: e.name,
            kind: e.kind,
            summary: e.summary,
            tags: e.tags,
            visibility: e.visibility,
            // Values are searched client-side so filtering feels instant.
            haystack: [e.name, e.summary, ...e.tags, ...Object.values(e.fields ?? {})]
              .join(" ")
              .toLowerCase(),
          }))}
        />
      )}
    </>
  );
}
