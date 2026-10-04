# IMPLEMENTATION_TRACKER.md

Tracks execution of `PLAN.md` v2. A row moves to TESTED/DONE only with evidence observed in-session.
Test DB: local disposable `asetheria-test-pg` (docker, port 55432). Never Neon.
Previous tracker: `docs/IMPLEMENTATION_TRACKER-archive-rbac-2026-09.md`.

Status key: NOT STARTED / IN PROGRESS / IMPLEMENTED / TESTED / DONE / BLOCKED

| # | Phase | Files touched (main) | Dependencies | Status |
|---|---|---|---|---|
| 0 | Prod catch-up (Neon) | none (ops only) | Neon `DATABASE_URL` from user | **BLOCKED: awaiting credential** (code phases proceed locally) |
| 1 | Enum migration: `fauna` + `table`; retag fauna; roll_tables → table entries | `src/db/schema.ts`, `src/lib/kinds.ts`, `src/lib/rbac.ts`, `src/lib/validation.ts`, `scripts/import-codex-file.ts`, `scripts/migrate-fauna-and-tables.ts`, `scripts/sql/*`, drizzle migration, tests | none | **DONE** |
| 2a | Design foundation: shadcn spike, tokens + refresh, next-themes, motion presets | `components.json`, `src/lib/utils.ts`, `src/lib/motion.ts`, `src/components/ui/*`, `src/app/globals.css`, `src/app/layout.tsx`, `docs/design-*.md` | 1 | **DONE** |
| 2b | Shell + auth pages | `app-shell`, `theme-toggle`, login/register/welcome/onboarding | 2a | **DONE** |
| 2c | Codex pages (+ loading/error/empty) | `entry-card`, `codex/**`, `loading.tsx`, `error.tsx` | 2b | **DONE** |
| 2d | Editor, palette, graph, shortcuts | `entry-form`, `markdown-editor`, `command-palette`, `graph-view`, `keyboard-shortcuts` | 2c | **DONE** |
| 2e | Tools + admin + sweep (grep gates, axe) | `tools/*`, `admin/*`, `rbac-panel` | 2d | **DONE** |
| 3 | `fauna` + `table` UI and field model; roller | `kinds.ts`, `codex/tables`, roller, `tools/tables` redirect | 1, 2e | NOT STARTED |
| 4 | Licence-safe ingestion + original specimens | `data/natural-world/*`, `scripts/import-open5e-docs.ts`, attribution note, `docs/content-review.md` | 3 | NOT STARTED |
| 5 | Places, structures, `foundIn` linkage (+ R5 field-link leak fix first) | `data/places-*.json`, `src/lib/entries.ts`, link rendering, `verify-links.ts` | 4 | NOT STARTED |
| 6 | Authored `table` entries (+24) | `data/tables-*.json` | 5 | NOT STARTED |
| 7 | Database view per kind | `codex/[kindSlug]/*`, `entries.ts` | 5 | NOT STARTED |
| 8a | Card layout, templates, local graph, recently viewed | entry page, `entry-form`, `graph-view`, palette | 7 | NOT STARTED |
| 8b | Interactive map + pins (`maps`, `map_pins`) | schema, migration, `src/app/(app)/maps/*`, `public/maps/*` | 8a | NOT STARTED |
| 8c | World graph upgrades | `graph-view`, `getGraphData` | 8a | NOT STARTED |
| 8d | Campaign planner | `session` kind UI, commands, encounter builder, bulk reveal | 8b, 6 | NOT STARTED |
| T | `test-cases.html`, Playwright mirror, `TEST-REPORT.md` | `test-cases.html`, `tests/tc-*.spec.ts` | all | NOT STARTED |

## Baseline (before any change), session start 2026-10-04
- `tsc --noEmit`: exit 0 (observed).
- Working tree already contained uncommitted prior work: `src/lib/rbac.ts` (ancestor-location grant inheritance) and `tests/rbac-inheritance.spec.ts`. Treated as the pre-existing baseline; its pass/fail is recorded below once the baseline suite finishes.
- Full Playwright baseline: 94 tests; 93 passed in the full run. The 1 failure (`graph-and-table-view.spec.ts` graph click) was a trace-file `ENOENT` caused by me starting a second Playwright process that wiped `test-results/` mid-run; re-run alone, the spec passed (3/3). Baseline = green. Lesson: never run two Playwright invocations at once.
- `npm run check:links` baseline (added in Phase 1): 757 active entries, **2 pre-existing unresolved links** (Hecate body -> [[Madame Trioditis]]; The Letter summary -> [[The Aletheion Heist]]). Phase gates use `--max 2` until they are fixed (out-of-scope item, see PLAN.md §5).
- A hydration-mismatch warning from `graph-view.tsx` (inline `style={{cursor:"pointer"}}` on SVG nodes) appears in the dev-server log. Pre-existing; addressed in Phase 2d.

## Acceptance criteria and evidence
Criteria text lives in `PLAN.md` §3. Evidence is appended per phase below as it is observed.

### Phase 1: DONE (2026-10-04)

Built: enum values `fauna`/`table` (`src/db/schema.ts`, appended last; `scripts/sql/setup.sql` ALTER TYPE lines); `src/lib/roll-table.ts` (shared Markdown-table format, `diceSpan`, `checkCoverage`); `scripts/migrate-fauna-and-tables.ts` (dry run default, `--apply`, `--revert --apply`); `scripts/check-links.ts` (DB-backed unresolved-link checker, `npm run check:links`); `kinds.ts` (flora relabelled "Flora", slug `flora`; new `fauna` and `table` kinds; `LEGACY_SECTION_SLUGS` so `/codex/flora-fauna` redirects); `links.ts` kind priority; palette icons; `add-flora-fauna-ores.ts` now inserts fauna as `fauna`.

Evidence (all observed this session):
1. `/codex/fauna` lists the 8 animals, slugs unchanged: `kind-migration.spec.ts` tests 2 and 6 pass; only the `kind` column is updated.
2. Every roll table has a matching entry: migration script printed `verified: 16 roll tables <-> 16 table entries (dice and row counts equal)`; test 3 re-checks per table; no slug clash lines were printed.
3. `/codex/flora-fauna` still resolves (redirect to `/codex/flora`): test 7 passes.
4. Access: ungranted player sees empty sections, 404 on entries, nothing in `/api/find`; granted player sees public fauna and not a secret one: tests 8 and 9 pass. **Plan correction:** the plan said 404 on the section page; the app returns 200-with-empty for every kind, so the criterion was corrected in PLAN.md (not the app).
5. `check:links`: 2 unresolved, both pre-existing (see baseline). `tsc --noEmit` exit 0; `next build` completed and listed all routes.
6. Re-running `--apply` printed `retagged to fauna: 0` and `table entries created: 0`; test 4 also asserts the entry count is unchanged.
Full suite after Phase 1: **111 passed** (94 baseline + 8 `roll-table.spec.ts` + 9 `kind-migration.spec.ts`), 0 failed.

Rollback: `npx tsx scripts/migrate-fauna-and-tables.ts --revert --apply` (fauna back to flora; migrated table entries archived, not deleted). Enum values stay (Postgres limitation).
Prod rollout: pending Phase 0 credential. Steps: backup via `/api/export`; `psql -f scripts/sql/setup.sql`; `npx tsx scripts/migrate-fauna-and-tables.ts` (dry run), then `--apply`; `npm run embeddings:generate`.
Known gap: `lint` is `tsc --noEmit` only (no ESLint configured); no separate lint step exists to run.
Note: until Phase 3 replaces `/tools/tables`, tables created in the old tool after this migration are not entries; re-running the migration script copies them.

### Phase 2a (design foundation): DONE (2026-10-04)

Built: shadcn (radix, vega preset) with 24 UI components in `src/components/ui/`; `components.json`; `src/lib/utils.ts`; **refreshed token layer** `src/styles/design-tokens.css` (+ `docs/design-tokens.md`); `src/app/globals.css` now imports tokens + inlined vendor CSS `src/styles/shadcn.css`; `next-themes` (`ThemeProvider`, `attribute="data-theme"`, old storage key kept) and a pre-hydration sanitizer in `layout.tsx`; `MotionProvider` (`reducedMotion="user"`), `src/lib/motion.ts` presets, `FadeIn` / `SlideUp` / `StaggerContainer`; `scripts/lib/contrast.ts` + `scripts/check-contrast.ts`; `scripts/capture-design-shots.ts`; `docs/design-migration.md` (spike notes, go/no-go: **go**).

Evidence (observed):
1. No flash and persistence: `tests/theme.spec.ts` 5/5 pass. Default dark at DOMContentLoaded (body bg `rgb(11, 10, 9)`), a stored light theme paints `rgb(247, 241, 228)` at DOMContentLoaded before hydration, the toggle writes `localStorage["asetheria-theme"]` and a hard reload keeps the choice, a garbage stored value is discarded.
2. Contrast: `tests/design-tokens.spec.ts` 4/4 pass; every text pair >= 4.5:1 and every control border / focus ring >= 3:1 in both themes (table in `docs/design-tokens.md`; lowest text ratio 4.76 meta-on-card dark, lowest control border 3.54 dark input on card).
3. `tsc --noEmit` exit 0; `next build` compiled and generated 21 pages; full suite **120 passed** (111 + 4 + 5), 0 failed. `npm audit --omit=dev`: 0 vulnerabilities.
4. `docs/design-migration.md` records the commands that worked.
5. Before/after screenshots at 375/768/1280 in both themes: `test-results/design/before` and `test-results/design/after` (30 each; local, git-ignored). 2a changes tokens only; layout changes arrive with 2b to 2e.

Bugs found and fixed in this phase (by tests):
- Toggle label caused a React hydration mismatch (server cannot know the stored theme): label is generic until mounted.
- next-themes accepted any stored string (`"neon"` became `data-theme="neon"`): added the sanitizer script.
- `shadcn` as a runtime dependency added 7 high advisories to `npm audit --omit=dev` (baseline 0): ejected (`shadcn eject`), vendor CSS inlined.
- shadcn init clashed with legacy `--accent` / `--border` meanings: legacy variables renamed (`--gold`, `--gold-soft`, `--border-strong`) before the new tokens were added.
Known/pre-existing: hydration warning in `graph-view.tsx` (slice 2d). `lint` is still `tsc --noEmit` only.
Plan adjustment (documented in `docs/design-migration.md`): the 2e grep gate exempts `src/styles/shadcn.css`, `src/components/ui/*`, and `src/app/(app)/tools/tables/*` (deleted in Phase 3).

### Phase 2b (shell + auth pages): DONE (2026-10-04)

Built: `AppShell` rewritten (shadcn Button/Badge/Sheet/ScrollArea/Tooltip, lucide icons, Motion page transition, skip link, mobile drawer is a focus-trapping Sheet); `src/lib/section-icons.ts` (lucide per kind and location tier); `AuthShell` and `FormMessage` shared components; login (+ skeleton `loading.tsx`), register, welcome (two doors), onboarding pages and forms on shadcn Input/Label/Button/Card; `ThemeToggle` on shadcn Button. `tests/app-shell.spec.ts` (8 tests).

Evidence (observed):
1. Login keeps `#username`, `#password`, `#door-error`, button names "Enter", "Enter as a player", "Enter the codex", "Join the party", "Show password"/"Hide password"; `auth.spec.ts` (14), `entry-doors.spec.ts` (7), `rbac.spec.ts` onboarding, `responsive-visual.spec.ts` (5) all pass unchanged except the two assertions below.
2. Keyboard-only login works (responsive-visual keyboard test passes); skip link is the first tab stop and moves focus to `#main` (app-shell test).
3. Mobile 375px: sidebar hidden, drawer opens as `role=dialog`, Escape closes it and focus returns to the menu button, choosing a section navigates and closes (app-shell tests 3 and 4).
4. No horizontal scroll at 375/768/1280 (app-shell test 6).
5. Nav icons are SVGs, zero emoji in the nav text, exactly one `aria-current="page"` link (app-shell test 1).
6. Screenshots of five key pages x 3 widths x 2 themes: `test-results/design/after-2b`.
Totals: `tsc` exit 0; `next build` compiled and generated 21 pages; full suite **128 passed** (120 + 8), 0 failed.

Test edits (rule 3 justification): `auth.spec.ts` matched the role badge by its emoji text (`"⚜ DM"`, `"☗ Player"`). The project rule requires lucide-react icons, so the glyph is gone; the assertions now match the badge by its `title` ("Full edit access" / "Read-only access"). The intent (role badge visible for the right role) is unchanged.
Known leftovers for later slices: arbitrary font sizes such as `text-[13px]`/`text-[11px]` in new components are swept in 2e; plain `.btn`/`.card` legacy classes remain in untouched screens (2c to 2e).

### Phase 2c (codex pages): DONE (2026-10-04)

Scope note: the slice also covers the front page (`(app)/page.tsx`, `prologue.tsx`), search and archive pages because they all render `EntryCard`/`PageHeading`/`EmptyState`; moving those components forces their callers.

Built: `entry-card.tsx` (EntryCard, PageHeading, EmptyState, CardGrid with Motion stagger) on shadcn Card/Badge + lucide; kind section page (`KindFilter` on Input/Button/Table, sortable columns, tag chips, view toggle, pagination); entry page (Breadcrumb, header, properties Card, Alert, outline Card, DM notes, connections rail, `ArchiveButton` as an AlertDialog); search page; archive page + row; front page with `EntryStrip`; `ErrorState`, root `error.tsx` and `(app)/error.tsx` using Next 16 `retry`; `(app)/not-found.tsx`; Suspense skeletons (`shared/skeletons.tsx`). New specs: `codex-ui.spec.ts` (10), `error-states.spec.ts` (1).

Evidence (observed):
1. Error boundary is real and recovers: `error-states.spec.ts` renames the `entries` table away, the page shows "Something went wrong" + "Try again", no driver text/table name/stack in the body, the table is restored, "Try again" brings the NPCs section back. Passes.
2. Not-found stays a real 404: `/codex/not-a-section` and `/codex/entry/not-an-entry-xyz` return 404 with the friendly page and a "Back to the front page" link (codex-ui test 4). Probed directly: with a route-level `loading.tsx` the same URL returned **200**; removed it and re-probed 404.
3. Empty states: player on an unrevealed section sees icon + "No fauna yet" + hint and no create button (test 8); search with no hits and unknown tag show empty states with a recovery link (tests 9, 10); filter-no-match shows "Nothing matches that filter" with a working "Clear filters" button (test 2).
4. Cards: SVG icons only, zero emoji in the main region, filter narrows and reports "N of M", tag chips toggle `aria-pressed` (tests 1 to 3).
5. Entry page: breadcrumb ends in the current page (`aria-current`), Archive opens an alertdialog, Cancel/Escape leave the entry unarchived (DB asserted) and return focus to the trigger (test 6). `.prose-codex`, `#sec-*` anchors, wiki links and DM notes unchanged: `knowledge-features.spec.ts`, `city-locations.spec.ts`, `entries-crud.spec.ts` pass.
6. `tsc` exit 0; `next build` compiled, 21 pages; `npm audit --omit=dev` 0 vulnerabilities; full suite **139 passed** (128 + 10 + 1), 0 failed.

Bugs found by tests and fixed in the app:
- shadcn `BreadcrumbPage` exposed the current page as `role="link"` (a second link with the page's own name; broke `getByRole("link", {name: "playwright"})` strict matching and is wrong for assistive tech): removed the role in `ui/breadcrumb.tsx` (listed in `docs/design-migration.md`).
- Route-level `loading.tsx` turned unknown pages into HTTP 200 (see evidence 2): replaced with Suspense skeletons; plan criterion corrected in PLAN.md.

Test edits (rule 3 justification): selectors/names tied to the old markup, intent unchanged. `div.card` / `li.card` locators became `[data-slot="card"]` (shadcn's stable hook) in `helpers.ts` and `entries-crud.spec.ts`; button names lost their emoji prefix (`"🗄 Archive"` -> `"Archive"`, `"↩ Restore"` -> `"Restore"`, `"☰ Table"` -> `"Table"`) and `"⊘ DM only"` became `"DM only: hidden from players"` because the glyphs are now lucide icons (project rule). `rbac-panel.spec.ts` and `roll-tables.spec.ts` still use `.card`; they are migrated with their screens in 2e and Phase 3.
Not covered by a skeleton by design: entry pages (they can 404) render fully before the first byte.

### Phase 2d (editor, palette, graph, shortcuts): DONE (2026-10-04)

Built: `EntryForm` (shadcn Input/Label/NativeSelect/RadioGroup/Textarea, `FormSection` labelled groups, `FormMessage`), `MarkdownEditor` (Tabs, Alert, Textarea; textarea stays mounted for submission), `CommandPalette` (Dialog + DialogTrigger, same actions/entries/`/api/find` logic, rows are still buttons), `KeyboardShortcuts` help sheet (Dialog), `GraphView` (token colours in five groups + legend, keyboard focus ring), new/edit pages, `RevisionList`. Graph layout moved to `src/lib/graph-layout.ts` and computed on the server. New spec: `tests/editor-ui.spec.ts` (10).

Evidence (observed):
1. All pre-existing editor/palette/shortcut assertions pass without edits to `knowledge-features.spec.ts` or `search-palette.spec.ts` (`[[` autocomplete + Enter inserts, Preview tab, draft restore, Ctrl+K palette actions, g-chords, `?` sheet, shortcuts blocked while typing, player has no create command): 33 of 33 in the targeted run.
2. Labels and groups: every form control has a bound visible label and the sections are labelled groups (`editor-ui` test 1); the Type select switches the details group to "Ore details" and exposes "Cost per lb." (same test).
3. Validation: whitespace name is refused by the server with the friendly "Every entry needs a name." message in a `p[role=alert]`, URL stays on /codex/new (test 2).
4. Keyboard: Ctrl+S saves; arrow keys move through the visibility radios and the saved entry is `secret` in the DB (test 3). Palette opens focused on the search box; Escape returns focus to the trigger (test 6); Enter on a command runs it; empty results offer a full-text search (test 7); the `?` sheet is a labelled dialog with a Close button (test 8).
5. Draft: Discard hides the banner and clears `asetheria-draft:new` (test 4). 375px form has no horizontal overflow (test 5).
6. Graph: loads with **zero console errors**, five legend items, nodes are focusable and show their label on focus (test 9).
7. `tsc` exit 0, `next build` OK (21 pages), `npm audit --omit=dev` 0, full suite **149 passed** (139 + 10), 0 failed.

Bugs found by tests and fixed in the app:
- **Graph hydration mismatch (pre-existing since baseline, logged as known):** server and client each ran the chaotic force layout; Node and Chromium use different V8 builds of the math functions, so a last-bit difference grew into a completely different layout (`x1="188.3"` vs `326.2`). Fix: layout runs only on the server and is passed down as data (`layoutGraph` in the graph page); the client only draws. The earlier "round to 0.1px" attempt could not fix a divergence of this size.
- Palette returned focus to `<body>` on close: Radix only restores focus to a real `DialogTrigger`; the trigger button is now one.
Test edits (rule 3 justification, intent unchanged): `helpers.ts` and `entries-crud.spec.ts` selected the visibility radios with `input[name="visibility"][value=...]` and a button named `"+ Add private notes"`. The radios are now a Radix group (found by accessible name: Everyone / DM only / Revealed) and the button is "Add private notes" (lucide icon instead of a "+" glyph).
Test-timing note: Radix selects on the focus move only while an arrow key is still down, so the test presses it with `delay: 60`, as a human does; a zero-delay synthetic press moves focus without selecting.
Remaining for 2e: `command-palette`/shell now clean; legacy `.btn/.card/.input/...` CSS is still present for the tools, admin and RBAC screens.

### Phase 2e (tools, admin, sweep): DONE (2026-10-04). Phase 2 (design migration) complete.

Built: dice roller + page, Backup & Import page + `ImportPanel`, Players & Access page + `RbacPanel` (Checkbox, NativeSelect, Badge), all on shadcn/ui; legacy component CSS removed from `globals.css` (kept only for the doomed tables tool in `tools/tables/legacy.css`); legacy colour aliases and the emoji icon fields removed (`KindDef.icon`, `kindIcon`); `skeleton.tsx` deleted; static design gates (`scripts/lib/design-gates.ts`, `npm run check:design`) with a spec that proves each rule fires; axe audit spec; motion spec; tokens doc regenerated.

Evidence (observed):
1. **Grep gates:** `npm run check:design` = 12 rules, 0 violations (no hardcoded colour utilities, no colour literals, no `@keyframes`, no CSS animation utilities except the button spinner, no inline `style={{`, no plain button/select/textarea/input except `type=hidden`, no emoji in UI code, no arbitrary spacing values, no `console.log`, no `any`/`@ts-ignore`, no palette primitives outside the token file). Exemptions are explicit and justified in the file: generated `components/ui/*`, vendor `styles/shadcn.css`, the legacy tables tool (deleted in Phase 3), `layout.tsx` `themeColor` (browser chrome cannot read CSS variables; a test asserts it equals the token backgrounds), and one instruction string in `session.ts`. `tests/design-gates.spec.ts` also proves each rule fires on a known-bad sample.
2. **Accessibility:** `tests/a11y.spec.ts` runs axe (WCAG 2 A/AA, 2.1 AA, 2.2 AA) on 12 routes x 2 themes plus the open mobile drawer and open palette: **25 of 25 pass with 0 serious/critical** after the entrance animations settle.
3. **Reduced motion:** `tests/motion.spec.ts` (3): with `prefers-reduced-motion` nothing is ever visible while offset and content ends at opacity 1; with normal motion content settles at opacity 1, transform none; no list card is left invisible after the stagger.
4. Dice, admin and RBAC behaviour: `tools-admin.spec.ts` (10): roll/preset/invalid/boundary (500 dice ok, 501 refused with the engine's message)/log persistence/clear/notation reference; admin counts + both download links, "no file", "not JSON", "not a backup", and a real additive restore reporting "1 added, 0 updated"; `rbac-panel.spec.ts` passes with the new markup.
5. `tsc` exit 0; `next build` compiled (21 pages); `npm audit --omit=dev` 0; contrast gate green; `check:links` still 2 (the pre-existing baseline); full suite **190 passed** (149 + 41), 0 failed.
6. Before/after sets saved locally: `test-results/design/{before,after,after-2b,after-2c,after-2d,final-2e}`.

Bugs found by the new tests and fixed in the app:
- axe: the Markdown editor textarea had no accessible name and used `aria-expanded` (invalid on a textbox): now `aria-label="Description"` + `aria-activedescendant`.
- axe: graph SVG was `role="img"` containing focusable nodes (nested-interactive): now `role="group"` with the same label.
- axe: low-contrast inactive tab label (3.84:1), nav counts on the active row (3.86:1), meta text on secondary badges (4.17:1), and 19px-tall "N more" links below the 24px target size. Fixed in tabs, nav, a stronger dark `--faint-foreground`, and `min-h-6` on those links; the contrast gate gained eight more pairs so the token file itself now guarantees them.
- **Pre-existing (dice):** the saved roll log was overwritten by an empty save before it was restored (visible when React runs effects twice in development). Saving now waits for the restore.
Test edits (rule 3 justification): `graph-and-table-view.spec.ts` and `editor-ui.spec.ts` look the graph up as `role=group` (was `img`), because an `img` may not contain interactive children; `rbac-panel.spec.ts` selects the kind row by `[data-slot="card"]` (was `li.card`).
Known leftover (planned): `tools/tables` (legacy manager, own stylesheet) is removed in Phase 3. The graph is a dense ring for 600+ nodes; filtering and clustering are Phase 8c.

#### Phase 2 acceptance walk (PLAN.md Phase 2a to 2e)
- 2a: no-flash theme persistence, contrast >= 4.5:1 / 3:1 in both themes, build + suite green, spike notes, before/after screenshots: all evidenced above (go decision recorded).
- 2b: auth page ids/names preserved, keyboard-only login, 375px drawer, screenshots: evidenced.
- 2c: error/not-found/empty/skeleton states, `.prose-codex` and `#sec-*` preserved (criterion corrected for Suspense vs `loading.tsx`): evidenced.
- 2d: `knowledge-features.spec.ts` unchanged and green: evidenced.
- 2e: grep gate, axe, reduced motion: evidenced above.
