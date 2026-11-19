import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { Card, CardContent } from "@/components/ui/card";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Forgot password" };

/** A player who lost their password asks the DM for a new one; the DM sets it from the Party page. */
export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="The Continent of Asetheria"
      description="Lost your password? Tell the DM, and they will set you a new one."
    >
      <Card>
        <CardContent>
          <ForgotForm />
        </CardContent>
      </Card>

      <p className="mt-4 text-center text-[13px] text-muted-foreground">
        Remembered it?{" "}
        <Link href="/welcome#door" className="text-link underline-offset-4 hover:underline">
          Back to the party door
        </Link>
      </p>
    </AuthShell>
  );
}
