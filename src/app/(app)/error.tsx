"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/error-state";

/** An error inside the codex keeps the sidebar and top bar so the person can navigate away. */
export default function CodexError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[unhandled]", error);
  }, [error]);

  return (
    <div className="py-8">
      <ErrorState
        onRetry={retry}
        extra={
          <Button asChild variant="outline">
            <Link href="/">Back to the front page</Link>
          </Button>
        }
      />
    </div>
  );
}
