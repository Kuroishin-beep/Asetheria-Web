"use client";

import { usePathname } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";

/**
 * Shows toasts everywhere except the world graph. Measured: with the toast
 * layer mounted, the graph's pointer-sweep frame time under a 4x CPU throttle
 * went from p90 16.8 ms to about 50 ms, because the fixed overlay forces extra
 * compositing over the busy SVG. The graph shows its own inline messages.
 */
export function AppToaster() {
  const pathname = usePathname();
  if (pathname === "/graph" || pathname.startsWith("/graph/")) return null;
  return <Toaster />;
}
