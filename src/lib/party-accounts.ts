import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { characters, users } from "@/db/schema";
import { hashPassword, passwordProblem } from "@/lib/password";
import { applyDefaultGrants } from "@/lib/rbac";

/**
 * The DM's party roster of logins: one player account per person, each with its own name and password,
 * and the characters that account owns. Players sign in at the party door and land on their characters.
 */

export const PARTY_ACCOUNT_LIMITS = { nameMin: 3, nameMax: 32 } as const;

export const partyUsername = z
  .string()
  .trim()
  .min(PARTY_ACCOUNT_LIMITS.nameMin, `Name must be at least ${PARTY_ACCOUNT_LIMITS.nameMin} characters.`)
  .max(PARTY_ACCOUNT_LIMITS.nameMax, `Name must be under ${PARTY_ACCOUNT_LIMITS.nameMax} characters.`)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} _'\-.]*$/u, "Use letters, numbers, spaces, and - _ . ' only.");

export class PartyAccountError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export interface PartyAccount {
  id: string;
  username: string;
  displayName: string | null;
  lastLoginAt: string | null;
  characters: { id: string; name: string }[];
}

export interface CharacterChoice {
  id: string;
  name: string;
  ownerId: string;
  ownerName: string;
}

/** Every player account, oldest first, with the characters each one owns. */
export async function listPartyAccounts(): Promise<{ accounts: PartyAccount[]; choices: CharacterChoice[] }> {
  const [players, chars] = await Promise.all([
    db
      .select({ id: users.id, username: users.username, displayName: users.displayName, lastLoginAt: users.lastLoginAt })
      .from(users)
      .where(eq(users.role, "player"))
      .orderBy(asc(users.createdAt)),
    db
      .select({ id: characters.id, name: characters.name, ownerId: characters.userId, ownerName: users.username })
      .from(characters)
      .innerJoin(users, eq(users.id, characters.userId))
      .where(and(isNull(characters.archivedAt), eq(users.role, "player")))
      .orderBy(asc(characters.name)),
  ]);
  const accounts = players.map((p) => ({
    ...p,
    lastLoginAt: p.lastLoginAt ? p.lastLoginAt.toISOString() : null,
    characters: chars.filter((c) => c.ownerId === p.id).map(({ id, name }) => ({ id, name })),
  }));
  return { accounts, choices: chars };
}

function checkPassword(password: string) {
  const problem = passwordProblem(password);
  if (problem) throw new PartyAccountError(problem, 400);
}

/** A new player login. The role is always `player`; this can never make a DM. */
export async function createPlayerAccount(input: { username: string; password: string }): Promise<{ id: string }> {
  checkPassword(input.password);
  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.username}) = lower(${input.username})`)
    .limit(1);
  if (taken) throw new PartyAccountError("That name is taken.", 409);
  try {
    const [created] = await db
      .insert(users)
      .values({ username: input.username, passwordHash: await hashPassword(input.password), role: "player", displayName: input.username })
      .returning({ id: users.id });
    // Named up front, so the account skips /onboarding: give it the new-player defaults here.
    await applyDefaultGrants(created.id);
    return created;
  } catch (error) {
    if (error instanceof PartyAccountError) throw error;
    // The unique index on lower(username) settles two simultaneous creations of one name.
    throw new PartyAccountError("That name is taken.", 409);
  }
}

/** A new password for a player. Bumping the epoch signs out every device that had the old one. */
export async function resetPlayerPassword(playerId: string, password: string): Promise<void> {
  checkPassword(password);
  const updated = await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), sessionEpoch: sql`${users.sessionEpoch} + 1` })
    .where(and(eq(users.id, playerId), eq(users.role, "player")))
    .returning({ id: users.id });
  if (updated.length === 0) throw new PartyAccountError("No such player.", 404);
}

/** Hands a character to a player account, so it shows under their characters when they sign in. */
export async function giveCharacter(characterId: string, playerId: string): Promise<void> {
  const [player] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, playerId), eq(users.role, "player")))
    .limit(1);
  if (!player) throw new PartyAccountError("No such player.", 404);
  const moved = await db
    .update(characters)
    .set({ userId: playerId, updatedAt: new Date() })
    .where(and(eq(characters.id, characterId), isNull(characters.archivedAt)))
    .returning({ id: characters.id });
  if (moved.length === 0) throw new PartyAccountError("No such character.", 404);
}
