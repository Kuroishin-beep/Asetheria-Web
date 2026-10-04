import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { EmptyState, PageHeading } from "@/components/entry-card";
import { KindListSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { countEntries, listEntries, PAGE_SIZE } from "@/lib/entries";
import { KIND_BY_KEY, LEGACY_SECTION_SLUGS, SECTION_BY_SLUG, type SectionDef } from "@/lib/kinds";
import { iconForSection } from "@/lib/section-icons";
import type { SessionUser } from "@/lib/session";
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

function NewEntryButton({ def }: { def: SectionDef }) {
  return (
    <Button asChild>
      <Link href={`/codex/new?kind=${def.kind}`}>
        <Plus aria-hidden="true" />
        New {def.singular}
      </Link>
    </Button>
  );
}

export default async function KindPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { kindSlug } = await params;
  const moved = LEGACY_SECTION_SLUGS[kindSlug];
  if (moved) redirect(`/codex/${moved}`);
  const def = SECTION_BY_SLUG[kindSlug];
  if (!def) notFound();

  const user = await getCurrentUser();
  if (!user) redirect("/welcome");

  const requested = Number((await searchParams).page);

  // Everything that can 404 or redirect has run above, so the status line is
  // already right; only the list itself streams in behind its skeleton.
  return (
    <>
      <PageHeading
        Icon={iconForSection(def.slug, def.kind)}
        title={def.label}
        blurb={def.blurb}
        action={user.role === "dm" ? <NewEntryButton def={def} /> : null}
      />
      <Suspense fallback={<KindListSkeleton />}>
        <KindList user={user} def={def} requested={requested} />
      </Suspense>
    </>
  );
}

async function KindList({
  user,
  def,
  requested,
}: {
  user: SessionUser;
  def: SectionDef;
  requested: number;
}) {
  const total = await countEntries(user, { kind: def.kind, tier: def.tier });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Clamp rather than 404: a stale bookmark should land on a real page.
  const page = Math.min(
    Math.max(1, Number.isFinite(requested) ? Math.trunc(requested) : 1),
    pageCount,
  );

  const rows = await listEntries(user, {
    kind: def.kind,
    tier: def.tier,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  if (rows.length === 0) {
    return (
      <EmptyState
        Icon={iconForSection(def.slug, def.kind)}
        title={`No ${def.label.toLowerCase()} yet`}
        hint={
          user.role === "dm"
            ? "Create the first one. It will show up here and in search."
            : "Nothing here has been revealed to the party."
        }
        action={user.role === "dm" ? <NewEntryButton def={def} /> : null}
      />
    );
  }

  return (
    <KindFilter
      total={total}
      noun={def.label.toLowerCase()}
      fieldDefs={KIND_BY_KEY[def.kind].fields.map((f) => ({ key: f.key, label: f.label }))}
      page={page}
      pageCount={pageCount}
      basePath={`/codex/${def.slug}`}
      items={rows.map((e) => ({
        id: e.id,
        slug: e.slug,
        name: e.name,
        kind: e.kind,
        summary: e.summary,
        tags: e.tags,
        visibility: e.visibility,
        fields: e.fields ?? {},
        // Values are searched client-side so filtering feels instant.
        haystack: [e.name, e.summary, ...e.tags, ...Object.values(e.fields ?? {})]
          .join(" ")
          .toLowerCase(),
      }))}
    />
  );
}
