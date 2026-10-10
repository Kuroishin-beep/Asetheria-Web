import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { Pencil } from "lucide-react";
import { PageHeading } from "@/components/entry-card";
import { CharacterCreator } from "@/components/character/creator";
import { getCurrentUser } from "@/lib/auth";
import { memberCreatorOptions } from "@/lib/character/member-options";
import { getCharacter } from "@/lib/characters";

export const metadata: Metadata = { title: "Edit character" };

export default async function EditCharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/welcome");
  const { id } = await params;
  if (user.role !== "player" || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const character = await getCharacter(user, id);
  if (!character) notFound();

  const { empires, deities } = await memberCreatorOptions(user);
  return (
    <div className="max-w-4xl">
      <PageHeading Icon={Pencil} title={`Edit ${character.name}`} blurb="Change anything; the numbers are worked out again from the house rules when you save." />
      <CharacterCreator mode="member" empires={empires} deities={deities} userKey={user.id} existing={{ id: character.id, input: character.input }} />
    </div>
  );
}
