import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Hammer } from "lucide-react";
import { PageHeading } from "@/components/entry-card";
import { CharacterCreator } from "@/components/character/creator";
import { getCurrentUser } from "@/lib/auth";
import { memberCreatorOptions } from "@/lib/character/member-options";

export const metadata: Metadata = { title: "Forge a hero" };

export default async function NewCharacterPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/welcome");
  // The DM reads characters; players make them.
  if (user.role !== "player") redirect("/characters");

  const { empires, deities } = await memberCreatorOptions(user);
  return (
    <div className="max-w-4xl">
      <PageHeading Icon={Hammer} title="Forge a hero" blurb="Answer a few questions and get a 5th edition character sheet, built with the Asetheria house rules. Saved to your account when you finish." />
      <CharacterCreator mode="member" empires={empires} deities={deities} userKey={user.id} />
    </div>
  );
}
