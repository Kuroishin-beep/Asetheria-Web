"use client";

import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { Dices } from "lucide-react";
import { cn } from "@/lib/utils";

const GOLD_LINE = ["Roll the dice", "Walk the road", "Three empires", "One continent"];
const DARK_LINE = ["Imperium Invicta", "Hellenoria", "Acheaoria", "A thousand old gods"];

/** One band of words that slides sideways forever, only while it is on screen. */
function Band({ words, reverse, className, run }: { words: string[]; reverse?: boolean; className: string; run: boolean }) {
  // Two copies side by side, so sliding by exactly half loops without a seam.
  const row = [...words, ...words, ...words];
  return (
    <div className={cn("flex w-max select-none", className)}>
      <motion.div
        className="flex shrink-0"
        animate={run ? { x: reverse ? ["-50%", "0%"] : ["0%", "-50%"] } : { x: "0%" }}
        transition={run ? { duration: 38, ease: "linear", repeat: Infinity } : { duration: 0 }}
      >
        {[0, 1].map((copy) => (
          <span key={copy} className="flex shrink-0 items-center" aria-hidden={copy === 1 ? true : undefined}>
            {row.map((w, i) => (
              <span key={`${w}-${i}`} className="flex items-center gap-6 px-6">
                <span className="font-display text-2xl font-semibold uppercase tracking-[0.04em] sm:text-3xl">
                  {w}
                </span>
                <Dices aria-hidden="true" className="size-6 shrink-0" />
              </span>
            ))}
          </span>
        ))}
      </motion.div>
    </div>
  );
}

/**
 * Two crossing bands under the hero, after the tilted tape of a festival
 * poster. Decoration: the words repeat what the page already says, so the
 * whole thing is hidden from assistive technology.
 */
export function Ribbons() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "100px" });
  const reduced = useReducedMotion() ?? false;
  const run = inView && !reduced;
  return (
    <div ref={ref} className="relative h-48 overflow-hidden sm:h-56" aria-hidden="true" data-testid="landing-ribbons">
      <div className="absolute inset-x-[-10%] top-12 -rotate-3">
        <Band words={DARK_LINE} reverse run={run} className="bg-card py-3 text-foreground" />
      </div>
      <div className="absolute inset-x-[-10%] top-24 rotate-2">
        <Band words={GOLD_LINE} run={run} className="bg-gold py-3 text-background" />
      </div>
    </div>
  );
}
