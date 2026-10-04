/**
 * "Recently viewed": the slugs of the last few pages this person opened, kept
 * in this browser. It is a per-viewer convenience, so it lives in localStorage
 * and is keyed by user id, which means two people sharing a browser never see
 * each other's trail. Slugs are the only thing stored; names and summaries are
 * always fetched fresh through `/api/recent`, which re-checks access, so a page
 * that has since been hidden or archived simply drops out.
 */

export const RECENT_LIMIT = 8;
const KEY_PREFIX = "asetheria:recent:";

const keyFor = (userId: string) => `${KEY_PREFIX}${userId}`;

function isSlug(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,200}$/.test(value);
}

/** Newest first. Never throws: storage can be blocked, full, or hold something else. */
export function readRecent(userId: string): string[] {
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isSlug).slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
}

export function recordRecent(userId: string, slug: string): void {
  if (!isSlug(slug)) return;
  try {
    const next = [slug, ...readRecent(userId).filter((s) => s !== slug)].slice(0, RECENT_LIMIT);
    window.localStorage.setItem(keyFor(userId), JSON.stringify(next));
  } catch {
    // Storage is unavailable; the trail just isn't kept.
  }
}
