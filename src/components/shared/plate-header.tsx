import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The periwinkle strip across the top of a panel, with small pixel legends at
 * each end, like the label plate on a console module. Put it first inside a
 * `Card` that has `pt-0 gap-0 overflow-hidden`.
 */
export function PlateHeader({ label, aside, className }: { label: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 bg-plate px-4 py-2 text-plate-foreground shadow-[inset_0_-3px_0_var(--plate-edge)]", className)}>
      <span className="pixel-label">{label}</span>
      {aside && <span className="pixel-label">{aside}</span>}
    </div>
  );
}
