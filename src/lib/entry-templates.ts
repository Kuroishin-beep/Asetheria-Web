import type { EntryKind } from "@/db/schema";

/**
 * Starting text for a new entry of each kind. The DM's own headings, ready to
 * fill in, so every NPC or place is written to the same shape. Anything that
 * must stay hidden from players (secrets, hooks) goes in `dmNotes`, which is
 * never sent to a player; the body is visible to whoever can see the entry.
 */
export type EntryTemplate = { body: string; dmNotes: string };

export const ENTRY_TEMPLATES: Partial<Record<EntryKind, EntryTemplate>> = {
  npc: {
    body: "## Appearance\n\n\n\n## Motivation\n\n\n\n## Mannerisms\n\n",
    dmNotes: "## Secrets\n\n\n\n## Hooks\n\n",
  },
  location: {
    body: "## At a glance\n\n\n\n## Who lives here\n\n\n\n## Points of interest\n\n",
    dmNotes: "## Secrets\n\n\n\n## Hooks\n\n",
  },
  organization: {
    body: "## Purpose\n\n\n\n## Structure\n\n\n\n## Known members\n\n",
    dmNotes: "## Secrets\n\n\n\n## Hooks\n\n",
  },
  deity: {
    body: "## Portfolio\n\n\n\n## Worship\n\n\n\n## Myths\n\n",
    dmNotes: "## Secrets\n\n",
  },
};

const BLANK: EntryTemplate = { body: "", dmNotes: "" };

export function templateFor(kind: EntryKind): EntryTemplate {
  return ENTRY_TEMPLATES[kind] ?? BLANK;
}
