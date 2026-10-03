import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCurrentUser } from "@/lib/auth";
import { setDisplayName } from "./actions";

export const metadata: Metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Only players are onboarded this way; the DM's account is created and
  // named directly by `scripts/seed.ts`. A player who already has a name
  // (or a DM who lands here by URL) has nothing to do here.
  if (user.role !== "player" || user.displayName) redirect("/");

  return (
    <AuthShell title="Welcome to the Continent" description="What should we call you at the table?">
      <Card>
        <CardContent>
          <form action={setDisplayName} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="displayName">Your name</Label>
              <Input id="displayName" name="displayName" autoFocus required maxLength={60} placeholder="e.g. Kestra" />
            </div>
            <p className="text-xs text-muted-foreground">
              The GM decides what you can see from here. You&rsquo;ll start with the continent&rsquo;s
              empires and its major cities.
            </p>
            <Button type="submit">Enter the codex</Button>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
