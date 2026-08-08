"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export function EnterButtons() {
  const router = useRouter();
  const params = useSearchParams();
  const rawNext = params.get("next") || "/";
  // Same-site paths only, so `next` can't be used as an open redirect.
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function enterAsPlayer() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/player", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not open the codex.");
        setBusy(false);
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection.");
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gap: "1rem",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 15rem), 1fr))",
      }}
    >
      <div
        className="card"
        style={{
          padding: "1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          textAlign: "center",
        }}
      >
        <p aria-hidden="true" style={{ fontSize: "1.75rem", lineHeight: 1 }}>
          ⚔
        </p>
        <h2 className="font-display" style={{ fontWeight: 700, fontSize: "1.125rem" }}>
          The Party
        </h2>
        <p
          style={{
            fontSize: "0.8125rem",
            color: "var(--text-muted)",
            flexGrow: 1,
          }}
        >
          No key needed. Step in and read everything the party has uncovered —
          the DM&rsquo;s secrets stay sealed.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={enterAsPlayer}
          disabled={busy}
          style={{ marginTop: "0.25rem" }}
        >
          {busy ? "Opening the codex…" : "Enter as a player"}
        </button>
      </div>

      <div
        className="card"
        style={{
          padding: "1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          textAlign: "center",
        }}
      >
        <p aria-hidden="true" style={{ fontSize: "1.75rem", lineHeight: 1 }}>
          ⚜
        </p>
        <h2 className="font-display" style={{ fontWeight: 700, fontSize: "1.125rem" }}>
          The Dungeon Master
        </h2>
        <p
          style={{
            fontSize: "0.8125rem",
            color: "var(--text-muted)",
            flexGrow: 1,
          }}
        >
          The full codex — secrets, DM notes, and the pen itself. This door
          takes a password.
        </p>
        <Link
          href={next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`}
          className="btn"
          style={{ marginTop: "0.25rem" }}
        >
          Sign in as the DM
        </Link>
      </div>

      {error && (
        <p
          role="alert"
          style={{
            gridColumn: "1 / -1",
            fontSize: "0.8125rem",
            color: "var(--color-blood-400)",
            background:
              "color-mix(in srgb, var(--color-blood-400) 10%, transparent)",
            border:
              "1px solid color-mix(in srgb, var(--color-blood-400) 30%, transparent)",
            borderRadius: 8,
            padding: "0.6rem 0.75rem",
            textAlign: "center",
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
