/**
 * Static design-system gates from the project rules (root CLAUDE.md and
 * .claude/rules/02-design.md), run over `src/` by `scripts/check-design-system.ts`
 * and asserted in CI by `tests/design-gates.spec.ts`.
 *
 * Each rule has a name, a pattern, and the files it does not apply to, with the
 * reason, so an exemption is a visible decision rather than a silent gap.
 */
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "..", "..", "src");

export type Violation = { rule: string; file: string; line: number; text: string };

type Rule = {
  name: string;
  /** Matches one line of source. */
  pattern: RegExp;
  extensions: string[];
  /** Repo-relative path prefixes (forward slashes) the rule does not apply to. */
  exempt: { prefix: string; reason: string }[];
};

const COLOR_NAMES =
  "white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";

const VENDOR_UI = { prefix: "src/components/ui/", reason: "generated shadcn primitives wrap the plain elements by definition" };
const VENDOR_CSS = { prefix: "src/styles/shadcn.css", reason: "vendor CSS inlined from shadcn/tailwind.css (framework keyframes)" };
const TOKENS = { prefix: "src/styles/design-tokens.css", reason: "the one file that defines the palette" };
const LAYOUT_THEME_COLOR = {
  prefix: "src/app/layout.tsx",
  reason:
    "viewport.themeColor feeds browser chrome, which cannot read CSS variables; tests/design-gates.spec.ts asserts the values equal the token backgrounds",
};
const SESSION_HINT = {
  prefix: "src/lib/session.ts",
  reason: "a user-facing instruction string that mentions console.log, not a call",
};

export const RULES: Rule[] = [
  {
    name: "no hardcoded Tailwind colour utilities (use design tokens)",
    pattern: new RegExp(
      `\\b(?:bg|text|border|ring|fill|stroke|from|to|via|divide|outline|shadow|decoration|accent|caret)-(?:${COLOR_NAMES})(?:-\\d{2,3})?(?:/\\d+)?\\b`,
    ),
    extensions: [".tsx", ".ts"],
    exempt: [VENDOR_UI],
  },
  {
    name: "no colour literals in components (hex, rgb(), hsl())",
    pattern: /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-zA-Z])|\brgba?\(|\bhsla?\(/,
    extensions: [".tsx", ".ts"],
    exempt: [VENDOR_UI, LAYOUT_THEME_COLOR],
  },
  {
    name: "no CSS @keyframes in app code",
    pattern: /@keyframes/,
    extensions: [".tsx", ".ts", ".css"],
    exempt: [VENDOR_CSS],
  },
  {
    name: "no CSS animation utilities except the button spinner (use Motion)",
    pattern: /\banimate-(?!spin\b|pulse\b|in\b|out\b)[a-z]/,
    extensions: [".tsx", ".ts"],
    exempt: [VENDOR_UI],
  },
  {
    name: "no inline style objects (use Tailwind classes)",
    pattern: /\bstyle=\{\{/,
    extensions: [".tsx"],
    exempt: [],
  },
  {
    name: "no plain <button>, <select> or <textarea> (use the shadcn wrappers)",
    pattern: /<(?:button|select|textarea)\b/,
    extensions: [".tsx"],
    exempt: [VENDOR_UI],
  },
  {
    name: "no plain <input> except type=hidden (use the shadcn Input)",
    pattern: /<input\b(?![^>]*type="hidden")/,
    extensions: [".tsx"],
    exempt: [VENDOR_UI],
  },
  {
    name: "no emoji glyphs in UI code (icons are lucide-react)",
    pattern: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u,
    extensions: [".tsx", ".ts"],
    exempt: [],
  },
  {
    name: "no arbitrary spacing values (use the 4/8/12/16/24/32/48/64 scale)",
    pattern: /\b(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y)-\[/,
    extensions: [".tsx"],
    exempt: [VENDOR_UI],
  },
  {
    name: "no console.log in production code",
    pattern: /\bconsole\.log\(/,
    extensions: [".tsx", ".ts"],
    exempt: [SESSION_HINT],
  },
  {
    name: "no `any` types or @ts-ignore",
    pattern: /:\s*any\b|\bas any\b|<any>|@ts-ignore/,
    extensions: [".tsx", ".ts"],
    exempt: [],
  },
  {
    name: "palette primitives are only referenced from the token file",
    pattern: /var\(--color-(?:ink|vellum|gold-\d|patina|tyrian|blood)/,
    extensions: [".tsx", ".ts", ".css"],
    exempt: [TOKENS],
  },
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** Strips // line comments and block comments so prose in comments cannot trip a rule. */
function stripComments(source: string, ext: string): string {
  if (ext === ".css") return source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, (_m, pre) => pre);
}

export function scan(): Violation[] {
  const violations: Violation[] = [];
  for (const file of walk(SRC)) {
    const ext = path.extname(file);
    const rel = path.relative(path.resolve(SRC, ".."), file).split(path.sep).join("/");
    const applicable = RULES.filter(
      (r) => r.extensions.includes(ext) && !r.exempt.some((e) => rel.startsWith(e.prefix)),
    );
    if (applicable.length === 0) continue;
    const lines = stripComments(fs.readFileSync(file, "utf8"), ext).split("\n");
    lines.forEach((text, i) => {
      for (const rule of applicable) {
        if (rule.pattern.test(text)) violations.push({ rule: rule.name, file: rel, line: i + 1, text: text.trim().slice(0, 140) });
      }
    });
  }
  return violations;
}
