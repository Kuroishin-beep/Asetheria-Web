"use client";

import { useRef } from "react";
import { useInView, useReducedMotion, useScroll, useTransform, type MotionValue, type Transition } from "motion/react";

/**
 * What every scene needs to behave: a ref to watch, whether the visitor asked
 * for reduced motion, whether the scene is on screen (loops only run while it
 * is, so off-screen art costs nothing), and its scroll progress for parallax.
 */
export function useScene() {
  const ref = useRef<HTMLDivElement>(null);
  const reducedPref = useReducedMotion();
  const reduced = reducedPref === true;
  const inView = useInView(ref, { margin: "-8% 0px -8% 0px" });
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  return { ref, reduced, inView, motionOn: !reduced && inView, progress: scrollYProgress };
}

/** A vertical drift tied to scroll: `range` pixels either side of centre, none at all under reduced motion. */
export function useParallax(progress: MotionValue<number>, range: number, reduced: boolean) {
  return useTransform(progress, [0, 1], reduced ? [0, 0] : [range, -range]);
}

/**
 * A looping transition only while the scene is running. When it is off screen or
 * motion is reduced the same animation target is reached instantly, so nothing
 * keeps ticking (a bare `repeat: Infinity` would keep tweening to the resting value).
 */
export function still(on: boolean, loopConfig: Transition): Transition {
  return on ? loopConfig : { duration: 0 };
}
