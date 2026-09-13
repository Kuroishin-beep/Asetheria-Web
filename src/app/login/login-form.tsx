"use client";

import { useId, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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

  async function onSubmit(e: React.FormEvent) {
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
        // which one was wrong) — send focus back to the top of the form so
        // a keyboard or screen-reader user can immediately retry. Skipped
        // for a throttle: retyping won't help, so don't imply it will.
        if (res.status !== 429) {
          usernameRef.current?.focus();
          usernameRef.current?.select();
        }
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
    <form onSubmit={onSubmit} style={{ display: "grid", gap: "1rem" }} noValidate>
      <div>
        <label className="label" htmlFor="username">
          Name
        </label>
        <input
          id="username"
          ref={usernameRef}
          className="input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
      </div>

      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <div style={{ position: "relative" }}>
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            style={{ paddingRight: "2.75rem" }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            style={{
              position: "absolute",
              right: "0.4rem",
              top: "50%",
              transform: "translateY(-50%)",
              background: "transparent",
              border: 0,
              padding: "0.35rem 0.5rem",
              cursor: "pointer",
              color: "var(--text-muted)",
              fontSize: "0.8125rem",
              lineHeight: 1,
            }}
          >
            <span aria-hidden="true">{showPassword ? "🙈" : "👁"}</span>
          </button>
        </div>
      </div>

      {error && (
        <p
          id={errorId}
          role="alert"
          data-variant={throttled ? "throttle" : "error"}
          style={
            throttled
              ? {
                  // A calmer tone than the wrong-credentials red — this
                  // isn't a mistake the user made, just a pause.
                  fontSize: "0.8125rem",
                  color: "var(--accent)",
                  background: "color-mix(in srgb, var(--accent) 10%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
                  borderRadius: 8,
                  padding: "0.6rem 0.75rem",
                }
              : {
                  fontSize: "0.8125rem",
                  color: "var(--color-blood-400)",
                  background: "color-mix(in srgb, var(--color-blood-400) 10%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--color-blood-400) 30%, transparent)",
                  borderRadius: 8,
                  padding: "0.6rem 0.75rem",
                }
          }
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        className="btn btn-primary"
        disabled={busy || !canSubmit}
        aria-busy={busy}
      >
        {busy ? "Opening the codex…" : "Enter"}
      </button>
    </form>
  );
}
