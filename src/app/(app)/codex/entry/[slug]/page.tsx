import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/db";
import { entries } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import {
  getBacklinks,
  getChildren,
  getEntryBySlug,
  getOutgoingLinks,
  getParent,
} from "@/lib/entries";
import { KIND_BY_KEY, kindIcon } from "@/lib/kinds";
import { renderMarkdown } from "@/lib/markdown";
import { normalizeName } from "@/lib/links";
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
  const entry = await getEntryBySlug(user.role, slug);
  return { title: entry?.name ?? "Not found" };
}

export default async function EntryPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const entry = await getEntryBySlug(user.role, slug);
  if (!entry) notFound();

  const isDM = user.role === "dm";
  const def = KIND_BY_KEY[entry.kind];

  const [backlinks, outgoing, children, parent, nameRows] = await Promise.all([
    getBacklinks(user.role, entry.id),
    getOutgoingLinks(user.role, entry.id),
    getChildren(user.role, entry.id),
    getParent(user.role, entry.parentId),
    db.select({ name: entries.name, slug: entries.slug }).from(entries),
  ]);

  // Lets `[[Wiki Links]]` in the body resolve to real pages while rendering.
  const nameIndex = new Map(nameRows.map((r) => [normalizeName(r.name), r.slug]));
  const resolve = (name: string) => {
    const hit = nameIndex.get(normalizeName(name));
    return hit ? { slug: hit } : null;
  };

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
    ([k, v]) => v && !knownKeys.has(k) && k !== "description",
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
              <Link href={`/codex/entry/${entry.slug}/edit`} className="btn">
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

          {backlinks.length > 0 && (
            <Section title={`Linked mentions (${backlinks.length})`}>
              <CardGrid>
                {backlinks.map((c) => (
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
