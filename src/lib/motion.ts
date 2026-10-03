import type { Transition, Variants } from "motion/react";

/**
 * Shared Motion presets. Every animated component pulls its variants and
 * transitions from here so the whole app moves the same way. Reduced-motion
 * users are handled once, globally, by <MotionProvider> (MotionConfig with
 * `reducedMotion="user"`): transforms and layout animations are skipped, so
 * nothing here needs its own check.
 *
 * Durations mirror the CSS tokens in src/styles/design-tokens.css
 * (--duration-fast / base / slow).
 */

export const DURATION = {
  fast: 0.15,
  base: 0.25,
  slow: 0.4,
} as const;

export const EASE_OUT_SOFT = [0.22, 1, 0.36, 1] as const;

export const TRANSITION_BASE: Transition = {
  duration: DURATION.base,
  ease: EASE_OUT_SOFT,
};

/** Overlays and toasts: a short spring so they settle rather than slide. */
export const TRANSITION_SPRING: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 32,
  mass: 0.8,
};

/** Delay between siblings in a staggered list. */
export const STAGGER_STEP = 0.04;

/** A list never staggers for longer than this in total, however long it is. */
export const STAGGER_MAX_TOTAL = 0.5;

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: TRANSITION_BASE },
};

export const slideUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: TRANSITION_BASE },
};

/** Page transitions: fade plus a small upward slide on enter. */
export const pageTransition: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.slow, ease: EASE_OUT_SOFT } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: TRANSITION_SPRING },
};

export function staggerContainer(step: number = STAGGER_STEP): Variants {
  return {
    hidden: {},
    visible: { transition: { staggerChildren: step, delayChildren: 0.02 } },
  };
}

/**
 * The per-child stagger step for a list of `count` items, capped so a long
 * list (a 100-entry index) never takes more than STAGGER_MAX_TOTAL to appear.
 */
export function staggerStepFor(count: number): number {
  if (count <= 1) return STAGGER_STEP;
  return Math.min(STAGGER_STEP, STAGGER_MAX_TOTAL / (count - 1));
}

/** Hover lift and press shrink for buttons and cards. */
export const interactive = {
  whileHover: { y: -1, scale: 1.01 },
  whileTap: { scale: 0.98 },
  transition: { duration: DURATION.fast, ease: EASE_OUT_SOFT },
} as const;
