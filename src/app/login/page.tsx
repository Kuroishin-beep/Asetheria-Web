import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { Card, CardContent } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  // Only advertise registration when the DM has actually opened it.
  const signupOpen = Boolean(process.env.SIGNUP_CODE?.trim());

  return (
    <AuthShell
      title="The Continent of Asetheria"
      description={
        <>
          The Dungeon Master&rsquo;s door. Players use{" "}
          <Link href="/welcome" className="text-link underline-offset-4 hover:underline">
            the party door
          </Link>
          .
        </>
      }
    >
      <Card>
        <CardContent>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>

      {signupOpen && (
        <p className="mt-4 text-center text-[13px] text-muted-foreground">
          Given an invite code?{" "}
          <Link href="/register" className="text-link underline-offset-4 hover:underline">
            Join the party
          </Link>
        </p>
      )}
    </AuthShell>
  );
}
