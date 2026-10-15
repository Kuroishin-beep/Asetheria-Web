import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { entryKind, pageTemplates, type EntryKind } from "@/db/schema";
import { ENTRY_TEMPLATES, templateFor, type EntryTemplate } from "@/lib/entry-templates";
import { KINDS } from "@/lib/kinds";
import { splitInline } from "@/lib/secret-blocks";

/**
 * Page templates the DM can edit. The built-in defaults live in code (`entry-templates.ts`) and stay as the
 * fallback; a row here overrides one kind, and deleting the row is "reset to default". A template only
 * decides what the New page starts with, so editing one never changes an existing page.
 */

export const TEMPLATE_LIMIT = 20_000;

export type TemplateRow = {
  kind: EntryKind;
  label: string;
  singular: string;
  body: string;
  dmNotes: string;
  custom: boolean;
  defaultBody: string;
  defaultDmNotes: string;
  updatedAt: string | null;
};

export function isKind(value: string): value is EntryKind {
  return (entryKind.enumValues as readonly string[]).includes(value);
}

/** What a new page of this kind starts with: the DM's version if there is one, else the default. */
export async function getTemplate(kind: EntryKind): Promise<EntryTemplate> {
  const [row] = await db.select().from(pageTemplates).where(eq(pageTemplates.kind, kind)).limit(1);
  return row ? { body: row.body, dmNotes: row.dmNotes } : templateFor(kind);
}

export async function listTemplates(): Promise<TemplateRow[]> {
  const rows = await db.select().from(pageTemplates);
  const byKind = new Map(rows.map((r) => [r.kind, r]));
  return KINDS.map((k) => {
    const mine = byKind.get(k.kind);
    const def = ENTRY_TEMPLATES[k.kind] ?? { body: "", dmNotes: "" };
    return {
      kind: k.kind,
      label: k.label,
      singular: k.singular,
      body: mine ? mine.body : def.body,
      dmNotes: mine ? mine.dmNotes : def.dmNotes,
      custom: !!mine,
      defaultBody: def.body,
      defaultDmNotes: def.dmNotes,
      updatedAt: mine ? mine.updatedAt.toISOString() : null,
    };
  });
}

export type SaveResult = { ok: true } | { ok: false; error: string };

/** Checks a template the way a page is checked: size, and a secret block (Phase 12) must be well formed. */
export function templateProblem(body: string, dmNotes: string): string | null {
  if (body.length > TEMPLATE_LIMIT) return `The description is ${body.length.toLocaleString("en")} characters; the limit is ${TEMPLATE_LIMIT.toLocaleString("en")}.`;
  if (dmNotes.length > TEMPLATE_LIMIT) return `The DM notes are ${dmNotes.length.toLocaleString("en")} characters; the limit is ${TEMPLATE_LIMIT.toLocaleString("en")}.`;
  const split = splitInline(body);
  return split.ok ? null : split.error;
}

export async function saveTemplate(dm: { id: string }, kind: EntryKind, body: string, dmNotes: string): Promise<SaveResult> {
  const problem = templateProblem(body, dmNotes);
  if (problem) return { ok: false, error: problem };
  await db
    .insert(pageTemplates)
    .values({ kind, body, dmNotes, updatedBy: dm.id })
    .onConflictDoUpdate({ target: pageTemplates.kind, set: { body, dmNotes, updatedBy: dm.id, updatedAt: new Date() } });
  return { ok: true };
}

/** Back to the built-in default for this kind. */
export async function resetTemplate(kind: EntryKind): Promise<void> {
  await db.delete(pageTemplates).where(eq(pageTemplates.kind, kind));
}
