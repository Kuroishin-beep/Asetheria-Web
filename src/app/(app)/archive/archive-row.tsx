"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import type { EntryKind } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { purgeBlankEntryAction, restoreEntryAction } from "@/lib/actions";
import { KIND_ICONS } from "@/lib/section-icons";

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
  const Icon = KIND_ICONS[kind];

  function run(action: (entryId: string) => Promise<{ error?: string } | void>) {
    setError(null);
    startTransition(async () => {
      const res = await action(id);
      if (res && "error" in res && res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <Card size="sm">
      <CardContent>
        <div className="flex flex-wrap items-center gap-3">
          <Icon aria-hidden="true" className="size-4 shrink-0 text-gold" />
          <div className="min-w-48 flex-1">
            <p className="font-semibold">{name}</p>
            <p className="text-[13px] text-muted-foreground">
              {summary || (isBlank ? "Empty entry" : "No summary")}
              {archivedAt && ` · archived ${new Date(archivedAt).toLocaleDateString()}`}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => run(restoreEntryAction)}>
              {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <RotateCcw aria-hidden="true" />}
              Restore
            </Button>

            {/* Permanent deletion is offered only for genuinely empty entries. */}
            {isBlank &&
              (confirmPurge ? (
                <>
                  <Button type="button" variant="destructive" disabled={pending} onClick={() => run(purgeBlankEntryAction)}>
                    Confirm delete
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setConfirmPurge(false)} disabled={pending}>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="hover:border-destructive/50 hover:text-destructive"
                  onClick={() => setConfirmPurge(true)}
                  title="This entry is empty, so it can be removed for good"
                >
                  <Trash2 aria-hidden="true" />
                  Delete blank
                </Button>
              ))}
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-2 text-[13px] text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
