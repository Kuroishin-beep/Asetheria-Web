"use client";

import { motion } from "motion/react";
import { still, useScene } from "@/components/landing/use-scene";
import { cn } from "@/lib/utils";

/**
 * The landing page's remaining vector art: the three empires' banners, original
 * drawings in the theme's own colours. (The chapter scenes are public-domain
 * paintings now; see painted.tsx.) Decoration only: hidden from assistive
 * technology, motion only on transform, loops only while on screen, and still
 * under reduced motion.
 */

// ---------------------------------------------------------------------------
// 4. The empires' banners: a cloth on a pole that stirs in a breeze
// ---------------------------------------------------------------------------

const loop = { repeat: Infinity, ease: "easeInOut", repeatType: "reverse" } as const;

export type Emblem = "imperium-invicta" | "hellenoria" | "acheaoria";
const BANNER_FILL: Record<Emblem, string> = { "imperium-invicta": "fill-chart-4", hellenoria: "fill-chart-2", acheaoria: "fill-chart-1" };

export function EmpireBanner({ emblem, className }: { emblem: Emblem; className?: string }) {
  const { ref, motionOn } = useScene();
  return (
    <div ref={ref} className={cn("mx-auto w-28", className)} data-banner={emblem}>
      <svg viewBox="0 0 120 150" className="block h-auto w-full" aria-hidden="true" focusable="false">
        <rect x="14" y="8" width="5" height="138" rx="2" className="fill-chart-5" />
        <circle cx="16.5" cy="8" r="6" className="fill-primary" />
        <motion.g style={{ originX: "19px", originY: "30px" }} animate={motionOn ? { skewY: [-3.5, 3.5], scaleX: [1, 0.96] } : { skewY: 0, scaleX: 1 }} transition={still(motionOn, { duration: 3.2, ...loop })}>
          <path d="M19 22 L108 22 L108 112 L63 96 L19 112 Z" className={BANNER_FILL[emblem]} />
          {emblem === "imperium-invicta" && (
            <g className="fill-card" opacity={0.92}>
              <rect x="46" y="44" width="7" height="42" />
              <rect x="64" y="44" width="7" height="42" />
              <rect x="82" y="44" width="7" height="42" />
              <rect x="40" y="38" width="55" height="7" />
            </g>
          )}
          {emblem === "hellenoria" && (
            <g fill="none" className="stroke-card" strokeWidth={5} strokeLinecap="round" opacity={0.92}>
              <path d="M34 56 q 10 -12 20 0 t 20 0 t 20 0" />
              <path d="M34 74 q 10 -12 20 0 t 20 0 t 20 0" />
            </g>
          )}
          {emblem === "acheaoria" && (
            <g className="fill-card" opacity={0.92}>
              <circle cx="63" cy="64" r="15" />
              {Array.from({ length: 8 }, (_, i) => (
                <rect key={i} x="61" y="36" width="4" height="9" rx="2" transform={`rotate(${i * 45} 63 64)`} />
              ))}
            </g>
          )}
        </motion.g>
      </svg>
    </div>
  );
}
