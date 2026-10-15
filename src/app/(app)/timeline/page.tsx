import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Hourglass, Plus } from "lucide-react";
import { EmptyState, PageHeading } from "@/components/entry-card";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { getCurrentUser } from "@/lib/auth";
import { getCalendar } from "@/lib/calendar-store";
import { formatEventWhen } from "@/lib/events";
import { KIND_BY_KEY } from "@/lib/kinds";
import { getTimeline, parseTimelineFilters } from "@/lib/timeline";

export const metadata: Metadata = { title: "Timeline" };

export default async function TimelinePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/welcome");
  const isDM = user.role === "dm";

  const cal = await getCalendar();
  const filters = parseTimelineFilters(await searchParams);
  const timeline = await getTimeline(user, cal?.config ?? null, filters);
  const filtered = Boolean(filters.era || filters.tag || filters.kind || filters.from !== null || filters.to !== null);
  const newEvent = isDM ? (
    <Button asChild>
      <Link href="/codex/new?kind=event">
        <Plus aria-hidden="true" />
        New event
      </Link>
    </Button>
  ) : undefined;

  return (
    <div className="max-w-4xl">
      <PageHeading Icon={Hourglass} title="Timeline" blurb="What happened in Asetheria, and when, in the order it happened." action={newEvent} />

      {timeline.needsCalendar && isDM && (
        <p role="note" className="mb-4 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
          Events can only be put in order once the calendar is set up.{" "}
          <Link href="/calendar/setup" className="text-link underline-offset-4 hover:underline">
            Set up the calendar
          </Link>
        </p>
      )}

      {timeline.total === 0 ? (
        <EmptyState
          Icon={Hourglass}
          title="No events yet"
          hint={isDM ? "Add the first event of your world's history. Dating it uses the calendar." : "Nothing has been revealed to you on the timeline yet."}
          action={newEvent}
        />
      ) : (
        <>
          <Card className="mb-6" size="sm">
            <CardContent>
              <form method="get" action="/timeline" className="flex flex-wrap items-end gap-3" aria-label="Filter the timeline">
                <div className="grid gap-1">
                  <Label htmlFor="tl-era">Era</Label>
                  <NativeSelect id="tl-era" name="era" defaultValue={filters.era}>
                    <NativeSelectOption value="">All eras</NativeSelectOption>
                    {timeline.facets.eras.map((f) => (
                      <NativeSelectOption key={f.value} value={f.value}>
                        {f.value} ({f.count})
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="tl-tag">Tag</Label>
                  <NativeSelect id="tl-tag" name="tag" defaultValue={filters.tag}>
                    <NativeSelectOption value="">Any tag</NativeSelectOption>
                    {timeline.facets.tags.map((f) => (
                      <NativeSelectOption key={f.value} value={f.value}>
                        {f.value} ({f.count})
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="tl-kind">Involves</Label>
                  <NativeSelect id="tl-kind" name="kind" defaultValue={filters.kind}>
                    <NativeSelectOption value="">Any kind of page</NativeSelectOption>
                    {timeline.facets.kinds.map((f) => (
                      <NativeSelectOption key={f.value} value={f.value}>
                        {KIND_BY_KEY[f.value as keyof typeof KIND_BY_KEY]?.label ?? f.value} ({f.count})
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="tl-from">From year</Label>
                  <Input id="tl-from" name="from" inputMode="numeric" defaultValue={filters.from ?? ""} className="w-28" />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="tl-to">To year</Label>
                  <Input id="tl-to" name="to" inputMode="numeric" defaultValue={filters.to ?? ""} className="w-28" />
                </div>
                <Button type="submit" variant="secondary" size="sm">
                  Filter
                </Button>
                {filtered && (
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/timeline">Clear filters</Link>
                  </Button>
                )}
              </form>
            </CardContent>
          </Card>

          <p role="status" className="mb-4 text-sm text-muted-foreground" data-testid="timeline-count">
            {timeline.shown} of {timeline.total} {timeline.total === 1 ? "event" : "events"}
          </p>

          {timeline.shown === 0 ? (
            <EmptyState
              Icon={Hourglass}
              title="No events match those filters"
              hint="Try another era, tag, kind of page or range of years, or clear the filters."
              action={
                <Button asChild variant="outline">
                  <Link href="/timeline">Clear filters</Link>
                </Button>
              }
            />
          ) : (
            <div className="grid gap-8">
              {timeline.groups.map((g, gi) => (
                <section key={g.era} aria-labelledby={`era-${gi}`} data-testid="timeline-era">
                  <h2 id={`era-${gi}`} className="font-display mb-3 text-xl font-bold tracking-tight">
                    {g.era}
                  </h2>
                  <ol className="grid gap-3 border-l border-border pl-5">
                    {g.events.map((e) => (
                      <li key={e.id} className="relative" data-testid="timeline-event">
                        <span aria-hidden="true" className="absolute -left-[1.6rem] top-2 size-2.5 rounded-full bg-gold" />
                        <p className="text-sm font-medium text-muted-foreground" data-testid="timeline-when">
                          {cal ? formatEventWhen(cal.config, e.dates) : "Undated"}
                        </p>
                        <p className="text-lg font-semibold leading-snug">
                          <Link href={`/codex/entry/${e.slug}`} className="text-link underline-offset-4 hover:underline">
                            {e.name}
                          </Link>
                        </p>
                        {e.summary && <p className="mt-1 max-w-3xl text-[15px] leading-relaxed text-muted-foreground">{e.summary}</p>}
                        {(e.tags.length > 0 || e.linked.length > 0) && (
                          <div className="mt-2 flex flex-wrap items-center gap-1">
                            {e.linked.map((p) => (
                              <Link key={p.slug} href={`/codex/entry/${p.slug}`} className={badgeVariants({ variant: "outline" })} data-testid="timeline-linked">
                                {p.name}
                              </Link>
                            ))}
                            {e.tags.map((t) => (
                              <Badge key={t} variant="secondary">
                                {t}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
