import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Compass } from "lucide-react";
import { CharacterCreator } from "@/components/character/creator";
import { PUBLIC_EMPIRES } from "@/lib/character/public-options";
import { getSession } from "@/lib/session-cookie";

export const metadata: Metadata = { title: "Forge a hero" };

/**
 * The character creator for anyone, signed in or not. It reads nothing from
 * the database: its options are constants, so it cannot show a stranger
 * anything from the codex. Someone who is already signed in is sent to the
 * member version, which can save to their account.
 */
export default async function CreateCharacterPage() {
  const session = await getSession();
  if (session) redirect("/characters/new");

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.07em] text-muted-foreground">
            <Compass aria-hidden="true" className="size-4 text-gold" />
            The Continent of Asetheria
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight">Forge a hero</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Answer a few questions and get a Dungeons &amp; Dragons 5th edition character sheet, built with the Asetheria house rules.
          </p>
        </div>
        <Link href="/welcome" className="text-sm text-link underline-offset-4 hover:underline">
          Back to the front door
        </Link>
      </header>
      <CharacterCreator mode="public" empires={PUBLIC_EMPIRES} deities={[]} />
    </main>
  );
}
