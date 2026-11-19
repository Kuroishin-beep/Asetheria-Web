"use client";

import { useId, useState, type FormEvent } from "react";
import { motion } from "motion/react";
import { Loader2, MailCheck } from "lucide-react";
import { FormMessage } from "@/components/shared/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const NOTE_MAX = 280;

export function ForgotForm() {
  const errorId = useId();
  const [username, setUsername] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [throttled, setThrottled] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    setBusy(true);
    setError(null);
    setThrottled(false);
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), note: note.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not send the request.");
        setThrottled(res.status === 429);
        return;
      }
      setSent(data.message);
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid justify-items-center gap-3 py-2 text-center" data-testid="forgot-sent">
        <MailCheck aria-hidden="true" className="size-8 text-gold" />
        <p role="status" className="text-sm">
          {sent}
        </p>
        <p className="text-sm text-muted-foreground">They will tell you the new password; then sign in at the party door.</p>
      </motion.div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="forgot-name">Your name</Label>
        <Input
          id="forgot-name"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="forgot-note">Note for the DM (optional)</Label>
        <Textarea id="forgot-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={NOTE_MAX} rows={3} placeholder="Anything that helps them know it's you" />
      </div>
      {error && (
        <FormMessage id={errorId} variant={throttled ? "notice" : "error"}>
          {error}
        </FormMessage>
      )}
      <Button type="submit" disabled={busy || !username.trim()}>
        {busy && <Loader2 aria-hidden="true" className="animate-spin" />}
        Ask the DM for a new password
      </Button>
    </form>
  );
}
