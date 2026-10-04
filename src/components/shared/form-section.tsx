"use client";

import { useId, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A titled group of related form controls in a card. Exposed to assistive tech
 * as a labelled group, which is what a <fieldset> and its <legend> would have
 * been, without fighting the card's flex layout.
 */
export function FormSection({
  title,
  tone = "default",
  children,
  className,
}: {
  title: ReactNode;
  /** "secret" tints the card the same purple as the DM-only marker used elsewhere. */
  tone?: "default" | "secret";
  children: ReactNode;
  className?: string;
}) {
  const headingId = useId();
  return (
    <Card
      role="group"
      aria-labelledby={headingId}
      size="sm"
      className={cn(tone === "secret" && "ring-secret/35", className)}
    >
      <CardContent className="grid gap-4">
        <h2
          id={headingId}
          className={cn(
            "flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.07em]",
            tone === "secret" ? "text-secret" : "text-muted-foreground",
          )}
        >
          {title}
        </h2>
        {children}
      </CardContent>
    </Card>
  );
}
