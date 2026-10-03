"use client";

import { Children, type ReactNode } from "react";
import { motion } from "motion/react";
import { slideUp, staggerContainer, staggerStepFor } from "@/lib/motion";

type StaggerContainerProps = {
  children: ReactNode;
  className?: string;
  /** Render a <ul> with <li> items (valid list markup) instead of div wrappers. */
  as?: "div" | "ul";
};

/**
 * Enters its children one after another. The step shrinks for long lists so
 * the whole sequence never runs longer than half a second.
 */
export function StaggerContainer({ children, className, as = "div" }: StaggerContainerProps) {
  const items = Children.toArray(children);
  const Container = as === "ul" ? motion.ul : motion.div;
  const Item = as === "ul" ? motion.li : motion.div;
  return (
    <Container
      className={className}
      variants={staggerContainer(staggerStepFor(items.length))}
      initial="hidden"
      animate="visible"
    >
      {items.map((child, index) => (
        <Item key={index} variants={slideUp}>
          {child}
        </Item>
      ))}
    </Container>
  );
}
