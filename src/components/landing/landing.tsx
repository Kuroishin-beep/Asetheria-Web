"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDown, Compass, Hammer } from "lucide-react";
import { FadeIn } from "@/components/motion/fade-in";
import { SlideUp } from "@/components/motion/slide-up";
import { EmpireBanner, HearthHills, MapUnrolls, RoadAtDawn, SeaGate } from "@/components/landing/scenes";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PUBLIC_EMPIRES } from "@/lib/character/public-options";

/** Scenes below the first screen play when they scroll into view, once. */
const inView = { animate: undefined, whileInView: "visible", viewport: { once: true, margin: "-80px" } } as const;

/** One scene with a heading and a few words, laid out so the text never sits on the art. */
function Chapter({ id, title, children, art }: { id: string; title: string; children: ReactNode; art?: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-6">
      {art && <FadeIn {...inView}>{art}</FadeIn>}
      <SlideUp {...inView} className="mx-auto max-w-2xl text-center">
        <h2 id={id} className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h2>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">{children}</p>
      </SlideUp>
    </section>
  );
}

/**
 * The public front page of Asetheria: a hero, three scenes, the three empires,
 * a map that unrolls into a call to forge a hero, and finally the door into the
 * codex (the party password and the DM sign-in), passed in as `door`.
 *
 * Everything on it is written for it. It reads no codex data, so it shows a
 * stranger nothing that is not meant to be public.
 */
export function Landing({ door }: { door: ReactNode }) {
  return (
    <>
    <main className="mx-auto grid max-w-5xl gap-20 px-4 py-8 sm:py-12">
      <a href="#door" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:ring-2 focus:ring-ring">
        Skip to the door
      </a>

      <header className="grid gap-8" data-testid="landing-hero">
        <FadeIn>
          <RoadAtDawn />
        </FadeIn>
        <SlideUp className="mx-auto max-w-3xl text-center">
          <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full border border-border bg-card text-gold shadow-sm">
            <Compass aria-hidden="true" className="size-6" />
          </span>
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">The Continent of Asetheria</h1>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Three empires, a thousand old gods, and a road that does not end where the map does. Step into the codex, or forge a hero and walk it.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <a href="#door" data-testid="cta-enter">
                <ArrowDown aria-hidden="true" />
                Enter the codex
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/create-character" data-testid="cta-forge">
                <Hammer aria-hidden="true" />
                Forge a hero
              </Link>
            </Button>
          </div>
        </SlideUp>
      </header>

      <Chapter id="chapter-road" title="Every road starts somewhere">
        Mist on the high passes, a caravan on the plateau, a lamp in a window. Asetheria has quarrelled with itself for a thousand years, and the roads are what is left of peace.
      </Chapter>

      <Chapter id="chapter-hearth" title="Somewhere warm to come back to" art={<HearthHills />}>
        Not every story is a quest. Some begin with a round green door in a hillside and a kettle on the fire, until somebody knocks.
      </Chapter>

      <Chapter id="chapter-sea" title="The sea has opinions" art={<SeaGate />}>
        The harbour cities of Hellenoria face the water, and the water answers back: storms that keep a timetable, fog that knows your name, and lighthouses that guide you or do not.
      </Chapter>

      <section aria-labelledby="empires-title" className="grid gap-6" data-testid="landing-empires" data-scene="empires">
        <SlideUp {...inView} className="mx-auto max-w-2xl text-center">
          <h2 id="empires-title" className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Three empires, one continent
          </h2>
        </SlideUp>
        <ul className="grid gap-4 sm:grid-cols-3">
          {PUBLIC_EMPIRES.map((e, i) => {
            return (
              <li key={e.id}>
                <SlideUp {...inView} transition={{ delay: i * 0.12 }} className="h-full">
                  <Card className="h-full text-center">
                    <CardContent className="grid justify-items-center gap-3">
                      <EmpireBanner emblem={e.id as "imperium-invicta" | "hellenoria" | "acheaoria"} />
                      <h3 className="font-display text-lg font-bold tracking-tight">{e.name}</h3>
                      <p className="text-sm leading-relaxed text-muted-foreground">{e.summary}</p>
                    </CardContent>
                  </Card>
                </SlideUp>
              </li>
            );
          })}
        </ul>
      </section>

      <Chapter id="chapter-map" title="Your road is not drawn yet" art={<MapUnrolls />}>
        Choose a heritage, a calling and a god, or none of them, and we will write the first line of the story with you.
        <span className="mt-5 flex justify-center">
          <Button asChild size="lg">
            <Link href="/create-character">
              <Hammer aria-hidden="true" />
              Forge a hero
            </Link>
          </Button>
        </span>
      </Chapter>

      <section id="door" aria-labelledby="door-title" className="mx-auto grid w-full max-w-xl gap-4 scroll-mt-8">
        <SlideUp {...inView} className="text-center">
          <h2 id="door-title" className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            The door is open
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">Two doors into the codex. Choose yours.</p>
        </SlideUp>
        {door}
      </section>

    </main>
      <footer className="mx-auto max-w-5xl px-4 pb-6 text-center text-xs text-faint-foreground">Vincit qui se vincit</footer>
    </>
  );
}
