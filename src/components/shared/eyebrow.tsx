import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Small uppercase label used above a block of content: property names, section
 * titles in the connections rail, form group labels.
 */
export function Eyebrow({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cn("text-xs font-semibold uppercase tracking-[0.07em] text-muted-foreground", className)}
      {...props}
    />
  );
}
