import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { EntryKind } from "@/db/schema";
import { StaggerContainer } from "@/components/motion/stagger-container";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { KIND_ICONS } from "@/lib/section-icons";
import { cn } from "@/lib/utils";

type IconComponent = ComponentType<{ className?: string }>;

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
  const Icon = KIND_ICONS[kind] ?? Sparkles;
  return (
    <Link
      href={`/codex/entry/${slug}`}
      className="group block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Card
        size="sm"
        className="h-full gap-2 transition-all duration-150 group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:ring-primary/40 group-active:translate-y-0 group-active:scale-[0.99]"
      >
        <CardHeader className="grid-cols-[auto_1fr_auto] items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-md bg-muted text-gold">
            <Icon aria-hidden="true" className="size-4" />
          </span>
          <span className="min-w-0 text-[15px] font-semibold leading-snug tracking-tight">{name}</span>
          {visibility === "secret" && (
            <Badge variant="outline" className="border-secret/45 bg-secret/10 text-secret">
              secret
            </Badge>
          )}
        </CardHeader>

        <CardContent className="grid gap-2">
          {relation && (
            <p className="text-[11px] uppercase tracking-[0.06em] text-faint-foreground">
              {relation.replace(/-/g, " ")}
            </p>
          )}

          {/* A quoted mention is more useful than a generic summary: it says
              what the other page actually claims about this entry. */}
          {context ? (
            <p className="border-l-2 border-input pl-3 font-prose text-sm italic leading-relaxed text-muted-foreground">
              “{context}”
            </p>
          ) : (
            summary && <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{summary}</p>
          )}

          {tags && tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.slice(0, 4).map((t) => (
                <Badge key={t} variant="secondary" className="font-normal">
                  {t}
                </Badge>
              ))}
              {tags.length > 4 && (
                <Badge variant="secondary" className="font-normal">
                  +{tags.length - 4}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export function PageHeading({
  Icon,
  icon,
  title,
  blurb,
  action,
}: {
  /** A lucide icon drawn beside the title. */
  Icon?: IconComponent;
  /** Legacy emoji icon, removed once the last screen is migrated (slice 2e). */
  icon?: string;
  title: string;
  blurb?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-[min(16rem,100%)] flex-1">
          <h1 className="font-display flex items-center gap-3 text-[clamp(1.5rem,1.1rem+1.2vw,2rem)] font-bold leading-tight tracking-tight">
            {Icon && <Icon aria-hidden="true" className="size-7 shrink-0 text-gold" />}
            {!Icon && icon && <span aria-hidden="true">{icon}</span>}
            {title}
          </h1>
          {blurb && <p className="mt-2 text-[15px] text-muted-foreground">{blurb}</p>}
        </div>
        {action && <div className="no-print">{action}</div>}
      </div>
      <div className="mt-4 h-px bg-linear-to-r from-transparent via-border to-transparent" />
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
  Icon = Sparkles,
  className,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  Icon?: IconComponent;
  className?: string;
}) {
  return (
    <Card className={cn("border border-dashed bg-transparent py-12 text-center shadow-none ring-0", className)}>
      <CardContent className="grid justify-items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted text-gold">
          <Icon aria-hidden="true" className="size-6" />
        </span>
        <p className="font-semibold">{title}</p>
        {hint && <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>}
        {action && <div className="mt-2">{action}</div>}
      </CardContent>
    </Card>
  );
}

/** Responsive auto-fitting grid used by every listing page; cards enter in a short stagger. */
export function CardGrid({ children }: { children: ReactNode }) {
  return (
    <StaggerContainer className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-3">
      {children}
    </StaggerContainer>
  );
}
