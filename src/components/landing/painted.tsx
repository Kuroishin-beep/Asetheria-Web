"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { still, useParallax, useScene } from "@/components/landing/use-scene";
import { cn } from "@/lib/utils";

/**
 * The landing's chapter art: public-domain landscape paintings in the same
 * spirit as the hero (light through mist, ruins, harbours, a home in the
 * hills), plus the DM's own map for the last chapter. Each is credited where
 * it is shown and recorded in docs/content-licences.md.
 */
export const PAINTINGS = {
  road: {
    src: "/landing/road.webp",
    credit: "Thomas Moran, Cliffs of the Upper Colorado River, 1882",
    focus: "object-[50%_60%]",
  },
  hearth: {
    src: "/landing/hearth.webp",
    credit: "Thomas Cole, Home in the Woods, 1847",
    focus: "object-[40%_55%]",
  },
  seagate: {
    src: "/landing/harbour.webp",
    credit: "Claude Lorrain, Seaport with the Embarkation of the Queen of Sheba, 1648",
    focus: "object-[55%_55%]",
  },
  map: {
    src: "/landing/asetheria-map.webp",
    credit: "The continent, drawn by the Dungeon Master",
    focus: "object-[55%_50%]",
  },
} as const;

export type PaintedSceneName = keyof typeof PAINTINGS;

/** How far a painting breathes while on screen: a slow push-in and a small pan. */
const DRIFT = { scale: [1.04, 1.1], x: ["0%", "-2%"] };
const DRIFT_REST = { scale: 1.04, x: "0%" };
const DRIFT_LOOP = { duration: 18, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" } as const;

/**
 * One painted scene. It keeps the old SVG scenes' contract: `data-scene` names
 * it, it only moves while on screen, nothing moves under reduced motion, and
 * the outer layer follows the scroll (parallax) while the inner one drifts.
 * Paint is composited as whole layers, transform only, so it stays cheap.
 */
export function PaintedScene({
  scene,
  className,
  aspect = "aspect-[16/10]",
  sizes = "(min-width: 768px) 33vw, 100vw",
}: {
  scene: PaintedSceneName;
  className?: string;
  aspect?: string;
  sizes?: string;
}) {
  const art = PAINTINGS[scene];
  const { ref, reduced, motionOn, progress } = useScene();
  const y = useParallax(progress, 14, reduced);

  return (
    <figure ref={ref} className={cn("relative m-0 overflow-hidden bg-veil", aspect, className)} data-scene={scene}>
      <motion.div className="absolute -inset-6" style={{ y }} data-parallax aria-hidden="true">
        <motion.div
          className="absolute inset-0"
          data-drift
          initial={false}
          animate={motionOn ? DRIFT : DRIFT_REST}
          transition={still(motionOn, DRIFT_LOOP)}
        >
          <Image src={art.src} alt="" fill sizes={sizes} className={cn("object-cover saturate-[0.92]", art.focus)} />
        </motion.div>
      </motion.div>
      {/* A soft foot so the card body below grows out of the paint. */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-veil/80 to-transparent" aria-hidden="true" />
      <figcaption className="absolute bottom-2 left-3 right-3 truncate text-xs text-veil-ink/75">{art.credit}</figcaption>
    </figure>
  );
}
