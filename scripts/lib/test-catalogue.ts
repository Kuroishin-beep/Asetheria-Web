/**
 * Builds the test-case catalogue from the real Playwright specs.
 *
 * Every Playwright test becomes one case. Its steps, data and expected results
 * are read from the test's own body (what it opens, clicks, types and asserts),
 * so the catalogue describes what the tests actually do, not what someone hoped
 * they did. Ids are stable: `test-cases/ids.json` remembers which test owns
 * which id, and a test keeps its id when it is renamed or moved.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export const CATEGORIES = [
  "Happy",
  "Sad",
  "Edge",
  "Boundary",
  "Validation",
  "Permission & Auth",
  "Security",
  "Data Integrity",
  "Concurrency",
  "Error & Recovery",
  "Responsive",
  "Accessibility",
] as const;
export type Category = (typeof CATEGORIES)[number];
export type Priority = "P0" | "P1" | "P2" | "P3";

export type TestCase = {
  id: string;
  module: string;
  moduleName: string;
  category: Category;
  priority: Priority;
  file: string;
  line: number;
  describe: string;
  title: string;
  preconditions: string[];
  steps: string[];
  testData: string[];
  expected: string[];
};

/** spec file (without .spec.ts) -> [module code, module name] */
export const MODULES: Record<string, [string, string]> = {
  a11y: ["A11Y", "Accessibility sweep (axe, both themes)"],
  "app-shell": ["SHELL", "App shell, navigation and drawer"],
  auth: ["AUTH", "Sign-in, sign-up, sessions and throttling"],
  "character-creator": ["CHRC", "Character creator wizard (public and member)"],
  "character-draft": ["CHRD", "Character wizard rules, draft and Wikidot links"],
  "character-engine": ["CHRE", "Character engine and house rules"],
  "characters-api": ["CHRA", "Saved characters API"],
  "city-locations": ["CITY", "City locations content"],
  "codex-pages-smoke": ["SMOKE", "Codex pages smoke"],
  "coverage-gaps": ["COV", "Coverage-floor additions"],
  "codex-ui": ["CODEX", "Codex lists and entry views"],
  "database-view": ["DBV", "Database view (sort, columns, filters)"],
  "design-gates": ["GATE", "Design-system gates"],
  "design-tokens": ["TOKN", "Design tokens and contrast"],
  dice: ["DICE", "Dice engine"],
  "editor-ui": ["EDIT", "Entry editor"],
  "entries-crud": ["ENT", "Entries create, edit, archive (DM)"],
  "entries-player-readonly": ["ENTR", "Entries are read-only for players"],
  "entry-doors": ["DOOR", "The two doors (party password, DM)"],
  "entry-pages": ["PAGE", "Entry pages, hero and templates"],
  "error-states": ["ERR", "Error states and recovery"],
  "fauna-ui": ["FAUNA", "Fauna pages"],
  "foundry-import": ["FOUND", "Foundry import"],
  "graph-and-table-view": ["GTV", "Graph and table views"],
  "graph-upgrades": ["GRAPH", "World graph (filters, clustering, keyboard, speed)"],
  health: ["HEALTH", "Health endpoint"],
  "homebrew-content": ["HOME", "Homebrew content"],
  "import-export": ["IMEX", "Import and export"],
  "kind-migration": ["KIND", "Entry-kind migration"],
  "knowledge-features": ["KNOW", "Backlinks, mentions and outlines"],
  landing: ["LAND", "Public landing page and scenes"],
  map: ["MAP", "Interactive map and pins"],
  motion: ["MOTN", "Motion presets"],
  "natural-world-import": ["NATW", "Natural-world import"],
  "natural-world-links": ["NATL", "Natural-world links"],
  "natural-world-tables": ["NATT", "Natural-world roll tables"],
  planner: ["PLAN", "Campaign planner"],
  "rbac-inheritance": ["RBACI", "Access control: inheritance"],
  "rbac-panel": ["RBACP", "Access control panel"],
  rbac: ["RBAC", "Access control"],
  "responsive-visual": ["RESP", "Responsive layout"],
  "roll-table": ["ROLL", "Roll tables (engine)"],
  "roll-tables": ["ROLLT", "Roll tables (authoring and rolling)"],
  "search-palette": ["SRCH", "Search and command palette"],
  "search-safety": ["SRCHS", "Search safety"],
  "semantic-search": ["SEM", "Semantic search"],
  theme: ["THEME", "Light and dark themes"],
  "tools-admin": ["TOOLS", "Tools and admin pages"],
};

const IDS_FILE = path.resolve(__dirname, "..", "..", "test-cases", "ids.json");

// ---------------------------------------------------------------------------
// Describing locators and values in plain words
// ---------------------------------------------------------------------------

const clip = (s: string, n = 110) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

function literal(node: ts.Node | undefined, src: ts.SourceFile): string {
  if (!node) return "";
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return squash(node.getText(src)).replace(/^`|`$/g, "").replace(/\$\{([^}]*)\}/g, "‹$1›");
  }
  if (ts.isRegularExpressionLiteral(node)) return node.text;
  return squash(node.getText(src));
}

function optName(node: ts.Node | undefined, src: ts.SourceFile): string {
  if (!node || !ts.isObjectLiteralExpression(node)) return "";
  for (const p of node.properties) {
    if (ts.isPropertyAssignment(p) && p.name.getText(src) === "name") return literal(p.initializer, src);
  }
  return "";
}

/** `page.getByRole("button", { name: "Save" })` -> `button "Save"` */
function describeLocator(expr: ts.Expression, src: ts.SourceFile): string {
  let node: ts.Expression = expr;
  const parts: string[] = [];
  while (ts.isCallExpression(node) || ts.isPropertyAccessExpression(node) || ts.isAwaitExpression(node)) {
    if (ts.isAwaitExpression(node)) {
      node = node.expression;
      continue;
    }
    if (ts.isPropertyAccessExpression(node)) {
      node = node.expression;
      continue;
    }
    const callee = node.expression;
    if (ts.isPropertyAccessExpression(callee)) {
      const method = callee.name.text;
      const [a0, a1] = node.arguments;
      if (method === "getByRole") parts.unshift(`${literal(a0, src)}${optName(a1, src) ? ` "${optName(a1, src)}"` : ""}`);
      else if (method === "getByLabel") parts.unshift(`field "${literal(a0, src)}"`);
      else if (method === "getByTestId") parts.unshift(`[${literal(a0, src)}]`);
      else if (method === "getByText") parts.unshift(`text "${literal(a0, src)}"`);
      else if (method === "getByPlaceholder") parts.unshift(`field with placeholder "${literal(a0, src)}"`);
      else if (method === "locator") parts.unshift(`\`${literal(a0, src)}\``);
      else if (method === "first") parts.unshift("first");
      else if (method === "last") parts.unshift("last");
      else if (method === "nth") parts.unshift(`#${literal(a0, src)}`);
      node = callee.expression;
      continue;
    }
    break;
  }
  const base = parts.filter((p) => p !== "first" && p !== "last" && !p.startsWith("#")).join(" › ");
  return base || clip(squash(expr.getText(src)), 70);
}

const MATCHERS: Record<string, string> = {
  toBeVisible: "is visible",
  toBeHidden: "is hidden",
  toBeEnabled: "is enabled",
  toBeDisabled: "is disabled",
  toBeFocused: "has focus",
  toBeChecked: "is checked",
  toBeTruthy: "is true",
  toBeFalsy: "is false",
  toBeNull: "is empty",
  toBeDefined: "is present",
  toBeUndefined: "is absent",
  toHaveCount: "count is",
  toHaveText: "text is",
  toContainText: "contains text",
  toHaveValue: "value is",
  toHaveAttribute: "has attribute",
  toHaveURL: "URL is",
  toHaveTitle: "title is",
  toHaveClass: "has class",
  toBe: "equals",
  toEqual: "equals",
  toStrictEqual: "equals",
  toContain: "contains",
  toMatch: "matches",
  toBeGreaterThan: "is greater than",
  toBeGreaterThanOrEqual: "is at least",
  toBeLessThan: "is less than",
  toBeLessThanOrEqual: "is at most",
  toHaveLength: "length is",
  toBeCloseTo: "is about",
  toHaveProperty: "has property",
  toThrow: "throws",
};

function describeSubject(expr: ts.Expression, src: ts.SourceFile): string {
  const text = squash(expr.getText(src));
  if (/\.status\(\)/.test(text)) return "HTTP status";
  if (/\.ok\(\)/.test(text)) return "response ok";
  if (/\.json\(\)/.test(text)) return "response body";
  if (/page\.url\(\)|\.url\(\)/.test(text)) return "page URL";
  if (/\.content\(\)/.test(text)) return "page HTML";
  if (/\.title\(\)/.test(text)) return "page title";
  if (/getBy|locator\(/.test(text)) return describeLocator(expr, src);
  return clip(text, 70);
}

function describeExpect(call: ts.CallExpression, src: ts.SourceFile): string | null {
  // expect(subject).not.toBe(x)  /  expect(subject).toBe(x)  /  await expect(...).resolves...
  let negated = false;
  let callee = call.expression;
  if (!ts.isPropertyAccessExpression(callee)) return null;
  const matcher = callee.name.text;
  let inner: ts.Expression = callee.expression;
  if (ts.isPropertyAccessExpression(inner) && inner.name.text === "not") {
    negated = true;
    inner = inner.expression;
  }
  if (ts.isPropertyAccessExpression(inner) && (inner.name.text === "soft" || inner.name.text === "poll")) inner = inner.expression;
  if (!ts.isCallExpression(inner) || !ts.isIdentifier(inner.expression) || inner.expression.text !== "expect") return null;
  const first = inner.arguments[0];
  if (first && (ts.isArrowFunction(first) || ts.isFunctionExpression(first))) return null; // expect(async () => { ... }).toPass(): the checks inside are read on their own
  const subject = describeSubject(first, src);
  const verb = MATCHERS[matcher] ?? matcher.replace(/^to/, "").replace(/([A-Z])/g, " $1").toLowerCase();
  const onlyTimeout = (n: ts.Expression) => ts.isObjectLiteralExpression(n) && n.properties.every((p) => ts.isPropertyAssignment(p) && p.name.getText(src) === "timeout");
  const arg = call.arguments[0] && !onlyTimeout(call.arguments[0]) ? ` ${clip(literal(call.arguments[0], src), 80)}` : "";
  return `${subject} ${negated ? "does not: " : ""}${verb}${arg}`.replace(/\s+/g, " ").trim();
}

function describeAction(call: ts.CallExpression, src: ts.SourceFile): { step?: string; data?: string } {
  const callee = call.expression;
  if (!ts.isPropertyAccessExpression(callee)) return {};
  const method = callee.name.text;
  const target = callee.expression;
  const a0 = call.arguments[0];
  const targetText = target.getText(src);
  const onPage = /(^|\.)page$/.test(targetText) && call.arguments.length > 0 && ["click", "dblclick", "hover", "check", "uncheck", "fill", "type", "press", "selectOption"].includes(method);
  const sel = onPage ? `\`${literal(a0, src)}\`` : "";
  const on = () => (onPage ? sel : describeLocator(target, src));
  const valueArg = onPage ? call.arguments[1] : a0;
  switch (method) {
    case "goto":
      return { step: `Open ${clip(literal(a0, src), 90)}`, data: `URL ${clip(literal(a0, src), 90)}` };
    case "reload":
      return { step: "Reload the page" };
    case "click":
      return { step: `Click ${on()}` };
    case "dblclick":
      return { step: `Double-click ${on()}` };
    case "hover":
      return { step: `Hover ${on()}` };
    case "check":
      return { step: `Tick ${on()}` };
    case "uncheck":
      return { step: `Untick ${on()}` };
    case "fill":
    case "type":
    case "pressSequentially":
      return { step: `Type ${clip(literal(valueArg, src), 60)} into ${on()}`, data: `Input ${clip(literal(valueArg, src), 60)}` };
    case "press":
      return { step: `Press ${literal(valueArg, src)}${onPage ? ` on ${on()}` : /getBy|locator/.test(targetText) ? ` on ${on()}` : ""}` };
    case "selectOption":
      return { step: `Choose ${clip(literal(valueArg, src), 60)} in ${on()}`, data: `Choice ${clip(literal(valueArg, src), 60)}` };
    case "setInputFiles":
      return { step: `Attach a file to ${on()}` };
    case "dragTo":
      return { step: `Drag ${on()} to ${describeLocator(a0, src)}` };
    case "setViewportSize":
      return { step: `Set the window size to ${clip(literal(a0, src), 40)}`, data: `Viewport ${clip(literal(a0, src), 40)}` };
    case "emulateMedia":
      return { step: `Emulate media ${clip(literal(a0, src), 60)}` };
    case "waitForURL":
      return { step: `Wait for the URL ${clip(literal(a0, src), 70)}` };
    case "post":
    case "put":
    case "patch":
    case "delete":
    case "get":
      if (/request|api|res/i.test(target.getText(src)) || /["'`]\/api\//.test(a0?.getText(src) ?? "")) {
        const body = call.arguments[1] ? ` with ${clip(squash(call.arguments[1].getText(src)), 90)}` : "";
        return { step: `Send ${method.toUpperCase()} ${clip(literal(a0, src), 80)}${body}`, data: `${method.toUpperCase()} ${clip(literal(a0, src), 80)}` };
      }
      return {};
    default:
      return {};
  }
}

// ---------------------------------------------------------------------------
// Reading one test
// ---------------------------------------------------------------------------

function findTestCall(src: ts.SourceFile, line: number): ts.CallExpression | null {
  let found: ts.CallExpression | null = null;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (ts.isCallExpression(n)) {
      const text = n.expression.getText(src);
      if (/^test(\.(only|fixme|skip))?$/.test(text)) {
        const l = src.getLineAndCharacterOfPosition(n.expression.getStart(src)).line + 1;
        if (l === line) found = n;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
  return found;
}

function describePath(src: ts.SourceFile, call: ts.CallExpression): string {
  const names: string[] = [];
  let n: ts.Node | undefined = call.parent;
  while (n) {
    if (ts.isCallExpression(n) && /^test\.describe(\.\w+)?$/.test(n.expression.getText(src))) {
      const first = n.arguments[0];
      names.unshift(first ? literal(first, src) : "");
    }
    n = n.parent;
  }
  return names.filter(Boolean).join(" › ");
}

function importedFromSrc(src: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const st of src.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    if (!/\.\.\/src\/|@\/|\.\.\/scripts\//.test(st.moduleSpecifier.text)) continue;
    const clause = st.importClause;
    if (clause?.name) names.add(clause.name.text);
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) for (const e of clause.namedBindings.elements) names.add(e.name.text);
  }
  return names;
}

function readBody(src: ts.SourceFile, call: ts.CallExpression, fromSrc: Set<string>) {
  const fn = call.arguments.find((a): a is ts.ArrowFunction | ts.FunctionExpression => ts.isArrowFunction(a) || ts.isFunctionExpression(a));
  const steps: string[] = [];
  const data: string[] = [];
  const expected: string[] = [];
  if (!fn) return { steps, data, expected };
  const seen = new Set<string>();
  const add = (list: string[], text: string | undefined) => {
    if (!text) return;
    const key = `${list === steps ? "s" : list === data ? "d" : "e"}:${text}`;
    if (seen.has(key)) return;
    seen.add(key);
    list.push(text);
  };
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n)) {
      const exp = describeExpect(n, src);
      if (exp) add(expected, exp);
      else {
        const act = describeAction(n, src);
        add(steps, act.step);
        add(data, act.data);
        if (!act.step && ts.isIdentifier(n.expression) && fromSrc.has(n.expression.text)) {
          add(steps, `Call ${n.expression.text}(${clip(squash(n.arguments.map((a) => a.getText(src)).join(", ")), 80)})`);
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(fn.body);
  return { steps, data, expected };
}

// ---------------------------------------------------------------------------
// Category, priority, preconditions
// ---------------------------------------------------------------------------

export function classify(title: string, file: string): Category {
  const t = title.toLowerCase();
  const w = (...words: string[]) => new RegExp(`\\b(?:${words.join("|")})`, "i").test(t);
  if (w("axe", "keyboard", "aria", "screen reader", "focus", "landmark", "contrast", "wcag", "a11y", "accessib", "tab stop", "skip link") || file === "a11y") return "Accessibility";
  if (/(^|[^0-9])(375|768|1280)px|viewport|sideways|phone|tablet|mobile|horizontal (page )?scroll|responsive/.test(t) || file === "responsive-visual") return "Responsive";
  if (w("concurren", "parallel", "at once", "two saves", "simultaneous", "six simultaneous", "race")) return "Concurrency";
  if (w("signed-out", "signed out", "unauthori", "anonymous", "401", "403", "forbidden", "not available to", "cannot see", "cannot find", "another player", "only the dm", "dm-only", "player cannot", "players cannot", "read-only", "redirects a player", "a player has no", "a player gets", "a player sees no", "non-gm", "ungranted", "without a grant", "no grant", "hidden from") || ["rbac", "rbac-inheritance", "rbac-panel", "entries-player-readonly"].includes(file)) return "Permission & Auth";
  if (w("xss", "inject", "sanitis", "sanitiz", "escape", "leak", "secret", "tamper", "hostile", "csrf", "throttle", "429", "rate limit", "traversal", "denylist", "licen[cs]e", "enumeration", "open-redirect", "nowhere in the page", "never read") || file === "search-safety") return "Security";
  if (w("round-trip", "idempotent", "checksum", "nothing is (created|stored|saved)", "rolled back", "transaction", "orphan", "integrity", "cascade", "unchanged", "changes nothing", "removes its pins", "never decreases", "additive", "restores its content", "round-trips")) return "Data Integrity";
  if (w("boundary", "limit", "ceiling", "floor", "21st", "at most", "at least", "exactly", "too long", "too large", "too many", "edges", "within 33", "first and last", "between 100%", "oversized", "biggest")) return "Boundary";
  if (w("invalid", "refus", "reject", "malformed", "not allowed", "missing", "empty", "blank", "wrong", "bad ", "unknown", "junk", "garbage", "not a ", "cannot be saved", "disabled until", "bypass", "validation", "must ", "stays on /login")) return "Validation";
  if (w("fail", "error", "recover", "try again", "friendly", "corrupt", "rollback", "broken", "unavailable", "404", "no results")) return "Error & Recovery";
  if (w("edge", "unicode", "emoji", "very long", "zero", "negative", "ties", "tie ", "only one", "single", "special characters", "whitespace", "case-insensitive", "accents?", "reduced motion", "no portrait", "stable")) return "Edge";
  return "Happy";
}

function priorityFor(category: Category, module: string): Priority {
  if (["Security", "Permission & Auth", "Data Integrity"].includes(category)) return "P0";
  if (["AUTH", "DOOR", "RBAC", "RBACI", "RBACP", "CHRA", "CHRE"].includes(module)) return "P0";
  if (["Validation", "Concurrency", "Error & Recovery", "Boundary"].includes(category)) return "P1";
  if (["Accessibility", "Responsive", "Edge"].includes(category)) return "P2";
  return module === "HEALTH" || module === "SHELL" || module === "PAGE" || module === "ENT" ? "P1" : "P2";
}

function preconditionsFor(sourceText: string, body: string, module: string): string[] {
  const usesApp = /\b(page|request|browser|context)\b|\bquery\(|\bfetch\(/.test(body);
  if (!usesApp) return ["None: a unit-level check of pure logic, run without the app"];
  const out = ["App served by `next dev` on http://localhost:3000, backed by the local Postgres test database with the codex content loaded"];
  const makesPlayer = /createTestPlayer|newPlayer|\blogin\(|\/api\/auth\/player|\/api\/auth\/register/.test(body);
  const asDm = /dm\.json|storageState/.test(body) || (!makesPlayer && /storageState/.test(sourceText));
  if (module === "AUTH" || module === "DOOR") out.push("Starts signed out unless the test says otherwise");
  else if (makesPlayer && asDm) out.push("A fresh test player account (removed afterwards) and the seeded DM session");
  else if (makesPlayer) out.push("A fresh test player account (removed afterwards)");
  else if (asDm) out.push("Signed in as the seeded DM account (storage state saved by the global setup)");
  else out.push("Signed out (no session)");
  if (/addInitScript/.test(body)) out.push("Browser storage is prepared before the page loads");
  if (/createTestPlayer|newPlayer|INSERT INTO/.test(body)) out.push("Test rows use a `Zz`/`zz-` prefix and are deleted afterwards");
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

type ListedSpec = { file: string; line: number; title: string; describe: string };

export function loadIds(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(IDS_FILE, "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

export function saveIds(ids: Record<string, string>): void {
  fs.mkdirSync(path.dirname(IDS_FILE), { recursive: true });
  const sorted = Object.fromEntries(Object.entries(ids).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(IDS_FILE, `${JSON.stringify(sorted, null, 1)}\n`);
}

/** The stable key a test is remembered by: spec file, its describe path (which carries the role or theme a test runs under) and its title with any TC prefix removed. */
export function idKey(file: string, describe: string, title: string): string {
  return `${file}::${describe}::${title.replace(/^\[TC-[A-Z0-9]+-\d{3}\]\s*/, "")}`;
}

/** Hand corrections to the keyword classifier: `{ "TC-XXX-001": { "category": "...", "priority": "P1" } }`. */
function loadOverrides(): Record<string, { category?: Category; priority?: Priority }> {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "..", "test-cases", "overrides.json"), "utf8"));
  } catch {
    return {};
  }
}

export function buildCatalogue(listed: ListedSpec[], testsDir: string): TestCase[] {
  const ids = loadIds();
  const overrides = loadOverrides();
  const counters: Record<string, number> = {};
  for (const id of Object.values(ids)) {
    const m = /^TC-([A-Z0-9]+)-(\d{3})$/.exec(id);
    if (m) counters[m[1]] = Math.max(counters[m[1]] ?? 0, Number(m[2]));
  }
  const sources = new Map<string, ts.SourceFile>();
  const cases: TestCase[] = [];
  for (const spec of listed) {
    const base = spec.file.replace(/\.spec\.ts$/, "");
    const mod = MODULES[base];
    if (!mod) throw new Error(`No module is defined for ${spec.file}; add it to MODULES in scripts/lib/test-catalogue.ts`);
    const full = path.join(testsDir, spec.file);
    let src = sources.get(full);
    if (!src) {
      src = ts.createSourceFile(full, fs.readFileSync(full, "utf8"), ts.ScriptTarget.Latest, true);
      sources.set(full, src);
    }
    const key = idKey(spec.file, spec.describe, spec.title);
    if (!ids[key]) {
      counters[mod[0]] = (counters[mod[0]] ?? 0) + 1;
      ids[key] = `TC-${mod[0]}-${String(counters[mod[0]]).padStart(3, "0")}`;
    }
    const call = findTestCall(src, spec.line);
    const body = call ? call.getText(src) : "";
    const fromSrc = importedFromSrc(src);
    const { steps, data, expected } = call ? readBody(src, call, fromSrc) : { steps: [], data: [], expected: [] };
    const title = spec.title.replace(/^\[TC-[A-Z0-9]+-\d{3}\]\s*/, "");
    const ov = overrides[ids[key]] ?? {};
    const category = ov.category ?? classify(title, base);
    const describeName = call ? describePath(src, call) : spec.describe;
    const cap = (list: string[], n: number) => (list.length > n ? [...list.slice(0, n), `…and ${list.length - n} more`] : list);
    cases.push({
      id: ids[key],
      module: mod[0],
      moduleName: mod[1],
      category,
      priority: ov.priority ?? priorityFor(category, mod[0]),
      file: spec.file,
      line: spec.line,
      describe: describeName,
      title,
      preconditions: preconditionsFor(src.text, body, mod[0]),
      steps: steps.length > 0 ? cap(steps, 14) : ["Run the checks in the spec body (no browser actions: a unit-level test)"],
      testData: cap(data, 8),
      expected: [title, ...cap(expected, 9)],
    });
  }
  // Forget ids of tests that no longer exist, so the table matches the suite.
  const live = new Set(listed.map((spec) => idKey(spec.file, spec.describe, spec.title)));
  for (const key of Object.keys(ids)) if (!live.has(key)) delete ids[key];
  saveIds(ids);
  return cases;
}

/** Walks `playwright --list --reporter=json` output into flat specs. */
export function flattenList(report: unknown): ListedSpec[] {
  const out: ListedSpec[] = [];
  type Suite = { title?: string; file?: string; suites?: Suite[]; specs?: { title: string; file: string; line: number }[] };
  const walk = (s: Suite, trail: string[]) => {
    const here = s.file && s.title === s.file ? trail : s.title ? [...trail, s.title] : trail;
    for (const sp of s.specs ?? []) out.push({ file: path.basename(sp.file), line: sp.line, title: sp.title, describe: here.join(" › ") });
    for (const c of s.suites ?? []) walk(c, here);
  };
  for (const s of (report as { suites: Suite[] }).suites) walk(s, []);
  return out;
}
