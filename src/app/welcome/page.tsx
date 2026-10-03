import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { getSession } from "@/lib/session-cookie";
import { EnterButtons } from "./enter-buttons";

export const metadata: Metadata = { title: "Welcome" };

export default async function WelcomePage() {
  // Anyone already holding a session goes straight to the codex.
  const session = await getSession();
  if (session) redirect("/");

  return (
    <AuthShell title="The Continent of Asetheria" description="Two doors into the codex. Choose yours." size="md">
      <Suspense fallback={null}>
        <EnterButtons />
      </Suspense>
    </AuthShell>
  );
}
