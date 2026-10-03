"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // The stored theme is unknown on the server, so render the icon and the
  // specific label only after mount; before that the button is the same size
  // with a generic label, which keeps server and client markup identical.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme !== "light";
  const next = isDark ? "light" : "dark";
  const label = mounted ? `Switch to ${next} theme` : "Toggle theme";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => setTheme(next)}
      aria-label={label}
      title={label}
    >
      {mounted && (isDark ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />)}
    </Button>
  );
}
