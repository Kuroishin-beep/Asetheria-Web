import { Card, CardContent } from "@/components/ui/card";
import { Eyebrow } from "@/components/shared/eyebrow";
import { initialsOf, safePortraitUrl } from "@/lib/entry-hero";

type Fact = { key: string; label: string; value: string };

/**
 * The top of an NPC or deity page: a portrait slot beside an infobox built from
 * the entry's own properties. With no portrait set, the slot shows the name's
 * initials, so the layout never has a hole in it.
 */
export function EntryHero({
  name,
  portrait,
  facts,
}: {
  name: string;
  portrait: string | undefined;
  facts: Fact[];
}) {
  const src = safePortraitUrl(portrait);
  return (
    <Card size="sm" className="mb-6" data-testid="entry-hero">
      <CardContent className="grid items-start gap-5 sm:grid-cols-[7rem_minmax(0,1fr)]">
        <div
          data-testid="portrait-slot"
          className="flex size-28 sm:size-[7rem] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/10"
        >
          {src ? (
            // A plain img on purpose: portraits are DM-supplied paths or https URLs, not optimised assets.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={`Portrait of ${name}`} className="size-full object-cover" loading="lazy" />
          ) : (
            <span aria-label={`No portrait for ${name}`} role="img" className="font-display text-3xl font-bold text-gold">
              {initialsOf(name)}
            </span>
          )}
        </div>
        {facts.length > 0 && (
          <dl className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-3">
            {facts.map((f) => (
              <div key={f.key}>
                <dt>
                  <Eyebrow>{f.label}</Eyebrow>
                </dt>
                <dd className="mt-1 text-[15px] leading-normal">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
