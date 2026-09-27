import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { setDisplayName } from "./actions";

export const metadata: Metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Only players are onboarded this way; the DM's account is created and
  // named directly by `scripts/seed.ts`. A player who already has a name
  // (or a DM who lands here by URL) has nothing to do here.
  if (user.role !== "player" || user.displayName) redirect("/");

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "2rem 1rem",
      }}
    >
      <div style={{ width: "min(24rem, 100%)" }}>
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
            Welcome to the Continent
          </h1>
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: "0.875rem",
              marginTop: "0.35rem",
            }}
          >
            What should we call you at the table?
          </p>
        </div>

        <form action={setDisplayName} className="card" style={{ padding: "1.5rem", display: "grid", gap: "1rem" }}>
          <div>
            <label className="label" htmlFor="displayName">
              Your name
            </label>
            <input
              id="displayName"
              name="displayName"
              className="input"
              autoFocus
              required
              maxLength={60}
              placeholder="e.g. Kestra"
            />
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--text-faint)" }}>
            The GM decides what you can see from here — you&rsquo;ll start with
            the continent&rsquo;s empires and its major cities.
          </p>
          <button type="submit" className="btn btn-primary">
            Enter the codex
          </button>
        </form>
      </div>
    </main>
  );
}
