import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { Card, CardContent } from "@/components/ui/card";
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
    <AuthShell
      title="The Continent of Asetheria"
      description={
        open
          ? "Take an oath and the codex opens, as far as the party is allowed."
          : "The codex is sealed to strangers."
      }
    >
      <Card>
        <CardContent>
          {open ? (
            <RegisterForm />
          ) : (
            <p className="text-sm text-muted-foreground">Registration is closed. Ask the DM for an account.</p>
          )}
        </CardContent>
      </Card>

      <p className="mt-4 text-center text-[13px] text-muted-foreground">
        Already sworn?{" "}
        <Link href="/login" className="text-link underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
