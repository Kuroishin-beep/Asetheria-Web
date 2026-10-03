"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Theme state for the whole app. next-themes writes the saved choice to
 * `localStorage["asetheria-theme"]` (the same key and values the previous
 * hand-rolled script used, so existing visitors keep their theme) and stamps
 * `data-theme` on <html> before first paint. Defaults to dark: this gets used
 * at the table, in dim rooms.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="dark"
      themes={["light", "dark"]}
      storageKey="asetheria-theme"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
