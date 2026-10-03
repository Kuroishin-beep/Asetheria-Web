"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // The stored theme is unknown on the server, so render the icon only after
  // mount; before that the button is the same size with no glyph.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme !== "light";
  const next = isDark ? "light" : "dark";
  // Server and first client render must match: the real theme is only known
  // after mount, so until then the label stays generic.
  const label = mounted ? `Switch to ${next} theme` : "Toggle theme";

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="btn"
      style={{ padding: "0.4rem 0.6rem" }}
      aria-label={label}
      title={label}
    >
      <span aria-hidden="true">{mounted ? (isDark ? "☾" : "☀") : " "}</span>
    </button>
  );
}
