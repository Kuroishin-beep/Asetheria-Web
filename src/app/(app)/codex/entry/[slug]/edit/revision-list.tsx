"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { revertToRevisionAction } from "@/lib/actions";

type Rev = {
  id: string;
  action: string;
  authorName: string | null;
  createdAt: string;
};

const VERB: Record<string, string> = {
  create: "Created",
  update: "Edited",
  archive: "Archived",
  restore: "Restored",
  import: "Imported",
};

export function RevisionList({ revisions }: { revisions: Rev[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      {error && (
        <p
          role="alert"
          style={{
            fontSize: "0.8125rem",
            color: "var(--color-blood-400)",
            marginBottom: "0.75rem",
          }}
        >
          {error}
        </p>
      )}
      <ul style={{ display: "grid", gap: "0.4rem" }}>
        {revisions.map((r) => (
          <li
            key={r.id}
            className="card"
            style={{
              padding: "0.6rem 0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: "0.875rem", flex: 1, minWidth: "10rem" }}>
              <strong style={{ fontWeight: 600 }}>
                {VERB[r.action] ?? r.action}
              </strong>{" "}
              <span style={{ color: "var(--text-muted)" }}>
                by {r.authorName ?? "unknown"} ·{" "}
                {new Date(r.createdAt).toLocaleString()}
              </span>
            </span>
            <button
              type="button"
              className="btn"
              disabled={pending}
              onClick={() => {
                setError(null);
                setBusyId(r.id);
                startTransition(async () => {
                  const res = await revertToRevisionAction(r.id);
                  setBusyId(null);
                  if (res && "error" in res && res.error) setError(res.error);
                  else router.refresh();
                });
              }}
            >
              {busyId === r.id ? "Restoring…" : "Restore this version"}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
