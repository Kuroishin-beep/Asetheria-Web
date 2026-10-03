import { test, expect } from "@playwright/test";
import { contrast, measureAll, readThemes } from "../scripts/lib/contrast";

test.describe("design tokens (pure logic, no browser needed)", () => {
  test("contrast maths matches the WCAG reference values", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  test("both themes define every semantic token the components use", () => {
    const themes = readThemes();
    for (const theme of ["light", "dark"] as const) {
      for (const key of [
        "background", "foreground", "card", "card-foreground", "popover", "popover-foreground",
        "primary", "primary-foreground", "secondary", "secondary-foreground", "muted",
        "muted-foreground", "accent", "accent-foreground", "destructive", "border", "input",
        "ring", "sidebar", "gold", "link", "secret", "success", "faint-foreground", "radius",
        "shadow-1", "shadow-2", "shadow-3",
      ]) {
        expect(themes[theme][key], `${theme} --${key}`).toBeTruthy();
      }
    }
  });

  test("every text pair meets 4.5:1 and every control border and focus ring meets 3:1, in both themes", () => {
    const failures = measureAll()
      .filter((r) => r.ratio < r.min)
      .map((r) => `${r.theme}: ${r.fg} on ${r.bg} is ${r.ratio.toFixed(2)}:1, needs ${r.min}:1 (${r.role})`);
    expect(failures).toEqual([]);
  });

  test("dark and light really differ: page background luminance flips", () => {
    const themes = readThemes();
    expect(themes.dark.background).not.toBe(themes.light.background);
    expect(contrast(themes.dark.background, themes.light.background)).toBeGreaterThan(10);
  });
});
