import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Plus, ScrollText } from "lucide-react";
import { EmptyState, PageHeading } from "@/components/entry-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { listAll, listMine } from "@/lib/characters";

export const metadata: Metadata = { title: "Characters" };

/** A player's own characters, or, for the DM, everyone's (read-only). */
export default async function CharactersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/welcome");
  const isDM = user.role === "dm";
  const rows = isDM ? await listAll(user) : await listMine(user);

  return (
    <>
      <PageHeading
        Icon={ScrollText}
        title={isDM ? "Characters" : "My characters"}
        blurb={isDM ? "Every character the players have saved. You can read them; only their players can change them." : "The heroes you have forged. Each one follows the Asetheria house rules."}
        action={
          isDM ? null : (
            <Button asChild>
              <Link href="/characters/new">
                <Plus aria-hidden="true" />
                New character
              </Link>
            </Button>
          )
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          Icon={ScrollText}
          title={isDM ? "No characters yet" : "You have not made a character yet"}
          hint={isDM ? "When a player saves a character it will appear here." : "Answer a few questions and get a full 5th edition sheet."}
          action={
            isDM ? null : (
              <Button asChild>
                <Link href="/characters/new">
                  <Plus aria-hidden="true" />
                  Forge a hero
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="character-list">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/characters/${c.id}`} className="group block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                <Card size="sm" className="h-full transition-all duration-150 group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:ring-primary/40">
                  <CardContent className="grid gap-1">
                    <span className="font-display text-lg font-bold tracking-tight">{c.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {c.sheet.heritage} {c.sheet.className}, level {c.sheet.level}
                    </span>
                    {c.owner && <span className="text-xs text-faint-foreground">Player: {c.owner.displayName || c.owner.username}</span>}
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
