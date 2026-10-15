import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { Pencil, ScrollText } from "lucide-react";
import { PageHeading } from "@/components/entry-card";
import { CharacterJournal } from "@/components/character/journal";
import { CharacterSheetView } from "@/components/character/sheet-view";
import { CharacterWorldPanel } from "@/components/character/world-panel";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { listJournal, resolveWorlds } from "@/lib/character-world";
import { getCharacter } from "@/lib/characters";
import { PrintButton } from "./print-button";
import { DeleteCharacterButton } from "./delete-button";

export const metadata: Metadata = { title: "Character" };

export default async function CharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/welcome");
  const { id } = await params;
  // Someone else's character, a malformed id and a deleted one all look the same: not found.
  const character = /^[0-9a-f-]{36}$/i.test(id) ? await getCharacter(user, id) : null;
  if (!character) notFound();
  const mine = user.role === "player";
  // Links only to pages this viewer may read; the journal only for the player and the DM (this page is already theirs alone).
  const [[world], journal] = await Promise.all([resolveWorlds(user, [{ input: character.input, homeEntryId: character.homeEntryId }]), listJournal(user, character.id)]);

  return (
    <div className="max-w-6xl">
      <PageHeading
        Icon={ScrollText}
        title={character.name}
        blurb={`${character.sheet.heritage} ${character.sheet.className}, level ${character.sheet.level}`}
        action={
          <div className="no-print flex flex-wrap gap-2">
            <PrintButton />
            {mine && (
              <>
                <Button asChild variant="outline">
                  <Link href={`/characters/${character.id}/edit`}>
                    <Pencil aria-hidden="true" />
                    Edit
                  </Link>
                </Button>
                <DeleteCharacterButton id={character.id} name={character.name} />
              </>
            )}
          </div>
        }
      />
      <CharacterSheetView sheet={character.sheet} input={character.input} world={world} />
      <div className="mt-6 grid gap-4">
        {mine && <CharacterWorldPanel id={character.id} shared={character.shared} home={world.home?.text ?? null} />}
        <CharacterJournal
          characterId={character.id}
          canWrite={mine}
          entries={(journal ?? []).map((e) => ({ id: e.id, title: e.title, body: e.body, createdAt: e.createdAt.toISOString(), updatedAt: e.updatedAt.toISOString() }))}
        />
      </div>
    </div>
  );
}
