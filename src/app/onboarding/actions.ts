"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { applyDefaultGrants } from "@/lib/rbac";

const nameSchema = z.string().trim().min(1, "Tell us what to call you.").max(60);

export async function setDisplayName(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = nameSchema.safeParse(formData.get("displayName"));
  if (!parsed.success) {
    // The form has client-side `required`; a failure here means it was
    // bypassed. Send back to the same page rather than pretending success.
    redirect("/onboarding");
  }

  await db
    .update(users)
    .set({ displayName: parsed.data })
    .where(eq(users.id, user.id));

  // First-time onboarding only: a later name change (not built yet) must not
  // re-grant defaults a GM may have since revoked.
  if (user.role === "player" && !user.displayName) {
    await applyDefaultGrants(user.id);
  }

  redirect("/");
}
