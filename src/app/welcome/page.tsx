import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Landing } from "@/components/landing/landing";
import { getSession } from "@/lib/session-cookie";
import { EnterButtons } from "./enter-buttons";

export const metadata: Metadata = {
  title: "Welcome",
  description: "The Continent of Asetheria: a campaign codex for a Dungeons & Dragons world of three empires. Enter the codex or forge a hero.",
};

export default async function WelcomePage() {
  // Anyone already holding a session goes straight to the codex.
  const session = await getSession();
  if (session) redirect("/");

  return (
    <Landing
      door={
        <Suspense fallback={null}>
          <EnterButtons />
        </Suspense>
      }
    />
  );
}
