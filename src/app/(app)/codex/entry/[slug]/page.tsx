import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
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
import { KIND_BY_KEY, kindIcon } from "@/lib/kinds";
import { extractHeadings, renderMarkdown } from "@/lib/markdown";
import { parseAliases } from "@/lib/links";
import { CardGrid, EntryCard } from "@/components/entry-card";
import { ArchiveButton } from "./archive-button";

type Params = { slug: string };

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

  const bodyHtml = renderMarkdown(entry.body, resolve);
  const dmHtml = isDM && entry.dmNotes ? renderMarkdown(entry.dmNotes, resolve) : "";

  const fieldDefs = def?.fields ?? [];
  const shownFields = fieldDefs
    .map((f) => ({ ...f, value: entry.fields?.[f.key] }))
    .filter((f) => f.value);
  // Anything imported that the kind doesn't define a field for — still shown,
  // so no property from Notion silently disappears.
  const knownKeys = new Set(fieldDefs.map((f) => f.key));
  const extraFields = Object.entries(entry.fields ?? {}).filter(
    ([k, v]) => v && !knownKeys.has(k) && k !== "description" && k !== "aliases",
  );

  return (
    <article style={{ maxWidth: "72rem" }}>
      {/* ---- Breadcrumb ---- */}
      <nav
        aria-label="Breadcrumb"
        className="no-print"
        style={{
          display: "flex",
          gap: "0.4rem",
          alignItems: "center",
          flexWrap: "wrap",
          fontSize: "0.8125rem",
          color: "var(--text-muted)",
          marginBottom: "1rem",
        }}
      >
        <Link href={`/codex/${def?.slug ?? "notes"}`} style={{ color: "inherit" }}>
          {def?.label ?? entry.kind}
        </Link>
        {parent && (
          <>
            <span aria-hidden="true">›</span>
            <Link href={`/codex/entry/${parent.slug}`} style={{ color: "inherit" }}>
              {parent.name}
            </Link>
          </>
        )}
        <span aria-hidden="true">›</span>
        <span style={{ color: "var(--text)" }}>{entry.name}</span>
      </nav>

      {/* ---- Header ---- */}
      <header style={{ marginBottom: "1.5rem" }}>
        <div
          style={{
            display: "flex",
            gap: "1rem",
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: "min(18rem, 100%)" }}>
            <h1
              className="font-display"
              style={{
                fontSize: "clamp(1.6rem, 1.2rem + 1.8vw, 2.4rem)",
                fontWeight: 700,
                lineHeight: 1.15,
                display: "flex",
                gap: "0.6rem",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <span aria-hidden="true">{kindIcon(entry.kind)}</span>
              {entry.name}
            </h1>
            {aliases.length > 0 && (
              <p style={{ color: "var(--text-faint)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
                Also known as {aliases.join(", ")}
              </p>
            )}
            {entry.summary && (
              <p
                style={{
                  color: "var(--text-muted)",
                  marginTop: "0.5rem",
                  fontSize: "1rem",
                  lineHeight: 1.6,
                  maxWidth: "48rem",
                }}
              >
                {entry.summary}
              </p>
            )}
          </div>

          {isDM && (
            <div
              className="no-print"
              style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
            >
              <Link href={`/codex/entry/${entry.slug}/edit`} className="btn" data-shortcut="edit" title="Edit (e)">
                ✎ Edit
              </Link>
              <ArchiveButton entryId={entry.id} name={entry.name} />
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            gap: "0.4rem",
            flexWrap: "wrap",
            marginTop: "0.9rem",
            alignItems: "center",
          }}
        >
          {entry.visibility === "secret" && (
            <span className="chip chip-secret">⊘ DM only — hidden from players</span>
          )}
          {entry.visibility === "revealed" && (
            <span className="chip">◈ revealed to players</span>
          )}
          {entry.tags.map((t) => (
            <Link
              key={t}
              href={`/search?tag=${encodeURIComponent(t)}`}
              className="chip"
            >
              {t}
            </Link>
          ))}
        </div>

        <div className="rule-fade" style={{ marginTop: "1.25rem" }} />
      </header>

      <div
        style={{
          display: "grid",
          gap: "2rem",
          gridTemplateColumns: "minmax(0, 1fr)",
        }}
        className="entry-layout"
      >
        <div style={{ minWidth: 0 }}>
          {/* ---- Properties ---- */}
          {(shownFields.length > 0 || extraFields.length > 0) && (
            <dl
              className="card"
              style={{
                padding: "1rem 1.15rem",
                marginBottom: "1.75rem",
                display: "grid",
                gap: "0.7rem",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(min(100%, 12rem), 1fr))",
              }}
            >
              {shownFields.map((f) => (
                <div key={f.key}>
                  <dt className="label" style={{ marginBottom: "0.15rem" }}>
                    {f.label}
                  </dt>
                  <dd style={{ fontSize: "0.9375rem", lineHeight: 1.5 }}>
                    {f.value}
                  </dd>
                </div>
              ))}
              {extraFields.map(([k, v]) => (
                <div key={k}>
                  <dt className="label" style={{ marginBottom: "0.15rem" }}>
                    {k.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}
                  </dt>
                  <dd style={{ fontSize: "0.9375rem", lineHeight: 1.5 }}>{v}</dd>
                </div>
              ))}
            </dl>
          )}

          {/* ---- Body ---- */}
          {/* Generated text is labelled wherever it appears, so it is never
              mistaken for something you wrote. */}
          {entry.bodySource === "generated" && isDM && (
            <p
              style={{
                display: "flex",
                gap: "0.5rem",
                alignItems: "baseline",
                flexWrap: "wrap",
                fontSize: "0.8125rem",
                color: "var(--text-muted)",
                border: "1px dashed var(--border)",
                borderRadius: 8,
                padding: "0.6rem 0.85rem",
                marginBottom: "1rem",
              }}
            >
              <span aria-hidden="true">✎</span>
              <span style={{ flex: 1, minWidth: "14rem" }}>
                Written from this entry&rsquo;s properties, not by you. Edit it
                and it becomes yours.
              </span>
              <Link href={`/codex/entry/${entry.slug}/edit`}>Rewrite →</Link>
            </p>
          )}

          {outline.length >= 3 && (
            <nav
              aria-label="On this page"
              className="no-print card"
              style={{ padding: "0.75rem 1rem", marginBottom: "1.25rem", fontSize: "0.875rem" }}
            >
              <p className="label" style={{ marginBottom: "0.4rem" }}>
                On this page
              </p>
              <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.2rem" }}>
                {outline.map((h) => (
                  <li key={h.id} style={{ paddingLeft: `${(h.level - Math.min(...outline.map((o) => o.level))) * 0.9}rem` }}>
                    <a href={`#${h.id}`}>{h.text}</a>
                  </li>
                ))}
              </ol>
            </nav>
          )}

          {bodyHtml ? (
            <div
              className="prose-codex"
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
          ) : (
            <p
              style={{
                color: "var(--text-faint)",
                fontStyle: "italic",
                padding: "1rem 0",
              }}
            >
              {backlinks.length > 0
                ? "No description written yet — but this is referenced elsewhere; see the linked mentions below."
                : "No description written yet."}
              {isDM && (
                <>
                  {" "}
                  <Link href={`/codex/entry/${entry.slug}/edit`}>Add one →</Link>
                </>
              )}
            </p>
          )}

          {/* ---- DM notes ---- */}
          {dmHtml && (
            <section
              style={{
                marginTop: "2rem",
                border: "1px solid color-mix(in srgb, var(--secret) 40%, transparent)",
                background: "color-mix(in srgb, var(--secret) 7%, transparent)",
                borderRadius: 10,
                padding: "1rem 1.15rem",
              }}
            >
              <h2
                className="label"
                style={{ color: "var(--secret)", marginBottom: "0.6rem" }}
              >
                ⊘ DM Notes — never shown to players
              </h2>
              <div
                className="prose-codex"
                dangerouslySetInnerHTML={{ __html: dmHtml }}
              />
            </section>
          )}
        </div>

        {/* ---- Connections ---- */}
        <aside style={{ minWidth: 0 }}>
          {children.length > 0 && (
            <Section title={`Within ${entry.name}`}>
              <CardGrid>
                {children.map((c) => (
                  <EntryCard
                    key={c.id}
                    slug={c.slug}
                    name={c.name}
                    kind={c.kind}
                    summary={c.summary}
                  />
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
              <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "0.6rem" }}>
                These pages name {entry.name} without linking it. Wrap the name in{" "}
                <code>[[ ]]</code> there to connect them.
              </p>
              <ul style={{ margin: 0, paddingLeft: "1.1rem", display: "grid", gap: "0.25rem" }}>
                {unlinked.map((u) => (
                  <li key={u.id}>
                    <Link href={`/codex/entry/${u.slug}/edit`}>{u.name}</Link>{" "}
                    <span style={{ fontSize: "0.75rem", color: "var(--text-faint)" }}>{u.kind}</span>
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
        <p
          className="no-print"
          style={{
            marginTop: "3rem",
            fontSize: "0.75rem",
            color: "var(--text-faint)",
          }}
        >
          Imported from <code>{entry.sourcePath}</code>
        </p>
      )}
    </article>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: "2rem" }}>
      <h2 className="label" style={{ marginBottom: "0.6rem" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}
