"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shared/error-state";

/**
 * Catches anything an uncaught render/data error would otherwise surface as
 * Next's raw stack-trace screen, most visibly on /login, where a DB hiccup
 * during sign-in used to be the first thing a locked-out DM saw.
 */
export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Structured, not a bare console.log: this is the one place in the app
    // an unexpected error is guaranteed to pass through.
    console.error("[unhandled]", error);
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-8">
      <ErrorState onRetry={retry} />
    </main>
  );
}
