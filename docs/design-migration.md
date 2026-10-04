# Design migration: shadcn/ui + Motion (notes from the Phase 2a spike)

The Phase 2a go/no-go gate: can shadcn/ui, Tailwind v4, React 19, Next 16, next-themes and Motion coexist
with the existing `data-theme` switching and the legacy hand-rolled CSS? **Result: go.** Exact steps that worked:

```bash
# shadcn 4.x, Radix base, "vega" preset. -y alone prompts for a preset and exits, so pass -p.
npx shadcn@latest init -t next -b radix -p vega -y --css-variables --no-rtl --no-pointer

# next-themes and Motion
npm install next-themes motion

# Components used by the app (re-run `add` for others as slices need them)
npx shadcn@latest add card input textarea label badge skeleton separator dialog select tabs \
  tooltip popover dropdown-menu scroll-area switch checkbox table alert sheet collapsible sonner command -y

# Remove the shadcn CLI as a runtime dependency (see "Audit" below)
npx shadcn@latest eject -y
```

## Versions (observed)
next 16.3.8 · react 19.3.0 · tailwindcss 4.3.3 · shadcn CLI 4.21.1 (style `radix-vega`) · radix-ui 1.6.7 ·
motion 14.0.0 · next-themes 0.4.6 · lucide-react 1.51.0 · cmdk 1.1.1 · sonner 2.0.8.

## What the init changes, and what we did about it
- `components.json`, `src/lib/utils.ts` (`export { cn } from "cn"`; `cn` is shadcn's own package) and
  `src/components/ui/*` are created. Components import `cn` from `"cn"`.
- It **appends** a default grey token set to `globals.css`, including `--accent` and `--border` with
  *different meanings* from this app's legacy variables (`--accent` was gold, `--border` the stronger border).
  Legacy references were renamed first (`--accent` -> `--gold`, `--accent-soft` -> `--gold-soft`,
  `--border` -> `--border-strong`) and the default grey tokens were replaced by the Asetheria tokens in
  `src/styles/design-tokens.css`.
- It also writes `--font-sans: var(--font-sans)` (a self-reference). Discarded; fonts stay as declared in
  `design-tokens.css` from the `next/font` variables in `src/app/layout.tsx`.

## Audit: `shadcn` must not be a runtime dependency
Leaving `shadcn` in `dependencies` pulls build-tooling packages (ts-morph / fast-glob chain) into
`npm audit --omit=dev`: **7 high-severity advisories** against a baseline of 0, which fails the CI audit
gate. `shadcn eject` inlines the one runtime file it provided (`shadcn/tailwind.css`) and removes the package.
The inlined vendor CSS lives in `src/styles/shadcn.css`; after eject `npm audit --omit=dev` reports 0 again.
The `npx shadcn@latest add ...` command still works (it does not need a local install).

## Theme switching
shadcn expects a `.dark` class; this app uses `data-theme="light|dark"`. `@custom-variant dark` in
`globals.css` targets the attribute, so every `dark:` utility in shadcn components works unchanged.
`next-themes` is configured with `attribute="data-theme"`, `storageKey="asetheria-theme"` (the key the old
script used, so saved preferences survive), `defaultTheme="dark"`, `enableSystem={false}`.
Two details found by tests:
1. The toggle label must not depend on the theme until after mount, or React reports a hydration mismatch
   (server cannot know the stored theme).
2. next-themes trusts any stored string; a tiny head script discards invalid values before it runs.

## Next 16 differences that matter for the slices
- Route error boundaries receive `retry()` (re-fetch and re-render the segment); `reset()` still exists.
  New `error.tsx` files use `retry`.
- Providers are Client Components wrapping `children` in the root layout (`ThemeProvider`, `MotionProvider`).

## Exemptions to the design-system grep gate (slice 2e)
- `src/styles/shadcn.css`: vendor CSS with framework `@keyframes`.
- `src/components/ui/*`: the plain `<button>` / `<input>` live inside the shadcn wrappers by definition.
- ~~`src/app/(app)/tools/tables/*`~~: removed in Phase 3 (random tables are `table` entries); `/tools/tables` now permanently redirects to `/codex/tables`. The gate has no exemption for it any more.

## Local edits to generated shadcn components (`src/components/ui/*`)
Keep this list current so a future `shadcn add --overwrite` does not silently undo them.
- `breadcrumb.tsx` `BreadcrumbPage`: removed `role="link"` and `aria-disabled`. The current page is plain text
  with `aria-current="page"` (WAI-ARIA breadcrumb pattern); the generated version announced the page title as a
  link, which assistive tech and tests (`getByRole("link")`) read as a second link to the same page.

## Loading states: Suspense, not route-level `loading.tsx`
A `loading.tsx` makes Next stream the shell before the page body runs, so `notFound()` afterwards still answered
**HTTP 200**. Verified in this repo: with `loading.tsx` on `/codex/[kindSlug]`, `/codex/nope-xyz` returned 200.
Missing and hidden pages must be a real 404 (the RBAC tests and the "hidden looks like missing" rule depend on it),
so skeletons are rendered inside `<Suspense>` boundaries *after* every `notFound()` / `redirect()` guard has run:
the codex section list and the front page stream behind skeletons; entry pages render fully before first byte.
(`src/app/login/loading.tsx` stays: `/login` never calls `notFound()`.)
- `tabs.tsx` `TabsTrigger`: inactive label `text-foreground/60` -> `text-muted-foreground`. The translucent version
  measured 3.84:1 on the light theme's sunken tab strip (axe `color-contrast`); the token reads 4.5:1 or better.
- `tabs.tsx` `TabsTrigger`: inactive label `text-foreground/60` -> `text-muted-foreground`. The translucent version
  measured 3.84:1 on the light theme's sunken tab strip (axe `color-contrast`); the token reads 4.5:1 or better.
