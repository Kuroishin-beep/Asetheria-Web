/**
 * WCAG 2.x contrast maths and a reader for the theme tokens in
 * src/styles/design-tokens.css. Shared by tests/design-tokens.spec.ts and
 * scripts/check-contrast.ts so the numbers in docs/design-tokens.md and the
 * assertions in CI come from one implementation.
 */
import fs from "node:fs";
import path from "node:path";

export type ThemeName = "light" | "dark";
export type TokenMap = Record<string, string>;

const TOKENS_PATH = path.resolve(__dirname, "..", "..", "src", "styles", "design-tokens.css");

function parseBlock(css: string, selector: RegExp): TokenMap {
  const out: TokenMap = {};
  const match = selector.exec(css);
  if (!match) throw new Error(`design-tokens.css: block ${selector} not found`);
  const start = css.indexOf("{", match.index) + 1;
  let depth = 1;
  let i = start;
  while (i < css.length && depth > 0) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") depth--;
    i++;
  }
  const body = css.slice(start, i - 1).replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) out[m[1]] = m[2].trim();
  return out;
}

/** Light tokens first, dark layered over them (as the cascade does). */
export function readThemes(): Record<ThemeName, TokenMap> {
  const css = fs.readFileSync(TOKENS_PATH, "utf8");
  const light = parseBlock(css, /:root,\s*\[data-theme="light"\]\s*\{/);
  const darkOnly = parseBlock(css, /\n\[data-theme="dark"\]\s*\{/);
  return { light, dark: { ...light, ...darkOnly } };
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = hex.trim().match(/^#([0-9a-f]{6})$/i);
  if (!m) throw new Error(`Not a 6-digit hex colour: "${hex}"`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export type Pair = { fg: string; bg: string; min: number; role: string };

/** Text pairs need 4.5:1; borders that identify a control and focus rings need 3:1. */
export const PAIRS: Pair[] = [
  { fg: "foreground", bg: "background", min: 4.5, role: "body text" },
  { fg: "card-foreground", bg: "card", min: 4.5, role: "card text" },
  { fg: "popover-foreground", bg: "popover", min: 4.5, role: "popover text" },
  { fg: "muted-foreground", bg: "background", min: 4.5, role: "muted text on page" },
  { fg: "muted-foreground", bg: "card", min: 4.5, role: "muted text on card" },
  { fg: "muted-foreground", bg: "muted", min: 4.5, role: "muted text on sunken surface" },
  { fg: "faint-foreground", bg: "background", min: 4.5, role: "meta text on page" },
  { fg: "faint-foreground", bg: "card", min: 4.5, role: "meta text on card" },
  { fg: "faint-foreground", bg: "muted", min: 4.5, role: "meta text on sunken surface" },
  { fg: "faint-foreground", bg: "secondary", min: 4.5, role: "meta text on a secondary badge" },
  { fg: "faint-foreground", bg: "accent", min: 4.5, role: "meta text on hover / active rows" },
  { fg: "muted-foreground", bg: "accent", min: 4.5, role: "muted text on hover / active rows" },
  { fg: "muted-foreground", bg: "secondary", min: 4.5, role: "muted text on a secondary badge" },
  { fg: "gold", bg: "muted", min: 3, role: "gold icon on a sunken tile" },
  { fg: "gold", bg: "accent", min: 3, role: "gold icon on hover / active rows" },
  { fg: "secret", bg: "card", min: 4.5, role: "secret marker text on card" },
  { fg: "primary-foreground", bg: "primary", min: 4.5, role: "primary button label" },
  { fg: "primary", bg: "background", min: 4.5, role: "primary used as text" },
  { fg: "gold", bg: "background", min: 4.5, role: "gold accent text on page" },
  { fg: "gold", bg: "card", min: 4.5, role: "gold accent text on card" },
  { fg: "link", bg: "background", min: 4.5, role: "link on page" },
  { fg: "link", bg: "card", min: 4.5, role: "link on card" },
  { fg: "secondary-foreground", bg: "secondary", min: 4.5, role: "secondary button label" },
  { fg: "accent-foreground", bg: "accent", min: 4.5, role: "hover surface text" },
  { fg: "destructive", bg: "background", min: 4.5, role: "error text on page" },
  { fg: "destructive-foreground", bg: "destructive", min: 4.5, role: "destructive button label" },
  { fg: "secret", bg: "background", min: 4.5, role: "secret marker text" },
  { fg: "success", bg: "background", min: 4.5, role: "success text" },
  { fg: "sidebar-foreground", bg: "sidebar", min: 4.5, role: "sidebar text" },
  { fg: "sidebar-accent-foreground", bg: "sidebar-accent", min: 4.5, role: "sidebar active item" },
  { fg: "input", bg: "background", min: 3, role: "form control border on page" },
  { fg: "input", bg: "card", min: 3, role: "form control border on card" },
  { fg: "ring", bg: "background", min: 3, role: "focus ring on page" },
  { fg: "ring", bg: "card", min: 3, role: "focus ring on card" },
];

export type Measured = Pair & { theme: ThemeName; ratio: number };

export function measureAll(): Measured[] {
  const themes = readThemes();
  const out: Measured[] = [];
  for (const theme of ["light", "dark"] as const) {
    for (const pair of PAIRS) {
      const fg = themes[theme][pair.fg];
      const bg = themes[theme][pair.bg];
      if (!fg || !bg) throw new Error(`Missing token for ${pair.fg}/${pair.bg} in ${theme}`);
      out.push({ ...pair, theme, ratio: contrast(fg, bg) });
    }
  }
  return out;
}
