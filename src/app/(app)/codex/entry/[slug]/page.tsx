import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { Eye, EyeOff, Pencil, Sparkles } from "lucide-react";
import { CardGrid, EntryCard } from "@/components/entry-card";
import { Eyebrow } from "@/components/shared/eyebrow";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import {
  getBacklinks,
  getChildren,
  getEntryBySlug,
  getOutgoingLinks,
  getParent,
  getUnlinkedMentions,
  getWikiLinkResolver,
} from "@/lib/entries";
import { KIND_BY_KEY } from "@/lib/kinds";
import { extractHeadings, renderMarkdown } from "@/lib/markdown";
import { parseAliases } from "@/lib/links";
import { KIND_ICONS } from "@/lib/section-icons";
import { ArchiveButton } from "./archive-button";

type Params = { slug: string };

/** Left padding per heading depth in the "On this page" outline (levels 1 to 3). */
const OUTLINE_INDENT = ["pl-0", "pl-3", "pl-6"] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) return { title: "Codex" };
  const entry = await getEntryBySlug(user, slug);
  return { title: entry?.name ?? "Not found" };
}

export default async function EntryPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/welcome");

  const entry = await getEntryBySlug(user, slug);
  if (!entry) notFound();

  const isDM = user.role === "dm";
  const def = KIND_BY_KEY[entry.kind];
  const KindIcon = KIND_ICONS[entry.kind] ?? Sparkles;

  const [backlinks, outgoing, children, parent, resolve, unlinked] = await Promise.all([
    getBacklinks(user, entry.id),
    getOutgoingLinks(user, entry.id),
    getChildren(user, entry.id),
    getParent(user, entry.parentId),
    // Lets `[[Wiki Links]]` in the body resolve to pages this user can open.
    getWikiLinkResolver(user),
    user.role === "dm" ? getUnlinkedMentions(user, entry) : Promise.resolve([]),
  ]);
  const aliases = parseAliases(entry.fields);
  // The DM gets Obsidian's split: explicit links here, names-without-links in
  // "Unlinked mentions". Players have no unlinked panel, so they see both kinds.
  const linkedBacklinks = isDM ? backlinks.filter((b) => b.relation !== "named") : backlinks;
  // An outline only earns its space on a page long enough to need one.
  const outline = extractHeadings(entry.body ?? "").filter((h) => h.level <= 3);
  const outlineBase = outline.length ? Math.min(...outline.map((o) => o.level)) : 0;

  const bodyHtml = renderMarkdown(entry.body, resolve);
  const dmHtml = isDM && entry.dmNotes ? renderMarkdown(entry.dmNotes, resolve) : "";

  const fieldDefs = def?.fields ?? [];
  const shownFields = fieldDefs
    .map((f) => ({ ...f, value: entry.fields?.[f.key] }))
    .filter((f) => f.value);
  // Anything imported that the kind doesn't define a field for is still shown,
  // so no property from Notion silently disappears.
  const knownKeys = new Set(fieldDefs.map((f) => f.key));
  const extraFields = Object.entries(entry.fields ?? {}).filter(
    ([k, v]) => v && !knownKeys.has(k) && k !== "description" && k !== "aliases",
  );

  return (
    <article className="max-w-6xl">
      {/* ---- Breadcrumb ---- */}
      <Breadcrumb aria-label="Breadcrumb" className="no-print mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/codex/${def?.slug ?? "notes"}`}>{def?.label ?? entry.kind}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          {parent && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href={`/codex/entry/${parent.slug}`}>{parent.name}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
            </>
          )}
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{entry.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* ---- Header ---- */}
      <header className="mb-6">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-[min(18rem,100%)] flex-1">
            <h1 className="font-display flex flex-wrap items-center gap-3 text-[clamp(1.75rem,1.2rem+1.8vw,2.5rem)] font-bold leading-tight tracking-tight">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-gold">
                <KindIcon aria-hidden="true" className="size-5" />
              </span>
              {entry.name}
            </h1>
            {aliases.length > 0 && (
              <p className="mt-1 text-sm text-faint-foreground">Also known as {aliases.join(", ")}</p>
            )}
            {entry.summary && (
              <p className="mt-2 max-w-3xl text-base leading-relaxed text-muted-foreground">{entry.summary}</p>
            )}
          </div>

          {isDM && (
            <div className="no-print flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href={`/codex/entry/${entry.slug}/edit`} data-shortcut="edit" title="Edit (e)">
                  <Pencil aria-hidden="true" />
                  Edit
                </Link>
              </Button>
              <ArchiveButton entryId={entry.id} name={entry.name} />
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1">
          {entry.visibility === "secret" && (
            <Badge variant="outline" className="border-secret/45 bg-secret/10 text-secret">
              <EyeOff aria-hidden="true" />
              DM only: hidden from players
            </Badge>
          )}
          {entry.visibility === "revealed" && (
            <Badge variant="outline">
              <Eye aria-hidden="true" />
              revealed to players
            </Badge>
          )}
          {entry.tags.map((t) => (
            <Link key={t} href={`/search?tag=${encodeURIComponent(t)}`} className={badgeVariants({ variant: "secondary" })}>
              {t}
            </Link>
          ))}
        </div>

        <div className="mt-5 h-px bg-linear-to-r from-transparent via-border to-transparent" />
      </header>

      <div className="grid gap-8 min-[1100px]:grid-cols-[minmax(0,1fr)_21rem] min-[1100px]:gap-10">
        <div className="min-w-0">
          {/* ---- Properties ---- */}
          {(shownFields.length > 0 || extraFields.length > 0) && (
            <Card size="sm" className="mb-6">
              <CardContent>
                <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-4">
                  {shownFields.map((f) => (
                    <div key={f.key}>
                      <dt>
                        <Eyebrow>{f.label}</Eyebrow>
                      </dt>
                      <dd className="mt-1 text-[15px] leading-normal">{f.value}</dd>
                    </div>
                  ))}
                  {extraFields.map(([k, v]) => (
                    <div key={k}>
                      <dt>
                        <Eyebrow>{k.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}</Eyebrow>
                      </dt>
                      <dd className="mt-1 text-[15px] leading-normal">{v}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          )}

          {/* ---- Body ---- */}
          {/* Generated text is labelled wherever it appears, so it is never
              mistaken for something you wrote. */}
          {entry.bodySource === "generated" && isDM && (
            <Alert role="note" className="mb-4 border-dashed">
              <Pencil aria-hidden="true" />
              <AlertDescription className="flex flex-wrap items-baseline gap-2">
                <span className="flex-1">
                  Written from this entry&rsquo;s properties, not by you. Edit it and it becomes yours.
                </span>
                <Link href={`/codex/entry/${entry.slug}/edit`} className="text-link underline-offset-4 hover:underline">
                  Rewrite →
                </Link>
              </AlertDescription>
            </Alert>
          )}

          {outline.length >= 3 && (
            <Card size="sm" className="no-print mb-5">
              <CardContent>
                <nav aria-label="On this page">
                  <Eyebrow className="mb-2">On this page</Eyebrow>
                  <ol className="grid gap-1 text-sm">
                    {outline.map((h) => (
                      <li key={h.id} className={OUTLINE_INDENT[Math.min(h.level - outlineBase, OUTLINE_INDENT.length - 1)]}>
                        <a href={`#${h.id}`} className="text-muted-foreground transition-colors hover:text-foreground">
                          {h.text}
                        </a>
                      </li>
                    ))}
                  </ol>
                </nav>
              </CardContent>
            </Card>
          )}

          {bodyHtml ? (
            <div className="prose-codex" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
          ) : (
            <p className="py-4 italic text-faint-foreground">
              {backlinks.length > 0
                ? "No description written yet, but this is referenced elsewhere; see the linked mentions."
                : "No description written yet."}
              {isDM && (
                <>
                  {" "}
                  <Link href={`/codex/entry/${entry.slug}/edit`} className="text-link not-italic underline-offset-4 hover:underline">
                    Add one →
                  </Link>
                </>
              )}
            </p>
          )}

          {/* ---- DM notes ---- */}
          {dmHtml && (
            <section className="mt-8 rounded-xl border border-secret/40 bg-secret/5 p-4">
              <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.07em] text-secret">
                <EyeOff aria-hidden="true" className="size-4" />
                DM Notes, never shown to players
              </h2>
              <div className="prose-codex" dangerouslySetInnerHTML={{ __html: dmHtml }} />
            </section>
          )}
        </div>

        {/* ---- Connections ---- */}
        <aside className="min-w-0">
          {children.length > 0 && (
            <Section title={`Within ${entry.name}`}>
              <CardGrid>
                {children.map((c) => (
                  <EntryCard key={c.id} slug={c.slug} name={c.name} kind={c.kind} summary={c.summary} />
                ))}
              </CardGrid>
            </Section>
          )}

          {outgoing.length > 0 && (
            <Section title="References">
              <CardGrid>
                {outgoing.map((c) => (
                  <EntryCard
                    key={`${c.id}-${c.relation}`}
                    slug={c.slug}
                    name={c.name}
                    kind={c.kind}
                    summary={c.summary}
                    relation={c.relation}
                  />
                ))}
              </CardGrid>
            </Section>
          )}

          {unlinked.length > 0 && (
            <Section title={`Unlinked mentions (${unlinked.length})`}>
              <p className="mb-3 text-[13px] text-muted-foreground">
                These pages name {entry.name} without linking it. Wrap the name in <code>[[ ]]</code> there to connect them.
              </p>
              <ul className="grid list-disc gap-1 pl-4">
                {unlinked.map((u) => (
                  <li key={u.id}>
                    <Link href={`/codex/entry/${u.slug}/edit`} className="text-link underline-offset-4 hover:underline">
                      {u.name}
                    </Link>{" "}
                    <span className="text-xs text-faint-foreground">{u.kind}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {linkedBacklinks.length > 0 && (
            <Section title={`Linked mentions (${linkedBacklinks.length})`}>
              <CardGrid>
                {linkedBacklinks.map((c) => (
                  <EntryCard
                    key={`${c.id}-${c.relation}`}
                    slug={c.slug}
                    name={c.name}
                    kind={c.kind}
                    summary={c.summary}
                    context={c.context}
                  />
                ))}
              </CardGrid>
            </Section>
          )}
        </aside>
      </div>

      {isDM && entry.sourcePath && (
        <p className="no-print mt-12 text-xs text-faint-foreground">
          Imported from <code>{entry.sourcePath}</code>
        </p>
      )}
    </article>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.07em] text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}
