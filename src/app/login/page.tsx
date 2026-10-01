import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  // Only advertise registration when the DM has actually opened it.
  const signupOpen = Boolean(process.env.SIGNUP_CODE?.trim());

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "2rem 1rem",
      }}
    >
      {/* A subtle entrance rather than a hard cut when the page mounts.
          `@starting-style` degrades to no transition at all on browsers
          that don't support it yet — no animation library, no @keyframes. */}
      <style>{`
        .login-card-enter {
          transition: opacity 260ms ease, transform 260ms ease;
        }
        @starting-style {
          .login-card-enter {
            opacity: 0;
            transform: translateY(6px);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .login-card-enter {
            transition: none;
          }
        }
      `}</style>
      <div className="login-card-enter" style={{ width: "min(24rem, 100%)" }}>
        <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
          <p
            aria-hidden="true"
            style={{ fontSize: "2rem", color: "var(--accent)", lineHeight: 1 }}
          >
            ⚜
          </p>
          <h1
            className="font-display"
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              marginTop: "0.75rem",
              color: "var(--text)",
            }}
          >
            The Continent of Asetheria
          </h1>
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: "0.875rem",
              marginTop: "0.35rem",
            }}
          >
            The Dungeon Master&rsquo;s door. Players can{" "}
            <Link href="/welcome">enter without a password</Link>.
          </p>
        </div>

        <div className="card" style={{ padding: "1.5rem" }}>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>

        {signupOpen && (
          <p
            style={{
              textAlign: "center",
              marginTop: "1.25rem",
              fontSize: "0.8125rem",
              color: "var(--text-muted)",
            }}
          >
            Given an invite code? <Link href="/register">Join the party</Link>
          </p>
        )}

        <p
          style={{
            textAlign: "center",
            marginTop: "1.25rem",
            fontSize: "0.75rem",
            color: "var(--text-faint)",
          }}
        >
          Vincit qui se vincit
        </p>
      </div>
    </main>
  );
}
