/**
 * Static, content-shaped loading placeholder. Deliberately no animation —
 * a plain low-contrast block that matches the real content's dimensions is
 * enough to stop a cold navigation from reading as a hang, without adding a
 * spinner or a keyframe animation.
 *
 * Scoped to routes that never call notFound(): a `loading.tsx` sibling
 * forces Next to stream — flushing a 200 status shell before the page body
 * runs — so a route that can 404 (any /codex/[kindSlug] or
 * /codex/entry/[slug] page) must not get one, or notFound() silently stops
 * setting the real HTTP status. See PLAN.md's login-polish notes for how
 * this was found.
 */
export function SkeletonBar({
  width,
  height = "1rem",
  style,
}: {
  width: string;
  height?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 6,
        background: "var(--bg-sunken)",
        ...style,
      }}
    />
  );
}
