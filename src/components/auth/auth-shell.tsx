"use client";

import type { ReactNode } from "react";
import { Compass } from "lucide-react";
import { SlideUp } from "@/components/motion/slide-up";
import { cn } from "@/lib/utils";

type AuthShellProps = {
  title: string;
  description?: ReactNode;
  /** "sm" for a single form, "md" for the two-door welcome page. */
  size?: "sm" | "md";
  children: ReactNode;
};

/**
 * The shared frame of every pre-login page: centred column, brand mark, page
 * title, one line of context, and the house motto underneath.
 */
export function AuthShell({ title, description, size = "sm", children }: AuthShellProps) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-8">
      <SlideUp className={cn("w-full", size === "sm" ? "max-w-sm" : "max-w-xl")}>
        <header className="mb-6 text-center">
          <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full border border-border bg-card text-gold shadow-sm">
            <Compass aria-hidden="true" className="size-6" />
          </span>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
        </header>

        {children}

        <p className="mt-6 text-center text-xs text-faint-foreground">Vincit qui se vincit</p>
      </SlideUp>
    </main>
  );
}
