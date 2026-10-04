"use client";

import type { ReactNode } from "react";
import { RotateCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * A friendly failure screen: what happened in plain words and one clear way
 * to recover. Never shows a stack trace or raw error text.
 */
export function ErrorState({
  title = "Something went wrong",
  message = "The codex hit an unexpected error. It has been logged. Try again, and if it keeps happening, mention what you were doing when it broke.",
  onRetry,
  extra,
}: {
  title?: string;
  message?: string;
  onRetry: () => void;
  extra?: ReactNode;
}) {
  return (
    <Card className="mx-auto w-full max-w-md text-center">
      <CardContent className="grid justify-items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <TriangleAlert aria-hidden="true" className="size-6" />
        </span>
        <h1 className="font-display text-xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{message}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Button type="button" onClick={onRetry}>
            <RotateCw aria-hidden="true" />
            Try again
          </Button>
          {extra}
        </div>
      </CardContent>
    </Card>
  );
}
