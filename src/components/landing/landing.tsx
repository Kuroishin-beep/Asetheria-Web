"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { motion } from "motion/react";
import { ChevronRight, Hammer } from "lucide-react";
import { LandingHero } from "@/components/landing/hero";
import { Ribbons } from "@/components/landing/ribbons";
import { EmpireBanner, HearthHills, MapUnrolls, RoadAtDawn, SeaGate, type Emblem } from "@/components/landing/scenes";
import { Button } from "@/components/ui/button";
import { PUBLIC_EMPIRES } from "@/lib/character/public-options";
import { cn } from "@/lib/utils";

/** Parts rise into place once, as their section scrolls into view. */
const rise = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
} as const;
const riseAt = (i: number) => ({ ...rise, transition: { duration: 0.6, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] } }) as const;

const display = "font-[family-name:var(--font-landing-display)] font-black uppercase [font-stretch:125%]";

/** A section's heading: wide, heavy, uppercase, with the cinematic tracking. */
function SectionTitle({ id, children, note }: { id: string; children: ReactNode; note: ReactNode }) {
  return (
    <motion.div {...riseAt(0)} className="mb-10 grid gap-3 md:grid-cols-[1fr_minmax(0,28rem)] md:items-end md:gap-12">
      <h2 id={id} className={cn(display, "text-3xl leading-[0.95] tracking-[-0.02em] text-balance sm:text-5xl")}>
        {children}
      </h2>
      <p className="text-base leading-relaxed text-muted-foreground md:pb-1">{note}</p>
    </motion.div>
  );
}

/** "Read more" leads to the door: the full story is inside the codex. */
function ReadMore({ label }: { label: string }) {
  return (
    <a href="#door" className="inline-flex items-center gap-1 text-sm font-semibold text-gold underline-offset-4 hover:underline">
      Read more <span className="sr-only">about {label}</span>
      <ChevronRight aria-hidden="true" className="size-4" />
    </a>
  );
}

/** One dispatch card: the art on top, then the category line, title, excerpt and byline. */
function Dispatch({
  id,
  category,
  title,
  art,
  children,
  byline,
  index,
}: {
  id: string;
  category: string;
  title: string;
  art: ReactNode;
  children: ReactNode;
  byline: ReactNode;
  index: number;
}) {
  return (
    <motion.section
      aria-labelledby={id}
      {...riseAt(index)}
      whileHover={{ y: -6 }}
      className="group flex flex-col overflow-hidden rounded-3xl bg-card ring-1 ring-foreground/10 transition-colors hover:ring-gold/40"
    >
      <div className="overflow-hidden">{art}</div>
      <div className="flex flex-1 flex-col gap-3 p-6">
        <p className="text-sm text-muted-foreground">{category}</p>
        <h3 id={id} className="text-xl leading-snug font-bold tracking-tight text-foreground">
          {title}
        </h3>
        <p className="text-base leading-relaxed text-muted-foreground">{children}</p>
        <div className="mt-auto pt-2">
          <ReadMore label={title} />
        </div>
        <div className="flex items-center gap-3 pt-2 text-sm text-muted-foreground">{byline}</div>
      </div>
    </motion.section>
  );
}

/** Where on the DM's map each empire sits: the card zooms in around that point. */
const EMPIRE_CROP: Record<Emblem, { focus: string; direction: string }> = {
  "imperium-invicta": { focus: "origin-[18%_78%]", direction: "The west" },
  hellenoria: { focus: "origin-[24%_22%]", direction: "The north" },
  acheaoria: { focus: "origin-[88%_55%]", direction: "The east" },
};

/** The three emblems side by side, as the byline's "avatars". */
function Emblems() {
  return (
    <span className="flex -space-x-3" aria-hidden="true">
      {(["imperium-invicta", "hellenoria", "acheaoria"] as const).map((e) => (
        <span key={e} className="grid size-8 place-items-center overflow-hidden rounded-full bg-muted ring-2 ring-card">
          <EmpireBanner emblem={e} className="w-6" />
        </span>
      ))}
    </span>
  );
}

/**
 * The public front page of Asetheria, in the manner of a streaming service's
 * front page: a cinematic hero over the DM's own map of the continent, tilted
 * ribbons, dispatches from the road as story cards, the three empires cropped
 * from the map, a call to forge a hero, and finally the door into the codex
 * (the party password and the DM sign-in), passed in as `door`.
 *
 * Everything on it is written for it. It reads no codex data, so it shows a
 * stranger nothing that is not meant to be public.
 */
export function Landing({ door }: { door: ReactNode }) {
  return (
    <div data-theme="dark" className="min-h-svh bg-background text-foreground">
      <a
        href="#door"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:bg-card focus:px-3 focus:py-2 focus:ring-2 focus:ring-ring"
      >
        Skip to the door
      </a>

      <LandingHero />
      <Ribbons />

      <main className="mx-auto grid max-w-7xl gap-32 px-4 pt-16 pb-24 sm:px-8 sm:gap-40">
        <section aria-labelledby="dispatches-title">
          <SectionTitle id="dispatches-title" note="Three short dispatches from the roads, the hills and the harbours. The full stories are inside the codex.">
            Tales from the road
          </SectionTitle>
          <div className="grid gap-6 md:grid-cols-3">
            <Dispatch
              id="chapter-road"
              index={0}
              category="The roads | Travel"
              title="Every road starts somewhere"
              art={<RoadAtDawn className="rounded-none ring-0" />}
              byline={<><Emblems /><span>Chapter one</span></>}
            >
              Mist on the high passes, a caravan on the plateau, a lamp in a window. Asetheria has quarrelled with itself for a thousand years, and the roads are what is left of peace.
            </Dispatch>
            <Dispatch
              id="chapter-hearth"
              index={1}
              category="The hills | Hearth and home"
              title="Somewhere warm to come back to"
              art={<HearthHills className="rounded-none ring-0" />}
              byline={<><Emblems /><span>Chapter two</span></>}
            >
              Not every story is a quest. Some begin with a round green door in a hillside and a kettle on the fire, until somebody knocks.
            </Dispatch>
            <Dispatch
              id="chapter-sea"
              index={2}
              category="The harbours | Sea and storm"
              title="The sea has opinions"
              art={<SeaGate className="rounded-none ring-0" />}
              byline={<><Emblems /><span>Chapter three</span></>}
            >
              The harbour cities of Hellenoria face the water, and the water answers back: storms that keep a timetable, fog that knows your name, and lighthouses that guide you or do not.
            </Dispatch>
          </div>
        </section>

        <section aria-labelledby="empires-title" data-testid="landing-empires" data-scene="empires">
          <SectionTitle id="empires-title" note="Each is cut from the same map the party plays on: west, north and east around an inland sea.">
            Three empires, one continent
          </SectionTitle>
          <ul className="grid gap-6 md:grid-cols-3">
            {PUBLIC_EMPIRES.map((e, i) => {
              const emblem = e.id as Emblem;
              const crop = EMPIRE_CROP[emblem];
              return (
                <motion.li key={e.id} {...riseAt(i)} whileHover={{ y: -6 }} className="group flex flex-col overflow-hidden rounded-3xl bg-card ring-1 ring-foreground/10 transition-colors hover:ring-gold/40">
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <Image
                      src="/landing/continent.webp"
                      alt=""
                      fill
                      sizes="(min-width: 768px) 33vw, 100vw"
                      className={cn("scale-[2.6] object-cover transition-transform duration-700 group-hover:scale-[2.8]", crop.focus)}
                    />
                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-card to-transparent" />
                    <EmpireBanner emblem={emblem} className="absolute right-6 bottom-0 w-14" />
                  </div>
                  <div className="flex flex-1 flex-col gap-3 p-6">
                    <p className="text-sm text-muted-foreground">Empire | {crop.direction}</p>
                    <h3 className="text-xl leading-snug font-bold tracking-tight">{e.name}</h3>
                    <p className="text-base leading-relaxed text-muted-foreground">{e.summary}</p>
                    <div className="mt-auto pt-2">
                      <ReadMore label={e.name} />
                    </div>
                  </div>
                </motion.li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="chapter-map" className="grid items-center gap-10 overflow-hidden rounded-3xl bg-card p-6 ring-1 ring-foreground/10 sm:p-10 lg:grid-cols-2">
          <motion.div {...riseAt(0)}>
            <MapUnrolls className="ring-0" />
          </motion.div>
          <motion.div {...riseAt(1)}>
            <h2 id="chapter-map" className={cn(display, "text-3xl leading-[0.95] tracking-[-0.02em] text-balance sm:text-5xl")}>
              Your road is not drawn yet
            </h2>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-foreground">
              Choose a heritage, a calling and a god, or none of them, and we will write the first line of the story with you.
            </p>
            <Button asChild variant="ghost" size="lg" className="mt-8 h-12 rounded-none bg-gold px-6 text-base font-semibold text-background hover:bg-gold-soft hover:text-background active:scale-[0.98]">
              <Link href="/create-character">
                <Hammer aria-hidden="true" />
                Forge a hero
              </Link>
            </Button>
          </motion.div>
        </section>

        <section id="door" aria-labelledby="door-title" className="grid scroll-mt-8 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:items-start">
          <motion.div {...riseAt(0)}>
            <h2 id="door-title" className={cn(display, "text-3xl leading-[0.95] tracking-[-0.02em] sm:text-5xl")}>
              The door is open
            </h2>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-foreground">
              Two doors into the codex. The party reads everything it has uncovered; the Dungeon Master holds the pen.
            </p>
          </motion.div>
          <motion.div {...riseAt(1)}>{door}</motion.div>
        </section>
      </main>

      <footer className="overflow-hidden px-4 pb-10 sm:px-8">
        <p className={cn(display, "text-center text-[11vw] leading-none tracking-[-0.04em] text-foreground/40 select-none")} aria-hidden="true">
          Asetheria
        </p>
        <div className="mx-auto mt-6 flex max-w-7xl flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
          <p className="font-[family-name:var(--font-landing-serif)] text-lg text-foreground italic">Vincit qui se vincit</p>
          <p>Map of the continent drawn by the Dungeon Master for this campaign.</p>
        </div>
      </footer>
    </div>
  );
}
