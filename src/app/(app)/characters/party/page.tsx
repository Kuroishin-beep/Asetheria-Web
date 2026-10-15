import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Plus, UsersRound } from "lucide-react";
import { EmptyState, PageHeading } from "@/components/entry-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { listParty, type PartyMember } from "@/lib/character-world";
import { WORLD_LIMITS } from "@/lib/character/world-core";

export const metadata: Metadata = { title: "The party" };

function WorldText({ text, href }: { text: string; href: string | null }) {
  return href ? (
    <Link href={href} className="text-link underline-offset-4 hover:underline">
      {text}
    </Link>
  ) : (
    <>{text}</>
  );
}

function Member({ m }: { m: PartyMember }) {
  return (
    <Card size="sm" className="h-full">
      <CardContent className="grid gap-1">
        <h2 className="font-display text-lg font-bold tracking-tight">{m.name}</h2>
        <p className="text-sm text-muted-foreground">
          {m.heritage} {m.className}, level {m.level}
        </p>
        <dl className="mt-1 grid gap-1 text-sm">
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted-foreground">Citizenship</dt>
            <dd>
              <WorldText text={m.citizenship.text} href={m.citizenship.href} />
            </dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted-foreground">Worship</dt>
            <dd>
              {m.worship.map((p, i) => (
                <WorldText key={i} text={p.text} href={p.href} />
              ))}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

/** The characters their players chose to share: a few facts about each, read-only, for every signed-in player and the DM. */
export default async function PartyPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/welcome");
  const { members, total, truncated } = await listParty(user);

  return (
    <>
      <PageHeading Icon={UsersRound} title="The party" blurb="Characters their players have shared. Share one from its own page; your sheet, story and journal stay private." />
      {members.length === 0 ? (
        <EmptyState
          Icon={UsersRound}
          title="No one has shared a character yet"
          hint="Open one of your characters and choose Share with the party."
          action={
            user.role === "player" ? (
              <Button asChild>
                <Link href="/characters">
                  <Plus aria-hidden="true" />
                  My characters
                </Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="party-list">
            {members.map((m, i) => (
              <li key={i}>
                <Member m={m} />
              </li>
            ))}
          </ul>
          {truncated && (
            <p className="mt-4 text-sm text-muted-foreground" data-testid="party-truncated">
              Showing the {WORLD_LIMITS.roster} most recently changed of {total} shared characters.
            </p>
          )}
        </>
      )}
    </>
  );
}
