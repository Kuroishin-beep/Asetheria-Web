"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RegisterForm() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    if (password.length < 10) {
      setError("Password must be at least 10 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not create the account.");
        setBusy(false);
        return;
      }
      // Registration signs the new player in, so go straight to the codex.
      router.push("/");
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: "1rem" }}>
      <div>
        <label className="label" htmlFor="username">
          Name
        </label>
        <input
          id="username"
          className="input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          minLength={3}
          maxLength={32}
          autoFocus
          required
        />
      </div>

      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={10}
          required
        />
        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.35rem" }}>
          At least 10 characters. A short phrase works better than a short word.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="confirm">
          Password again
        </label>
        <input
          id="confirm"
          type="password"
          className="input"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
        />
      </div>

      <div>
        <label className="label" htmlFor="code">
          Invite code
        </label>
        <input
          id="code"
          className="input"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          required
        />
        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.35rem" }}>
          From your DM. The codex is not open to strangers.
        </p>
      </div>

      {error && (
        <p
          role="alert"
          style={{
            fontSize: "0.8125rem",
            color: "var(--color-blood-400)",
            background: "color-mix(in srgb, var(--color-blood-400) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-blood-400) 30%, transparent)",
            borderRadius: 8,
            padding: "0.6rem 0.75rem",
          }}
        >
          {error}
        </p>
      )}

      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Sealing the oath…" : "Join the party"}
      </button>
    </form>
  );
}
