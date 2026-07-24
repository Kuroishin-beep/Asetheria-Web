"use client";

import { useState, useTransition } from "react";
import { archiveEntryAction } from "@/lib/actions";

/**
 * The closest thing to a delete in this app. It is deliberately two-step and
 * says plainly that nothing is destroyed — the entry moves to /archive and can
 * be brought back at any time.
 */
export function ArchiveButton({
  entryId,
  name,
}: {
  entryId: string;
  name: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        className="btn btn-danger"
        onClick={() => setConfirming(true)}
      >
        🗄 Archive
      </button>
    );
  }

  return (
    <div
      className="card"
      style={{
        padding: "0.75rem",
        display: "grid",
        gap: "0.6rem",
        maxWidth: "22rem",
      }}
    >
      <p style={{ fontSize: "0.8125rem", lineHeight: 1.5 }}>
        Move <strong>{name}</strong> to the archive? It stays in the database and
        you can restore it whenever you like.
      </p>
      {error && (
        <p style={{ fontSize: "0.8125rem", color: "var(--color-blood-400)" }}>
          {error}
        </p>
      )}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="button"
          className="btn btn-danger"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await archiveEntryAction(entryId);
              if (res && "error" in res && res.error) setError(res.error);
            })
          }
        >
          {pending ? "Archiving…" : "Yes, archive"}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => setConfirming(false)}
          disabled={pending}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
