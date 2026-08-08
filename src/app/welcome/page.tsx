import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session-cookie";
import { EnterButtons } from "./enter-buttons";

export const metadata: Metadata = { title: "Welcome" };

export default async function WelcomePage() {
  // Anyone already holding a session goes straight to the codex.
  const session = await getSession();
  if (session) redirect("/");

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "2rem 1rem",
      }}
    >
      <div style={{ width: "min(34rem, 100%)" }}>
        <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
          <p
            aria-hidden="true"
            style={{ fontSize: "2rem", color: "var(--accent)", lineHeight: 1 }}
          >
            ⚜
          </p>
          <h1
            className="font-display"
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              marginTop: "0.75rem",
              color: "var(--text)",
            }}
          >
            The Continent of Asetheria
          </h1>
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: "0.875rem",
              marginTop: "0.35rem",
            }}
          >
            Two doors into the codex. Choose yours.
          </p>
        </div>

        <Suspense fallback={null}>
          <EnterButtons />
        </Suspense>

        <p
          style={{
            textAlign: "center",
            marginTop: "1.25rem",
            fontSize: "0.75rem",
            color: "var(--text-faint)",
          }}
        >
          Vincit qui se vincit
        </p>
      </div>
    </main>
  );
}
