"use client";

import { useEffect } from "react";

/**
 * Catches anything an uncaught render/data error would otherwise surface as
 * Next's raw stack-trace screen — most visibly on /login, where a DB hiccup
 * during sign-in used to be the first thing a locked-out DM saw.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Structured, not a bare console.log — this is the one place in the app
    // an unexpected error is guaranteed to pass through.
    console.error("[unhandled]", error);
  }, [error]);

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "2rem 1rem",
      }}
    >
      <div
        className="card"
        style={{
          width: "min(26rem, 100%)",
          padding: "2rem 1.5rem",
          textAlign: "center",
        }}
      >
        <p aria-hidden="true" style={{ fontSize: "1.75rem", opacity: 0.6 }}>
          ⚠
        </p>
        <h1
          className="font-display"
          style={{ fontSize: "1.25rem", fontWeight: 700, marginTop: "0.75rem" }}
        >
          Something went wrong
        </h1>
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "0.875rem",
            marginTop: "0.5rem",
            lineHeight: 1.5,
          }}
        >
          The codex hit an unexpected error. It's been logged — try again, and
          if it keeps happening, mention what you were doing when it broke.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={reset}
          style={{ marginTop: "1.25rem" }}
        >
          Try again
        </button>
      </div>
    </main>
  );
}
