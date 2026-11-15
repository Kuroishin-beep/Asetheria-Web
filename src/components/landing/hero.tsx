"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { ArrowDown, Hammer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The hero painting: Albert Bierstadt, "Among the Sierra Nevada, California"
 * (1868), public domain (Smithsonian American Art Museum, via Wikimedia
 * Commons). Mist, light falling through a gorge, dark trees framing the near
 * shore: the mood of a world first seen from its edge. It is a dark scene in
 * both themes, so the hero uses the fixed `veil` tokens rather than the
 * theme's background and ink.
 */
export const HERO_ART = {
  src: "/landing/sierra.webp",
  credit: "Albert Bierstadt, Among the Sierra Nevada, 1868",
} as const;

/** The meta line under the title: what this is, at a glance. */
const META = ["Three empires", "A thousand old gods", "D&D 5e"];

/** How far the painting drifts while the hero scrolls away (a slow parallax, transform only). */
const DRIFT: { y: string[]; scale: number[] } = { y: ["0%", "12%"], scale: [1.06, 1.12] };

export function LandingHero() {
  const reduced = useReducedMotion() ?? false;
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], DRIFT.y);
  const scale = useTransform(scrollYProgress, [0, 1], DRIFT.scale);

  return (
    <header
      ref={ref}
      className="relative isolate flex min-h-svh flex-col overflow-hidden bg-veil text-veil-ink"
      data-testid="landing-hero"
    >
      {/* The painting, drifting a little as the page scrolls. Transform only. */}
      <div className="absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <motion.div className="absolute inset-0" style={reduced ? { scale: DRIFT.scale[0] } : { y, scale }}>
          <Image
            src={HERO_ART.src}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-[62%_40%] saturate-[0.9]"
          />
        </motion.div>
        {/* A warm scrim: dense behind the title, thinning toward the light in the gorge. */}
        <div className="absolute inset-0 bg-linear-to-r from-veil via-veil/70 to-veil/10" />
        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-linear-to-t from-veil to-transparent" />
        <div className="absolute inset-x-0 top-0 h-32 bg-linear-to-b from-veil/70 to-transparent" />
      </div>

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 sm:px-8">
        <div className="flex items-center justify-between py-6">
          <p className="font-display text-lg font-semibold uppercase tracking-[0.18em]">Asetheria</p>
          <p className="text-sm text-veil-ink/75">A campaign codex</p>
        </div>

        <div className="flex flex-1 flex-col justify-center py-12">
          {/* Readable from the first paint: the title only slides, never fades in. */}
          <motion.div
            initial={reduced ? false : { y: 24 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-4xl"
          >
            <p className="mb-6 text-sm font-semibold tracking-wide text-veil-accent">A Dungeons &amp; Dragons world in three empires</p>
            <h1 className="font-display text-[11vw] leading-[0.98] font-semibold uppercase tracking-[0.01em] text-balance drop-shadow-lg sm:text-7xl lg:text-8xl">
              The Continent{" "}
              <span className="font-[family-name:var(--font-landing-serif)] font-medium normal-case italic tracking-normal text-veil-accent">
                of
              </span>{" "}
              Asetheria
            </h1>

            <ul className="mt-8 flex flex-wrap items-center gap-2 text-sm" aria-label="At a glance">
              {META.map((m) => (
                <li key={m} className="border border-veil-ink/20 bg-veil/50 px-3 py-1 text-veil-ink">
                  {m}
                </li>
              ))}
            </ul>

            <p className="mt-6 max-w-xl font-[family-name:var(--font-landing-serif)] text-xl leading-relaxed text-veil-ink/90">
              Three empires, a thousand old gods, and a road that does not end where the map does. Step into the codex, or forge a hero and walk it.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild variant="ghost" size="lg" className="h-12 rounded-none bg-veil-accent px-6 text-base font-semibold text-veil hover:bg-veil-ink hover:text-veil active:scale-[0.98]">
                <a href="#door" data-testid="cta-enter">
                  <ArrowDown aria-hidden="true" />
                  Enter the codex
                </a>
              </Button>
              <Button asChild variant="ghost" size="lg" className="h-12 rounded-none border border-veil-ink/30 bg-veil/40 px-6 text-base text-veil-ink hover:bg-veil-ink/15 hover:text-veil-ink active:scale-[0.98]">
                <Link href="/create-character" data-testid="cta-forge">
                  <Hammer aria-hidden="true" />
                  Forge a hero
                </Link>
              </Button>
            </div>
          </motion.div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4 pb-10 text-xs text-veil-ink/70" data-testid="hero-credit">
          <p>
            <span className="sr-only">Painting: </span>
            {HERO_ART.credit}
          </p>
          <a href="#door" className="inline-flex items-center gap-2 uppercase tracking-[0.2em] hover:text-veil-ink">
            Scroll
            <ArrowDown className="size-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>
    </header>
  );
}
