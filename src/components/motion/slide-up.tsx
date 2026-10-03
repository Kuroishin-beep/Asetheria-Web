"use client";

import { motion } from "motion/react";
import type { ComponentProps } from "react";
import { slideUp } from "@/lib/motion";

type SlideUpProps = ComponentProps<typeof motion.div>;

/** Fades and lifts its children into place on mount. */
export function SlideUp({ children, ...props }: SlideUpProps) {
  return (
    <motion.div variants={slideUp} initial="hidden" animate="visible" {...props}>
      {children}
    </motion.div>
  );
}
