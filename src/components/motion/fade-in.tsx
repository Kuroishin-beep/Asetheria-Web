"use client";

import { motion } from "motion/react";
import type { ComponentProps } from "react";
import { fadeIn } from "@/lib/motion";

type FadeInProps = ComponentProps<typeof motion.div>;

/** Fades its children in on mount. */
export function FadeIn({ children, ...props }: FadeInProps) {
  return (
    <motion.div variants={fadeIn} initial="hidden" animate="visible" {...props}>
      {children}
    </motion.div>
  );
}
