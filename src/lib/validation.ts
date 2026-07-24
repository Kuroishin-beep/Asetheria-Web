import { z } from "zod";
import { entryKind, visibility } from "@/db/schema";

export const kindSchema = z.enum(entryKind.enumValues);
export const visibilitySchema = z.enum(visibility.enumValues);

/**
 * Bounds are generous — this is a worldbuilding tool, and a 40k-character
 * empire history is legitimate. They exist to stop accidental runaway input,
 * not to constrain writing.
 */
export const entryInputSchema = z.object({
  name: z.string().trim().min(1, "Every entry needs a name.").max(300),
  kind: kindSchema,
  summary: z.string().trim().max(600).default(""),
  body: z.string().max(200_000).default(""),
  dmNotes: z.string().max(200_000).default(""),
  visibility: visibilitySchema.default("public"),
  tags: z.array(z.string().trim().min(1).max(80)).max(60).default([]),
  fields: z.record(z.string(), z.string().max(5_000)).default({}),
  parentId: z.string().uuid().nullable().default(null),
});

export type EntryInput = z.infer<typeof entryInputSchema>;

export const rollTableItemSchema = z.object({
  min: z.number().int().min(0).max(10_000),
  max: z.number().int().min(0).max(10_000),
  result: z.string().trim().min(1).max(2_000),
});

export const rollTableInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000).default(""),
  dice: z
    .string()
    .trim()
    .regex(/^\d{0,3}d\d{1,4}([+-]\d{1,4})?$/i, "Use dice notation like 1d20 or 2d6+1")
    .default("1d20"),
  items: z.array(rollTableItemSchema).max(500).default([]),
  visibility: visibilitySchema.default("secret"),
});

export type RollTableInput = z.infer<typeof rollTableInputSchema>;

/**
 * Parses the `fields[...]` and `tags` conventions used by the entry form.
 * Empty values are dropped so a blank input never creates a hollow property.
 */
export function parseEntryForm(form: FormData) {
  const fields: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    const m = key.match(/^fields\[(.+)\]$/);
    if (!m || typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) fields[m[1]] = trimmed;
  }

  const tags = String(form.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const parentId = String(form.get("parentId") ?? "").trim();

  return entryInputSchema.safeParse({
    name: String(form.get("name") ?? ""),
    kind: String(form.get("kind") ?? "note"),
    summary: String(form.get("summary") ?? ""),
    body: String(form.get("body") ?? ""),
    dmNotes: String(form.get("dmNotes") ?? ""),
    visibility: String(form.get("visibility") ?? "public"),
    tags,
    fields,
    parentId: parentId || null,
  });
}
