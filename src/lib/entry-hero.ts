import type { EntryKind } from "@/db/schema";

/**
 * Kinds whose page opens with a hero card (portrait slot plus an infobox), and
 * which of their properties form the infobox. Everything else about the entry
 * stays in the ordinary properties card.
 */
export const HERO_INFOBOX: Partial<Record<EntryKind, readonly string[]>> = {
  npc: ["race", "gender", "role", "location", "attitude"],
  deity: ["pantheon", "rank", "alignment", "domains", "symbol"],
};

export const PORTRAIT_FIELD = "portrait";

/**
 * A portrait is shown only when it is a path on this site ("/portraits/x.png")
 * or an https address. Anything else (javascript:, data:, protocol-relative
 * "//host") is dropped, so a property can never inject a script or a tracker
 * over plain http.
 */
export function safePortraitUrl(value: string | undefined | null): string | null {
  const url = (value ?? "").trim();
  if (!url) return null;
  if (/^\/(?!\/)[^\s"'<>]*$/.test(url)) return url;
  if (/^https:\/\/[^\s"'<>]+$/i.test(url)) return url;
  return null;
}

export function initialsOf(name: string): string {
  const words = name.replace(/^the\s+/i, "").split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
