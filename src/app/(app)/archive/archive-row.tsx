"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { purgeBlankEntryAction, restoreEntryAction } from "@/lib/actions";
import { kindIcon } from "@/lib/kinds";
import type { EntryKind } from "@/db/schema";

export function ArchiveRow({
  id,
  name,
  kind,
  summary,
  archivedAt,
  isBlank,
}: {
  id: string;
  name: string;
  kind: EntryKind;
  summary: string;
  archivedAt: string | null;
  /** Only entries with no content at all may be permanently removed. */
  isBlank: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmPurge, setConfirmPurge] = useState(false);

  return (
    <div className="card" style={{ padding: "0.75rem 1rem" }}>
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <span aria-hidden="true">{kindIcon(kind)}</span>
        <div style={{ flex: 1, minWidth: "12rem" }}>
          <p style={{ fontWeight: 600 }}>{name}</p>
          <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
            {summary || (isBlank ? "Empty entry" : "No summary")}
            {archivedAt && ` · archived ${new Date(archivedAt).toLocaleDateString()}`}
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const res = await restoreEntryAction(id);
                if (res && "error" in res && res.error) setError(res.error);
                else router.refresh();
              });
            }}
          >
            ↩ Restore
          </button>

          {/* Permanent deletion is offered only for genuinely empty entries. */}
          {isBlank &&
            (confirmPurge ? (
              <>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={pending}
                  onClick={() => {
                    setError(null);
                    startTransition(async () => {
                      const res = await purgeBlankEntryAction(id);
                      if (res && "error" in res && res.error) setError(res.error);
                      else router.refresh();
                    });
                  }}
                >
                  Confirm delete
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setConfirmPurge(false)}
                  disabled={pending}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => setConfirmPurge(true)}
                title="This entry is empty, so it can be removed for good"
              >
                Delete blank
              </button>
            ))}
        </div>
      </div>

      {error && (
        <p
          role="alert"
          style={{
            fontSize: "0.8125rem",
            color: "var(--color-blood-400)",
            marginTop: "0.5rem",
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
