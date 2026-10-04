import Link from "next/link";
import { parseRelationValue } from "@/lib/links";
import type { WikiLinkResolver } from "@/lib/markdown";

/**
 * A property that names other pages ("Found in"), as links where this reader may
 * open the page and as plain text everywhere else. It uses the same resolver as
 * `[[body links]]`, which only knows pages the reader can read, so a secret,
 * ungranted or archived place never becomes a link, a tooltip or a path.
 */
export function LinkedNames({ value, resolve }: { value: string; resolve: WikiLinkResolver }) {
  const parts = parseRelationValue(value);
  return (
    <>
      {parts.map(({ name, label }, i) => {
        const hit = resolve(name);
        return (
          <span key={`${name}-${i}`}>
            {hit ? (
              <Link href={`/codex/entry/${hit.slug}`} className="text-link underline-offset-4 hover:underline">
                {label}
              </Link>
            ) : (
              label
            )}
            {i < parts.length - 1 ? ", " : null}
          </span>
        );
      })}
    </>
  );
}
