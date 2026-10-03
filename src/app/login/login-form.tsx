"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { FormMessage } from "@/components/shared/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const errorId = useId();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [throttled, setThrottled] = useState(false);
  const [busy, setBusy] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedUsername = username.trim();
    if (!trimmedUsername || !password) return;

    setBusy(true);
    setError(null);
    setThrottled(false);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmedUsername, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Sign-in failed.");
        setThrottled(res.status === 429);
        setBusy(false);
        // Generic error, not tied to a specific field (so it never hints
        // which one was wrong): send focus back to the top of the form so a
        // keyboard or screen-reader user can immediately retry. Skipped for a
        // throttle: retyping won't help, so don't imply it will.
        if (res.status !== 429) {
          usernameRef.current?.focus();
          usernameRef.current?.select();
        }
        return;
      }
      if (data.needsName) {
        router.push("/onboarding");
        router.refresh();
        return;
      }
      // `next` is validated to be a same-site path so it can't be used for an
      // open redirect.
      router.push(next.startsWith("/") && !next.startsWith("//") ? next : "/");
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection.");
      setBusy(false);
    }
  }

  const canSubmit = username.trim().length > 0 && password.length > 0;

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="username">Name</Label>
        <Input
          id="username"
          ref={usernameRef}
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
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="pr-12"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
          >
            {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </Button>
        </div>
      </div>

      {error && (
        <FormMessage id={errorId} variant={throttled ? "notice" : "error"}>
          {error}
        </FormMessage>
      )}

      <Button type="submit" disabled={busy || !canSubmit} aria-busy={busy}>
        {busy && <Loader2 aria-hidden="true" className="animate-spin" />}
        {busy ? "Opening the codex…" : "Enter"}
      </Button>
    </form>
  );
}
