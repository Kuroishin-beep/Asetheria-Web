import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { readThemes } from "../scripts/lib/contrast";
import { RULES, scan } from "../scripts/lib/design-gates";

test.describe("design-system gates (static scan of src/, no browser needed)", () => {
  test("the scan finds no violations of the project design rules", () => {
    const found = scan().map((v) => `${v.file}:${v.line} [${v.rule}] ${v.text}`);
    expect(found).toEqual([]);
  });

  test("every rule actually fires on a known-bad sample (the gates are not vacuous)", () => {
    const samples: Record<string, string> = {
      "no hardcoded Tailwind colour utilities (use design tokens)": '<div className="bg-white text-gray-900 border-blue-600" />',
      "no colour literals in components (hex, rgb(), hsl())": 'const c = "#ff00aa";',
      "no CSS @keyframes in app code": "@keyframes spin { }",
      "no CSS animation utilities except the button spinner (use Motion)": '<div className="animate-bounce" />',
      "no inline style objects (use Tailwind classes)": '<div style={{ padding: 4 }} />',
      "no plain <button>, <select> or <textarea> (use the shadcn wrappers)": "<button>x</button>",
      "no plain <input> except type=hidden (use the shadcn Input)": "<input />",
      "no emoji glyphs in UI code (icons are lucide-react)": "<span>\u{1F3B2}</span>",
      "no arbitrary spacing values (use the 4/8/12/16/24/32/48/64 scale)": '<div className="p-[13px]" />',
      "no console.log in production code": "console.log(x)",
      "no `any` types or @ts-ignore": "const a: any = 1;",
      "palette primitives are only referenced from the token file": "color: var(--color-gold-400)",
    };
    for (const rule of RULES) {
      expect(samples[rule.name], `missing sample for "${rule.name}"`).toBeTruthy();
      expect(rule.pattern.test(samples[rule.name]), rule.name).toBe(true);
    }
    // And the allowed forms do not trip the narrow rules.
    const input = RULES.find((r) => r.name.startsWith("no plain <input>"))!;
    expect(input.pattern.test('<input type="hidden" name="x" />')).toBe(false);
    const motion = RULES.find((r) => r.name.startsWith("no CSS animation utilities"))!;
    expect(motion.pattern.test('<Loader2 className="animate-spin" />')).toBe(false);
  });

  test("viewport themeColor in layout.tsx equals the token page backgrounds", () => {
    const layout = fs.readFileSync(path.resolve(__dirname, "..", "src", "app", "layout.tsx"), "utf8");
    const light = /prefers-color-scheme: light\)", color: "(#[0-9a-fA-F]{6})"/.exec(layout)?.[1];
    const dark = /prefers-color-scheme: dark\)", color: "(#[0-9a-fA-F]{6})"/.exec(layout)?.[1];
    const themes = readThemes();
    expect(light?.toLowerCase()).toBe(themes.light.background.toLowerCase());
    expect(dark?.toLowerCase()).toBe(themes.dark.background.toLowerCase());
  });
});
