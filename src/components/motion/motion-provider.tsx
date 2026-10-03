"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/**
 * Applies the visitor's `prefers-reduced-motion` setting to every Motion
 * animation underneath it: with "user", transform and layout animations are
 * skipped while opacity changes still run, so content never jumps or slides
 * for someone who asked for less movement.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
