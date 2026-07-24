"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Outcome = { created: number; updated: number; skipped: number };

export function ImportPanel() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a backup file first.");
      return;
    }
    setBusy(true);
    setError(null);
    setOutcome(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Import failed.");
      } else {
        setOutcome(data);
        router.refresh();
      }
    } catch {
      setError("That file couldn't be read as JSON.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card" style={{ padding: "1.15rem" }}>
      <p
        style={{
          fontSize: "0.875rem",
          color: "var(--text-muted)",
          marginBottom: "0.85rem",
        }}
      >
        Entries already in the codex are updated in place; anything new is added.
        Nothing in your codex is deleted by an import, and the previous version
        of every changed entry is kept in its history.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="input"
        aria-label="Backup file"
        style={{ marginBottom: "0.85rem" }}
      />

      {error && (
        <p
          role="alert"
          style={{
            fontSize: "0.875rem",
            color: "var(--color-blood-400)",
            marginBottom: "0.85rem",
          }}
        >
          {error}
        </p>
      )}

      {outcome && (
        <p
          role="status"
          style={{
            fontSize: "0.875rem",
            color: "var(--color-patina-400)",
            marginBottom: "0.85rem",
          }}
        >
          Done — {outcome.created} added, {outcome.updated} updated
          {outcome.skipped > 0 && `, ${outcome.skipped} blank rows skipped`}.
        </p>
      )}

      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Restoring…" : "Restore backup"}
      </button>
    </form>
  );
}
