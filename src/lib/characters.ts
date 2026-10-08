import "server-only";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { characters, users } from "@/db/schema";
import { validateAndDerive, type CharacterInput, type Sheet } from "@/lib/character/engine";
import { CHARACTER_LIMITS } from "@/lib/character/house-rules";
import { parseCharacterInput } from "@/lib/character/schema";
import type { SessionUser } from "@/lib/session";

/**
 * Saved characters. A player's characters are theirs alone: every query below
 * is keyed by the signed-in user, and a character that is not yours is simply
 * "not found", never "forbidden", so its existence is not confirmed. The DM can
 * read them all and change none.
 *
 * Whatever the browser sends is re-checked here with the same engine the wizard
 * uses, and the stored sheet is the server's own computation.
 */

export class CharacterError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly problems: string[] = [],
  ) {
    super(message);
  }
}

export type SavedCharacter = {
  id: string;
  name: string;
  input: CharacterInput;
  sheet: Sheet;
  createdAt: Date;
  updatedAt: Date;
  /** Present only in the DM's list. */
  owner?: { id: string; username: string; displayName: string | null };
};

type Row = typeof characters.$inferSelect;
const shape = (r: Row): SavedCharacter => ({
  id: r.id,
  name: r.name,
  input: r.input as CharacterInput,
  sheet: r.sheet as Sheet,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

/** Parses, size-checks, validates and derives; throws a 400 with the reasons on any failure. */
export function checkCharacter(raw: unknown): { input: CharacterInput; sheet: Sheet } {
  const size = Buffer.byteLength(JSON.stringify(raw ?? null), "utf8");
  if (size > CHARACTER_LIMITS.maxDataBytes) throw new CharacterError("That character is too large to save.", 413);
  const parsed = parseCharacterInput(raw);
  if (!parsed.ok) throw new CharacterError("That is not a character the creator can read.", 400, parsed.problems);
  const result = validateAndDerive(parsed.value);
  if (!result.ok || !result.sheet) throw new CharacterError("That character breaks a rule.", 400, result.problems);
  return { input: parsed.value, sheet: result.sheet };
}

function playerOnly(user: SessionUser) {
  if (user.role !== "player") throw new CharacterError("Only players keep characters; the DM can read them.", 403);
}

export async function listMine(user: SessionUser): Promise<SavedCharacter[]> {
  const rows = await db
    .select()
    .from(characters)
    .where(and(eq(characters.userId, user.id), isNull(characters.archivedAt)))
    .orderBy(desc(characters.updatedAt));
  return rows.map(shape);
}

/** The DM's read-only list of everyone's characters. */
export async function listAll(user: SessionUser): Promise<SavedCharacter[]> {
  if (user.role !== "dm") throw new CharacterError("Only the DM can list everyone's characters.", 403);
  const rows = await db
    .select({ c: characters, owner: { id: users.id, username: users.username, displayName: users.displayName } })
    .from(characters)
    .innerJoin(users, eq(users.id, characters.userId))
    .where(isNull(characters.archivedAt))
    .orderBy(desc(characters.updatedAt));
  return rows.map((r) => ({ ...shape(r.c), owner: r.owner }));
}

/** A character the viewer may read: their own, or any if they are the DM. */
export async function getCharacter(user: SessionUser, id: string): Promise<SavedCharacter | null> {
  const where = user.role === "dm" ? eq(characters.id, id) : and(eq(characters.id, id), eq(characters.userId, user.id));
  const [row] = await db
    .select()
    .from(characters)
    .where(and(where, isNull(characters.archivedAt)))
    .limit(1);
  return row ? shape(row) : null;
}

export async function createCharacter(user: SessionUser, raw: unknown): Promise<SavedCharacter> {
  playerOnly(user);
  const { input, sheet } = checkCharacter(raw);
  const [{ n }] = await db
    .select({ n: count() })
    .from(characters)
    .where(and(eq(characters.userId, user.id), isNull(characters.archivedAt)));
  if (n >= CHARACTER_LIMITS.maxCharactersPerPlayer) {
    throw new CharacterError(`You can keep up to ${CHARACTER_LIMITS.maxCharactersPerPlayer} characters. Delete one first.`, 409);
  }
  const [row] = await db
    .insert(characters)
    .values({ userId: user.id, name: sheet.name, input, sheet, schemaVersion: input.schemaVersion })
    .returning();
  return shape(row);
}

export async function updateCharacter(user: SessionUser, id: string, raw: unknown): Promise<SavedCharacter | null> {
  playerOnly(user);
  const { input, sheet } = checkCharacter(raw);
  const [row] = await db
    .update(characters)
    .set({ name: sheet.name, input, sheet, schemaVersion: input.schemaVersion, updatedAt: new Date() })
    .where(and(eq(characters.id, id), eq(characters.userId, user.id), isNull(characters.archivedAt)))
    .returning();
  return row ? shape(row) : null;
}

/** Soft delete: the row is kept, so nothing is lost for good. */
export async function deleteCharacter(user: SessionUser, id: string): Promise<boolean> {
  playerOnly(user);
  const rows = await db
    .update(characters)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(characters.id, id), eq(characters.userId, user.id), isNull(characters.archivedAt)))
    .returning({ id: characters.id });
  return rows.length > 0;
}
