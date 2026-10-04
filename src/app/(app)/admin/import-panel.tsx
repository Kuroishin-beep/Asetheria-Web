"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Upload } from "lucide-react";
import { FormMessage } from "@/components/shared/form-message";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Outcome = { created: number; updated: number; skipped: number };

export function ImportPanel() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function onSubmit(e: FormEvent) {
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
    <Card>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            Entries already in the codex are updated in place; anything new is added. Nothing in your codex is
            deleted by an import, and the previous version of every changed entry is kept in its history.
          </p>

          <Input ref={fileRef} type="file" accept="application/json,.json" aria-label="Backup file" />

          {error && <FormMessage>{error}</FormMessage>}

          {outcome && (
            <Alert role="status">
              <CheckCircle2 aria-hidden="true" className="text-success" />
              <AlertDescription>
                Done: {outcome.created} added, {outcome.updated} updated
                {outcome.skipped > 0 && `, ${outcome.skipped} blank rows skipped`}.
              </AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={busy} className="justify-self-start">
            {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Upload aria-hidden="true" />}
            {busy ? "Restoring…" : "Restore backup"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
