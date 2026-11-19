import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { Card, CardContent } from "@/components/ui/card";
import { PlateHeader } from "@/components/shared/plate-header";
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
      <Card className="gap-0 overflow-hidden pt-0">
        <PlateHeader label="The DM's door" aside="Keeper" />
        <CardContent className="pt-6">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>

      <p className="mt-4 flex flex-wrap justify-center gap-x-3 gap-y-1 text-center text-[13px] text-muted-foreground">
        <Link href="/forgot-password" className="text-link underline-offset-4 hover:underline">
          Forgot password?
        </Link>
        {signupOpen && (
          <>
            <span aria-hidden="true">·</span>
            <span>
              Given an invite code?{" "}
              <Link href="/register" className="text-link underline-offset-4 hover:underline">
                Sign up
              </Link>
            </span>
          </>
        )}
      </p>
    </AuthShell>
  );
}
