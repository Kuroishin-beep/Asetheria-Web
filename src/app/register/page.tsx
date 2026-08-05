import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Join the party" };

export default async function RegisterPage() {
  // Someone already signed in has no business here.
  const user = await getCurrentUser();
  if (user) redirect("/");

  // The API is the real gate; this only avoids showing a form that cannot work.
  const open = Boolean(process.env.SIGNUP_CODE?.trim());

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "2rem 1rem",
      }}
    >
      <div style={{ width: "min(24rem, 100%)" }}>
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
            {open
              ? "Take an oath and the codex opens — as far as the party is allowed."
              : "The codex is sealed to strangers."}
          </p>
        </div>

        <div className="card" style={{ padding: "1.5rem" }}>
          {open ? (
            <RegisterForm />
          ) : (
            <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
              Registration is closed. Ask the DM for an account.
            </p>
          )}
        </div>

        <p
          style={{
            textAlign: "center",
            marginTop: "1.25rem",
            fontSize: "0.8125rem",
            color: "var(--text-muted)",
          }}
        >
          Already sworn? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
