"use client";

import { useState, useTransition } from "react";
import { Archive, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { archiveEntryAction } from "@/lib/actions";

/**
 * The closest thing to a delete in this app. It is deliberately two-step and
 * says plainly that nothing is destroyed: the entry moves to /archive and can
 * be brought back at any time.
 */
export function ArchiveButton({ entryId, name }: { entryId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Never let a click-away or Escape abandon an archive that is in flight.
        if (pending) return;
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" className="hover:border-destructive/50 hover:text-destructive">
          <Archive aria-hidden="true" />
          Archive
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            It moves to the archive and stays in the database. You can restore it whenever you like.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await archiveEntryAction(entryId);
                if (res && "error" in res && res.error) setError(res.error);
              })
            }
          >
            {pending && <Loader2 aria-hidden="true" className="animate-spin" />}
            {pending ? "Archiving…" : "Yes, archive"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
