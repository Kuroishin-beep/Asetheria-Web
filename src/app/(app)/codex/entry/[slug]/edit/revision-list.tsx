"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { History, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
        <p role="alert" className="mb-3 text-[13px] text-destructive">
          {error}
        </p>
      )}
      <ul className="grid gap-2">
        {revisions.map((r) => (
          <li key={r.id}>
            <Card size="sm">
              <CardContent className="flex flex-wrap items-center gap-3">
                <span className="min-w-40 flex-1 text-sm">
                  <strong className="font-semibold">{VERB[r.action] ?? r.action}</strong>{" "}
                  <span className="text-muted-foreground">
                    by {r.authorName ?? "unknown"} · {new Date(r.createdAt).toLocaleString()}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
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
                  {busyId === r.id ? (
                    <Loader2 aria-hidden="true" className="animate-spin" />
                  ) : (
                    <History aria-hidden="true" />
                  )}
                  {busyId === r.id ? "Restoring…" : "Restore this version"}
                </Button>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
