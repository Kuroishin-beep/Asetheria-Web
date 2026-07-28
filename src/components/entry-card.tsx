import Link from "next/link";
import { kindIcon } from "@/lib/kinds";
import type { EntryKind } from "@/db/schema";

export function EntryCard({
  slug,
  name,
  kind,
  summary,
  tags,
  visibility,
  relation,
  context,
}: {
  slug: string;
  name: string;
  kind: EntryKind;
  summary?: string;
  tags?: string[];
  visibility?: string;
  relation?: string;
  /** Quoted sentence from the linking entry, shown instead of the summary. */
  context?: string | null;
}) {
  return (
    <Link
      href={`/codex/entry/${slug}`}
      className="card"
      style={{
        display: "block",
        padding: "0.85rem 1rem",
        textDecoration: "none",
        color: "inherit",
        transition: "border-color 0.15s, transform 0.08s",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "0.55rem",
          marginBottom: summary ? "0.3rem" : 0,
        }}
      >
        <span aria-hidden="true" style={{ flexShrink: 0 }}>
          {kindIcon(kind)}
        </span>
        <span
          className="font-display"
          style={{ fontWeight: 600, flex: 1, minWidth: 0, lineHeight: 1.35 }}
        >
          {name}
        </span>
        {visibility === "secret" && (
          <span className="chip chip-secret" style={{ flexShrink: 0 }}>
            secret
          </span>
        )}
      </div>

      {relation && (
        <p
          style={{
            fontSize: "0.6875rem",
            color: "var(--text-faint)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: "0.25rem",
          }}
        >
          {relation.replace(/-/g, " ")}
        </p>
      )}

      {/* A quoted mention is more useful than a generic summary — it says what
          the other page actually claims about this entry. */}
      {context ? (
        <p
          style={{
            fontSize: "0.8125rem",
            color: "var(--text-muted)",
            lineHeight: 1.5,
            fontFamily: "var(--font-prose)",
            fontStyle: "italic",
            borderLeft: "2px solid var(--border)",
            paddingLeft: "0.6rem",
          }}
        >
          “{context}”
        </p>
      ) : (
        summary && (
          <p
            style={{
              fontSize: "0.8125rem",
              color: "var(--text-muted)",
              lineHeight: 1.5,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {summary}
          </p>
        )
      )}

      {tags && tags.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: "0.35rem",
            flexWrap: "wrap",
            marginTop: "0.5rem",
          }}
        >
          {tags.slice(0, 4).map((t) => (
            <span key={t} className="chip">
              {t}
            </span>
          ))}
          {tags.length > 4 && (
            <span className="chip">+{tags.length - 4}</span>
          )}
        </div>
      )}
    </Link>
  );
}

export function PageHeading({
  icon,
  title,
  blurb,
  action,
}: {
  icon?: string;
  title: string;
  blurb?: string;
  action?: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: "min(16rem, 100%)" }}>
          <h1
            className="font-display"
            style={{
              fontSize: "clamp(1.4rem, 1.1rem + 1.2vw, 1.9rem)",
              fontWeight: 700,
              lineHeight: 1.2,
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
            }}
          >
            {icon && <span aria-hidden="true">{icon}</span>}
            {title}
          </h1>
          {blurb && (
            <p
              style={{
                color: "var(--text-muted)",
                marginTop: "0.4rem",
                fontSize: "0.9375rem",
              }}
            >
              {blurb}
            </p>
          )}
        </div>
        {action && <div className="no-print">{action}</div>}
      </div>
      <div className="rule-fade" style={{ marginTop: "1rem" }} />
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="card"
      style={{ padding: "3rem 1.5rem", textAlign: "center" }}
    >
      <p aria-hidden="true" style={{ fontSize: "1.75rem", opacity: 0.4 }}>
        ✦
      </p>
      <p style={{ fontWeight: 600, marginTop: "0.75rem" }}>{title}</p>
      {hint && (
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "0.875rem",
            marginTop: "0.35rem",
          }}
        >
          {hint}
        </p>
      )}
      {action && <div style={{ marginTop: "1.25rem" }}>{action}</div>}
    </div>
  );
}

/** Responsive auto-fitting grid used by every listing page. */
export function CardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gap: "0.75rem",
        gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 17rem), 1fr))",
      }}
    >
      {children}
    </div>
  );
}
