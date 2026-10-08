import { z } from "zod";
import { ABILITIES, ABILITY_SCORE_METHODS, CHARACTER_LIMITS } from "@/lib/character/house-rules";
import { SKILL_IDS } from "@/lib/character/srd";
import type { CharacterInput } from "@/lib/character/engine";

/**
 * The shape of a character as it is sent to the server. This only checks that
 * the data is the right *kind* of thing (strings are strings, no stray keys,
 * sizes are bounded); whether it obeys the house rules is decided by
 * `validateAndDerive`, which the server always runs on whatever passes here.
 */

const text = (max: number = CHARACTER_LIMITS.maxTextLength) => z.string().max(max);

const scores = z
  .object({ str: z.number(), dex: z.number(), con: z.number(), int: z.number(), wis: z.number(), cha: z.number() })
  .strict();

const ability = z.enum(ABILITIES);
const skill = z.enum(SKILL_IDS as unknown as [string, ...string[]]);

const rolledSet = z
  .object({
    dice: z.array(z.array(z.number()).max(4)).max(6),
    scores: z.array(z.number()).max(6),
    total: z.number(),
  })
  .strict();

const levelRoll = z.object({ first: z.number(), reroll: z.number().optional() }).strict();

export const characterInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    name: text(80),
    playerName: text(80),
    concept: text(),
    race: z
      .object({
        raceId: text(40),
        chosenBonuses: z.array(ability).max(6).optional(),
        other: z
          .object({
            name: text(80),
            bonuses: z.object({ str: z.number().optional(), dex: z.number().optional(), con: z.number().optional(), int: z.number().optional(), wis: z.number().optional(), cha: z.number().optional() }).strict(),
            speed: z.number(),
          })
          .strict()
          .optional(),
      })
      .strict(),
    classId: text(40),
    level: z.number(),
    backgroundName: text(80),
    backgroundSkills: z.array(skill).max(6),
    classSkills: z.array(skill).max(8),
    method: z.enum(ABILITY_SCORE_METHODS),
    pointBuy: z.object({ extraRoll: z.number(), scores }).strict().optional(),
    roll: z.object({ sets: z.array(rolledSet).max(60), assignment: scores }).strict().optional(),
    array: z.object({ index: z.number(), assignment: scores }).strict().optional(),
    hp: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("rolled"), levelRolls: z.array(levelRoll).max(CHARACTER_LIMITS.maxLevel) }).strict(),
      z.object({ mode: z.literal("manual"), total: z.number() }).strict(),
    ]),
    armorClass: z.number().optional(),
    equipment: text(),
    citizenship: text(40),
    worship: text(200),
    traits: text(),
    ideals: text(),
    bonds: text(),
    flaws: text(),
    appearance: text(),
    backstory: text(),
  })
  .strict();

export type ParsedCharacter = z.infer<typeof characterInputSchema> & CharacterInput;

/** Returns the parsed character, or a friendly list of what is wrong with its shape. */
export function parseCharacterInput(raw: unknown): { ok: true; value: CharacterInput } | { ok: false; problems: string[] } {
  const parsed = characterInputSchema.safeParse(raw);
  if (!parsed.success) {
    const problems = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "character"}: ${i.message}`);
    return { ok: false, problems };
  }
  return { ok: true, value: parsed.data as unknown as CharacterInput };
}
