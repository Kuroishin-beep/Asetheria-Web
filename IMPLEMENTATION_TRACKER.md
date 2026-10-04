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
| 3 | `fauna` + `table` UI and field model; roller | `kinds.ts`, `codex/tables`, roller, `tools/tables` redirect | 1, 2e | **DONE** |
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

### Phase 3 (fauna + table UI and field model, roller): DONE (2026-10-04)

Built: place fields (`foundIn`, `biome`, `rarity`) on ore/flora/fauna and the fauna fields (`habitat`, `diet`, `behavior`, `harvest`) in `kinds.ts`; `foundIn` is a graph relation (`found-in`) whose names may be plain or `[[wiki links]]` (`links.ts`); `RollTableView` (rolls with the dice engine, highlights the row, announces the result, keeps the last five rolls); table entry page draws the rows (prose around the Markdown table is rendered as text); live table validation in the editor (dice + rows, named problems, "Insert starter rows", Save disabled) and the same check in the create/update server actions; `src/lib/roll-table.ts` gained `validateTable`, `stripTable`, `hasTable`, `starterTable`. The legacy tool is gone: `tools/tables/table-manager.tsx`, its CSS, `saveRollTableAction`/`archive`/`restore` and the roll-table zod schemas are deleted; `/tools/tables` permanently redirects (HTTP 308) to `/codex/tables`; Backup & Import counts `table` entries; the `g t` shortcut and palette command point at `/codex/tables`; the design gate lost its tables exemption.

Evidence (observed):
1. DM creates an animal with every field and sees each value on its page and the animal in `/codex/fauna`; stored as kind `fauna` (`fauna-ui.spec.ts` test 1). Ore, flora and fauna forms all offer Found in / Biome / Rarity (test 3). Flora and Fauna are separate sections and `/codex/flora-fauna` still opens (test 4).
2. **Roller:** every active table entry in the database is valid and 100 rolls of each always land on a row whose range contains the roll (`roll-tables.spec.ts` test 1, pure data check over the real tables); in the browser a freshly authored d4 table is rolled 100 times, every status line is "<total> <result>" with the right result for the total, and exactly one row is highlighted each time (test 3).
3. `/tools/tables` answers 308 with `Location: /codex/tables` (test 2).
4. **Broken tables cannot be saved:** overlap ("Roll 4 is in more than one row."), gap ("No row covers 3-4."), out-of-range ("outside 1d6") and bad dice ("not dice notation") are each named live and Save is disabled (tests 4 and 6); with the disabled attribute stripped, the server refuses it with "This table can't be saved yet" and creates nothing (test 5).
5. Search: the palette finds a table by name and full-text search finds it by content; a player with no grant finds nothing and gets a 404 on the entry (tests 7 and 8). *(Plan wording adjusted: the palette looks up names only, so "forage" is matched by full-text search; the table named "Herbalist's Field Guide" is matched by the palette.)*
6. `found-in` is a real connection: plain names and `[[Corinth City|the isthmus]]` both create `found-in` edges to Corinth City, an unknown name is ignored, and Corinth City's page lists both entries (`fauna-ui.spec.ts` test 2).
7. a11y: the rollable table page, the new-table form and the fauna section pass axe in both themes (6 more tests).
8. `tsc` exit 0; `next build` compiled (21 pages); `npm audit --omit=dev` 0; design gates 12 rules / 0 violations; full suite **211 passed** (190 + 21), 0 failed.

Findings:
- The plan said fields are link-scanned for `[[links]]`; they are not: only the fixed `RELATION_FIELDS` keys are read, as comma-separated plain names. `foundIn` was added to that list and the parser now also accepts `[[name]]` / `[[name|label]]`. (PLAN.md ENH-03 text was imprecise; the behaviour above is the contract.)
- A table cannot be blanked (an empty table is invalid), so the "blank then purge" cleanup does not apply to tables; test tables are archived through the normal confirmation. Real DMs lose nothing: an empty table could never have been created.
- Pre-existing, flagged for Phase 4's licence ledger: `data/homebrew/planar-metals.json` (24 entries) was imported from a GM Binder page by an earlier session (`homebrew-content.spec.ts` names it). Q1 (licence-safe only) governs new ingestion; whether to keep this older batch is a decision for you.
Prod rollout: no schema change. Deploy the code; `/tools/tables` redirects; data already migrated by Phase 1.

## Phase 4 — Natural-world content (+40 ores, +60 flora, +60 fauna) — DONE (local DB; prod import waits on Phase 0)

Evidence:
1. 160 original entries in `data/natural-world/*.json` (8 files), each grounded in public-domain facts with a `Basis:` DM note, `sourcePath: original: natural-world/<file>`. `npm run verify:natural-world`: 40/40 ore, 60/60 flora, 60/60 fauna, 0 problems (shape, fields, slug = slugified name, rarity, empire tag, licence denylist).
2. Imported locally with `import-codex-file`: ore 96, flora 90, fauna 68 active. Re-import: "0 created, 0 filled, 20 unchanged" (`natural-world-import.spec.ts`). `check:links --max 2`: 2 unresolved (both pre-existing). `embeddings:generate`: 167 embedded.
3. Every place named in `foundIn` or a `[[link]]` resolves; every entry has a `found-in` and a `mentions` edge; a place page lists them as linked mentions; full-text search finds a body-only word; a granted player sees the page and never the `Basis:` DM note.
4. `scripts/archive-batch.ts` (`npm run codex:archive-batch`) archives/restores a whole batch by `source_path`, dry run by default (tested).
5. `docs/content-licences.md` ledger written.
6. `tsc` 0; `next build` ok; `npm audit --omit=dev` 0; full suite **224 passed**, 0 failed (13 new tests).

Changed test (justified): `kind-migration.spec.ts` "exactly the eight original animals are fauna" asserted the whole fauna kind equalled the eight migrated animals; Phase 4 legitimately adds 60 more. It now asserts the eight by name are fauna and none remain in flora (same migration intent).

Open decision for you (ledger): three homebrew batches predate Q1 — `planar-metals` (24, GM Binder), `flora` herbalism (20, "external GM Binder page"), `metals` (player-supplied, origin unrecorded). Keep / rewrite as original / archive. Nothing changed.
Deviation: Open5e importer (optional in PLAN) not built.
Prod rollout: after Phase 0 (Neon URL): run the 8 imports, `links:rebuild`, `embeddings:generate`.

## Phase 5 — Places, structures, specimen linkage (ENH-03) — DONE (local DB; prod import waits on Phase 0)

Evidence per acceptance criterion:
1. **Every ore/flora/fauna has a non-empty `Found in`; no broken links:** 227 specimens gained 238 place names (94 had none). `natural-world-links.spec.ts`: query finds 0 specimens without it; every name resolves to a live page; every name is a `found-in` edge (565 edges). `check:links --max 2`: still exactly the 2 pre-existing unresolved links. (The plan's "verify:links" is `check:links`; see Phase 1.)
2. **A Location page lists its specimens:** `the-green-gallery` shows Malachite under Linked mentions, for the DM and for a granted player.
3. **R5, field links cannot leak (test written first, red, then fixed):** `Found in` rendered as plain text before; now `LinkedNames` resolves through the same role-scoped resolver as body links. DM: links to all, incl. secret. Player with location grant: link to the open place only; the secret place's name is plain text with no link, no tooltip (`[title]` count 0) and its address 404s. Player without the grant: no links at all.
4. **No orphan places:** 100 new places, each with a live location parent whose name equals `fields.region` (query assertion). Verifier whitelists 37 wild/city parents.
5. **Zero existing descriptions changed:** md5 of summary|body|dm_notes for all 990 pre-existing entries snapshotted before the import and compared after: 0 changed or removed (1090 after). The backfill writes only `fields.foundIn` (asserted on its source: one UPDATE, `jsonb_set(fields,'{foundIn}')`) and is idempotent ("0 specimens would be updated").
6. **Graph edges rise by at least the `foundIn` links:** found-in edges >= resolvable (specimen, place) pairs (asserted); 238 added.
7. `tsc` 0; `next build` ok; `npm audit --omit=dev` 0; design gates 12 rules / 0 violations; embeddings 100 new; full suite **240 passed** (224 + 16), 0 failed.

Built: `data/natural-world/places-1..4.json` (27 mines/quarries, 28 groves/growing grounds, 21 habitats, 24 structures; each with a DM-only `Hook:`), `found-in-extra.json` (2 specimens no place names), `scripts/backfill-found-in.ts`, `src/components/shared/linked-names.tsx`, `parseRelationValue`/`LINKED_FIELD_KEYS` in `src/lib/links.ts` (the link graph and the renderer now share one parser), verifier extended to places.
Test scoping change (justified): `natural-world-import.spec.ts` DB queries matched `original: natural-world/%`, which now also matches places; scoped to ore/flora/fauna (its subject). `loadAll()` now reads only `ores|flora|fauna-*.json`.
Not done: the plan's `search-safety.spec.ts` extension; the R5 and 404 assertions live in `natural-world-links.spec.ts`, which covers player access to the secret place directly.
Prod rollout (after Phase 0): import 4 places files, `backfill-found-in --apply`, `links:rebuild`, `embeddings:generate`.

## Phase 6 — Authored `table` entries (ENH-04) — DONE (local DB; prod import waits on Phase 0)

Evidence per acceptance criterion:
1. **Every table covers its full dice span with no gap or overlap:** `npm run verify:natural-world` (static, `validateTable`) and `natural-world-tables.spec.ts` (every roll in each span lands on exactly one row, for the file and for the database copy). 24 tables: 6 forage (by biome), 4 mining strikes (stone, metal vein 1d10, gems, strange finds), 6 wildlife encounters (by biome), 3 harvest quality (2d6 plants, 1d6 hides, 2d6 smelting), 5 "what's in this" (gallery, market stall, common room, smithy, shrine). Dice used: 1d4..1d10, 1d6, 2d6 with ranges.
2. **Backlinks:** each table names places and specimens in its intro; `scripts/link-tables-to-places.ts` appends a "Tables" line to the 38 places a table names (idempotent; 7 more after the intros were enriched), so a table's linked mentions list the places citing it. Test: every table has >= 3 outgoing links and >= 1 citing place. Roller results stay plain text (the roller does not render links), so links live in the intro, which renders them.
3. **Secret tables never reach a player:** a secret table fixture gives a player 404, absent from the list and from search; a player without the `table` grant gets 404; granted players see no DM `Use:` note.
4. **Re-import creates 0 duplicates:** re-import prints "0 created"; the link script reports "0 places would be updated"; entry count unchanged; no duplicate slug among live entries.
5. `tsc` 0; `next build` ok; audit 0; design gates 0 violations; embeddings current.
Found and fixed by the tests: one table (mountain forage) had no citing place and five generic ones linked only two things; I added place links to those intros instead of lowering the test's floor, and refreshed my own unedited rows from the data file.
Note: a zero-row-changed check (md5 of all non-place entries before/after) showed 0 existing descriptions changed by the import.
Prod rollout (after Phase 0): import `tables.json`, `link-tables-to-places --apply`, `links:rebuild`, `embeddings:generate`.

## Phase 7 — Database view per kind (ENH-05) — DONE

Evidence per acceptance criterion:
1. **Numeric-aware order:** `/codex/ores?view=table&sort=costPerLb&dir=asc` orders 5 sp, 5 gp, 9 gp, 50 gp, 5,000 gp, blank last (`database-view.spec.ts`); descending reverses and keeps blanks last; the first row of a descending cost sort is the dearest ore in the whole section (cross-checked against the database). `numericValue` reads "5,000 gp", "CR 1/4", coin units (cp/sp/ep/gp/pp), ranges; rarity sorts by rank (Common < Uncommon < Rare < Legendary).
2. **Unknown key ignored, no 500:** `sort=__proto__`, SQL-looking keys, NUL bytes, bad `dir`, bad `cols`, `page=abc` all return 200 with the default order. The sort key never reaches SQL: access is decided by the same query as the card list and the ordering is applied in code (`listEntriesSorted`), so R13 holds by construction.
3. **Players never get secret rows or DM data:** a secret fixture is absent from the player's page and from every response body; its DM note never appears; a player without the kind grant gets no data.
4. **375px:** no horizontal page scroll (documentElement overflow <= 0); the table scrolls inside its own container.
Also: view, sort and columns live in the URL and survive reload; column picker (checkbox menu, URL `cols`); long text fields are hidden by default and can be shown; the pager keeps the view state; header click flips direction; axe clean in both themes for the sorted table.
Replaced behaviour: the Phase 2 client-side, page-local, string sort. `graph-and-table-view.spec.ts` still passes unchanged.
Full suite after Phases 6 and 7: **268 passed**, 0 failed. (An earlier full run during Phase 6, while I was editing app code, had 249/250 with one `search-safety` failure that did not reproduce in 22 realistic repeats and 40 probes of gibberish queries; no leak found, and the clean run above passes it.)

## Phase 8a — Entry page card layout, templates, local graph, recently viewed (ENH-07a) — DONE

Evidence per acceptance criterion (`entry-pages.spec.ts`, 20 tests):
1. **NPC hero card:** an NPC page opens with a hero card: a portrait slot (initials when no portrait is set; an image for a site path or https address) beside an infobox built from the entry's own fields (race, gender, role, location, attitude). Key facts appear once (not repeated in the properties card). Deities get the same card (pantheon, rank, alignment, domains, symbol). `portrait` is a new NPC/deity field; unsafe values (`javascript:`, `data:`, `//host`, `http:`, spaces/quotes) are never rendered (`safePortraitUrl`, tested pure and in the page).
2. **Templates:** "New NPC" prefills `## Appearance`, `## Motivation`, `## Mannerisms` in the description and `## Secrets`, `## Hooks` in the DM notes. Interpretation: the plan lists Secrets with the other headings; secrets are placed in DM notes (never sent to players) so a template can never publish one by accident. A test asserts no template body contains "secret". Locations, organizations and deities have templates too; a note stays blank.
3. **Local graph shows only what the viewer may read:** built from the access-checked lists (parent, children, references, linked mentions). A hub linking to one open and one secret spoke shows the DM both nodes and a player one node; the secret slug and name appear nowhere in the player's page.
4. **Recently viewed:** the palette's empty box lists the last 8 pages viewed, newest first; the 9th drops off. Stored per user id in the browser (slugs only) and re-checked on the server by `/api/recent`, which returns only what the caller can read now: a page that later turns secret vanishes from the list and its name is never sent; one person's trail is never shown to another on a shared browser; garbage in storage is ignored; `/api/recent` is 401 when signed out and ignores junk slugs.
Regression found by the full suite and fixed (not by editing the old tests): the diagram's node links gave entry pages a second link with the same accessible name as the linked-mention card (`entries-crud` and `import-export` backlink tests hit strict-mode violations). The diagram is now hidden from assistive technology (`aria-hidden`, `tabindex=-1`, with a screen-reader sentence pointing at the lists, which already carry every link), which also removes a double announcement. Both specs pass unmodified.
Not built: "pinned" entries (named in the plan heading, absent from the acceptance list).
Checks: `tsc` 0; axe clean on the NPC page and entry page (both themes); full suite before the fix 288/290 (the two regressions above, now passing); a full run covering 8a and 8b follows 8b.

## Phase 8b — Interactive map with pins (ENH-07b) — DONE (local DB; prod rollout waits on Phase 0)

Built: tables `maps` and `map_pins` (`src/db/schema.ts`; idempotent `scripts/sql/maps.sql`; rollback `scripts/sql/maps-rollback.sql`; `npm run db:maps`, `db:maps:rollback`, `maps:seed`; `scripts/apply-sql.ts` runs either against local Postgres or Neon). The first map is `WIP Map.png` (decision Q12) copied to `public/maps/wip-map.png` and registered at 2250 x 1200, size read from the PNG header so it cannot disagree with the file. Pages `/map` and `/map/[slug]`; API `GET/POST /api/maps/[slug]/pins`, `DELETE /api/maps/[slug]/pins/[pinId]`; sidebar link.
Evidence per acceptance criterion (`map.spec.ts`, 33 tests):
1. **DM places a pin within 1%:** Place a pin, click the map, search an entry, Save. A click at 30% / 60% saves at the click's position to within 0.01 of the image, also after zooming in 4 steps and panning (coordinates are fractions of the image, so they survive zoom, pan and size). Save is disabled until an entry is chosen; Cancel saves nothing. The database enforces 0..1 (CHECK constraints) and the API rejects coordinates outside it, non-numbers, a bad id, an unknown map or entry and an archived entry; the edges 0 and 1 are valid.
2. **R6, no hidden pins leak:** pins are selected by the same access SQL as every other read (secret, ungranted and archived entries are never selected). A player's page, every response body for the page and the pins API contain none of the hidden entries' names, slugs, ids or coordinates (asserted with distinctive values, network responses captured). The DM sees secret and ungranted pins; granting a kind reveals exactly that kind's pin. Players can read pins, not create (403) or delete (403); signed-out is 401 on all three methods.
3. **Pin opens a preview:** clicking a pin shows a card (name, summary) with "Open page" (navigates) and, for the DM, "Remove pin"; Escape and the close button dismiss it. On a phone the card sits below the map instead of being clipped by it.
4. **Pan and zoom by touch and keyboard:** `+`/`=` and `-`/`_` zoom (clamped 100% to 800%), `0` resets, arrows pan and cannot leave the picture; zoom buttons, mouse wheel and drag work; a drag opens nothing; pins keep their size at any zoom. Touch is tested with synthetic two-pointer events and with real browser touch input (CDP `Input.dispatchTouchEvent`: a two-finger spread zooms, a one-finger drag pans). Found by the pinch test and fixed: `setPointerCapture` throws for a pointer the browser does not consider active, which would abort the gesture; it is now guarded.
5. **Deleting an entry removes its pins:** hard delete cascades (asserted); archiving hides the pin from every viewer (asserted); deleting a map removes its pins and leaves the entries.
Migration safety: `maps-rollback.sql` is run inside a rolled-back transaction in a test: both tables disappear, the entries count is unchanged, then everything is restored. `maps.sql` is run twice (idempotent). The map image is behind the sign-in gate (signed-out requests are redirected; signed-in get image/png).
Also: a keyboard user can Tab to a pin and press Enter; every pin is also a plain link in a list under the map; axe clean for DM and player in both themes; 375px has no horizontal scroll; design gates 0 violations (pins use the shadcn Button).
A test flake found and fixed in the tests (not the app): a pin click that lands before the page has hydrated is lost; the tests retry until the preview opens.
Checks: `tsc` 0; `next build` ok (new routes listed); `npm audit --omit=dev` 0; full suite after 8a and 8b: **327 passed**, 0 failed.
Decision to flag: `WIP Map.png` at the project root was an untracked file of yours; the copy under `public/maps/` is what the app serves and is committed (2.3 MB). The original is left untouched and uncommitted. The map is labelled work-in-progress; because pins are fractions of the image, a replacement of the same proportions keeps them in place, and `maps.version` exists to flag a replaced image.
Prod rollout (after Phase 0): `npm run db:maps`, copy `public/maps/`, `npm run maps:seed`.
