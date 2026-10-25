"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { ArrowDown, ChevronLeft, ChevronRight, Hammer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Five views of the continent the hero's map pans between. Each is a focal
 * point on the DM's map (0 to 1 across and down) and how far to lean in. The
 * names are the three empires, which the page names on purpose, and plain
 * descriptions; no city from the codex is spelled out here.
 */
export const VIEWS = [
  { label: "The whole continent", note: "Three empires around an inland sea", x: 0.5, y: 0.5, scale: 1.04 },
  { label: "Imperium Invicta", note: "The western empire of roads and law", x: 0.28, y: 0.7, scale: 1.85 },
  { label: "Hellenoria", note: "The harbour league of the north", x: 0.27, y: 0.27, scale: 1.85 },
  { label: "Acheaoria", note: "The plateau empire of the east", x: 0.8, y: 0.55, scale: 1.85 },
  { label: "The inland sea", note: "Where the three coasts meet", x: 0.56, y: 0.62, scale: 2.05 },
] as const;

/**
 * Where a view's focal point should land on screen: the open right side, clear
 * of the title. Scaling from the top-left corner and translating puts the
 * focal point there, clamped so the map always covers the whole frame.
 */
const LAND = { x: 0.68, y: 0.5 };
function placement(v: (typeof VIEWS)[number]) {
  const clamp = (t: number) => Math.min(0, Math.max(1 - v.scale, t));
  return {
    scale: v.scale,
    x: `${(clamp(LAND.x - v.scale * v.x) * 100).toFixed(2)}%`,
    y: `${(clamp(LAND.y - v.scale * v.y) * 100).toFixed(2)}%`,
  };
}

/** How long each view holds before the map moves on, when motion is allowed. */
const HOLD_MS = 7000;

const pad = (n: number) => String(n).padStart(2, "0");

/** The meta line under the title: what this is, at a glance. */
const META = ["Three empires", "A thousand old gods", "D&D 5e"];

export function LandingHero() {
  const reduced = useReducedMotion() ?? false;
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { amount: 0.3 });
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const view = VIEWS[index];
  const auto = !reduced && inView && !paused;

  const go = useCallback((step: number) => setIndex((i) => (i + step + VIEWS.length) % VIEWS.length), []);

  // Advance on a timer only while the hero is on screen, the visitor is not
  // hovering or focused inside it, and motion is allowed.
  useEffect(() => {
    if (!auto) return;
    const t = window.setTimeout(() => go(1), HOLD_MS);
    return () => window.clearTimeout(t);
  }, [auto, index, go]);

  return (
    <header
      ref={ref}
      className="relative isolate flex min-h-svh flex-col overflow-hidden bg-background"
      data-testid="landing-hero"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* The DM's map, panning between the empires. Transform only. */}
      <div className="absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <motion.div
          className="absolute inset-0 origin-top-left"
          initial={false}
          animate={placement(view)}
          transition={reduced ? { duration: 0 } : { duration: 2.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <Image
            src="/landing/continent.webp"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-[60%_50%] opacity-60 saturate-[0.85]"
          />
        </motion.div>
        {/* A neutral scrim so the title always reads over the map. */}
        <div className="absolute inset-0 bg-background/55" />
        <div className="absolute inset-y-0 left-0 w-full bg-linear-to-r from-background via-background/80 to-transparent md:w-3/4" />
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-background to-transparent" />
      </div>

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 sm:px-8">
        <div className="flex items-center justify-between py-6">
          <p className="font-[family-name:var(--font-landing-display)] text-lg font-extrabold uppercase tracking-tight [font-stretch:125%]">
            Asetheria
          </p>
          <p className="text-sm text-muted-foreground">A campaign codex</p>
        </div>

        <div className="flex flex-1 flex-col justify-center py-12">
          {/* Readable from the first paint: the title only slides, never fades in. */}
          <motion.div
            initial={reduced ? false : { y: 24 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-4xl"
          >
            <p className="mb-6 text-sm font-semibold text-gold">A Dungeons &amp; Dragons world in three empires</p>
            <h1 className="font-[family-name:var(--font-landing-display)] text-[10.5vw] leading-[0.92] font-black uppercase tracking-[-0.02em] text-balance [font-stretch:125%] sm:text-7xl lg:text-8xl">
              The Continent{" "}
              <span className="font-[family-name:var(--font-landing-serif)] font-medium normal-case tracking-normal text-gold [font-stretch:100%]">
                of
              </span>{" "}
              Asetheria
            </h1>

            <ul className="mt-8 flex flex-wrap items-center gap-2 text-sm text-muted-foreground" aria-label="At a glance">
              {META.map((m) => (
                <li key={m} className="bg-foreground/10 px-3 py-1 text-foreground">
                  {m}
                </li>
              ))}
            </ul>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-foreground">
              Three empires, a thousand old gods, and a road that does not end where the map does. Step into the codex, or forge a hero and walk it.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild variant="ghost" size="lg" className="h-12 rounded-none bg-gold px-6 text-base font-semibold text-background hover:bg-gold-soft hover:text-background active:scale-[0.98]">
                <a href="#door" data-testid="cta-enter">
                  <ArrowDown aria-hidden="true" />
                  Enter the codex
                </a>
              </Button>
              <Button asChild variant="ghost" size="lg" className="h-12 rounded-none bg-foreground/10 px-6 text-base text-foreground hover:bg-foreground/20 active:scale-[0.98]">
                <Link href="/create-character" data-testid="cta-forge">
                  <Hammer aria-hidden="true" />
                  Forge a hero
                </Link>
              </Button>
            </div>
          </motion.div>
        </div>

        {/* The view counter: which part of the continent the map is showing. */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4 pb-12" data-testid="hero-views">
          <p className="font-[family-name:var(--font-landing-display)] text-xl font-bold tabular-nums [font-stretch:110%]" aria-live="polite">
            <span className="text-foreground">{pad(index + 1)}</span>
            <span className="text-muted-foreground"> / {pad(VIEWS.length)}</span>
            <span className="sr-only">: {view.label}</span>
          </p>
          <div className="relative h-1 w-32 overflow-hidden bg-foreground/15 sm:w-48" aria-hidden="true">
            <motion.div
              key={`${index}-${auto}`}
              className="absolute inset-0 origin-left bg-gold"
              initial={{ scaleX: auto ? 0 : 1 }}
              animate={{ scaleX: 1 }}
              transition={auto ? { duration: HOLD_MS / 1000, ease: "linear" } : { duration: 0 }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={view.label}
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: 0.35 }}
                className="text-sm"
              >
                <span className="font-semibold text-foreground">{view.label}</span>
                <span className="text-muted-foreground">. {view.note}</span>
              </motion.p>
            </AnimatePresence>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon-lg" className={cn("rounded-none bg-foreground/10 hover:bg-foreground/20")} onClick={() => go(-1)} aria-label="Previous view of the map">
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="icon-lg" className="rounded-none bg-foreground/10 hover:bg-foreground/20" onClick={() => go(1)} aria-label="Next view of the map">
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
