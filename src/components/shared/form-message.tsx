import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type FormMessageProps = ComponentProps<"p"> & {
  /** Use "div" when the message contains block content such as a list. */
  as?: "p" | "div";
  /**
   * "error" is a mistake the person can fix. "notice" is a pause that is not
   * their fault (a throttle), so it reads calmer and in gold, not red.
   */
  variant?: "error" | "notice";
};

/**
 * An inline, announced message under a form. Always a <p role="alert"> so
 * assistive tech reads it as soon as it appears; `data-variant` lets tests and
 * styles tell the two tones apart.
 */
export function FormMessage({ variant = "error", as = "p", className, ...props }: FormMessageProps) {
  const Tag = as as "p";
  return (
    <Tag
      role="alert"
      data-variant={variant === "notice" ? "throttle" : "error"}
      className={cn(
        "rounded-md border px-3 py-2 text-[13px]",
        variant === "notice"
          ? "border-gold/30 bg-gold/10 text-gold"
          : "border-destructive/30 bg-destructive/10 text-destructive",
        className,
      )}
      {...props}
    />
  );
}
