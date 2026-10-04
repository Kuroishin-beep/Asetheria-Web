import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading placeholders shaped like the real screens (same grid, same card
 * heights) so nothing jumps when content arrives. Skeleton only, never a
 * spinner.
 *
 * Used inside <Suspense> boundaries, NOT as route-level `loading.tsx` files on
 * any route that can call notFound(): a `loading.tsx` makes Next stream the
 * shell before the page body runs, so a missing or hidden page would answer
 * HTTP 200 instead of 404 (verified: /codex/<unknown> returned 200 with one).
 * The access rules and the tests both depend on a real 404.
 */

export function PageHeadingSkeleton() {
  return (
    <div className="mb-6" aria-hidden="true">
      <div className="flex items-center gap-3">
        <Skeleton className="size-7 rounded-md" />
        <Skeleton className="h-8 w-56" />
      </div>
      <Skeleton className="mt-3 h-4 w-80 max-w-full" />
      <div className="mt-4 h-px bg-border" />
    </div>
  );
}

export function EntryCardSkeleton() {
  return (
    <Card size="sm" className="h-full gap-2" aria-hidden="true">
      <CardContent className="grid gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-md" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <div className="flex gap-1">
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </CardContent>
    </Card>
  );
}

export function CardGridSkeleton({ count = 9 }: { count?: number }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-3" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <EntryCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** The body of a codex section: filter row, tag chips, then the card grid. The heading is rendered outside. */
export function KindListSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading section">
      <div className="mb-4 flex items-center gap-3" aria-hidden="true">
        <Skeleton className="h-9 w-72 max-w-full" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="mb-6 flex flex-wrap gap-1" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-6 w-20 rounded-full" />
        ))}
      </div>
      <CardGridSkeleton />
    </div>
  );
}

/** The front page: heading, prologue card, then a strip of cards. */
export function HomePageSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading the codex">
      <PageHeadingSkeleton />
      <Card className="mb-10" aria-hidden="true">
        <CardContent className="grid gap-3">
          <Skeleton className="h-6 w-80 max-w-full" />
          <Skeleton className="h-4 w-48" />
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </CardContent>
      </Card>
      <Skeleton className="mb-3 h-4 w-32" aria-hidden="true" />
      <CardGridSkeleton count={3} />
    </div>
  );
}
