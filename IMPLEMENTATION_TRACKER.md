# IMPLEMENTATION_TRACKER.md

Tracks execution of `PLAN.md` v2. A row moves to TESTED/DONE only with evidence observed in-session.
Test DB: local disposable `asetheria-test-pg` (docker, port 55432). Never Neon.
Previous tracker: `docs/IMPLEMENTATION_TRACKER-archive-rbac-2026-09.md`.

Status key: NOT STARTED / IN PROGRESS / IMPLEMENTED / TESTED / DONE / BLOCKED

| # | Phase | Files touched (main) | Dependencies | Status |
|---|---|---|---|---|
| 0 | Prod catch-up (Neon) | none (ops only) | Neon `DATABASE_URL` from user | **BLOCKED: awaiting credential** (code phases proceed locally) |
| 1 | Enum migration: `fauna` + `table`; retag fauna; roll_tables → table entries | `src/db/schema.ts`, `src/lib/kinds.ts`, `src/lib/rbac.ts`, `src/lib/validation.ts`, `scripts/import-codex-file.ts`, `scripts/migrate-fauna-and-tables.ts`, `scripts/sql/*`, drizzle migration, tests | none | **DONE** |
| 2a | Design foundation: shadcn spike, tokens + refresh, next-themes, motion presets | `components.json`, `src/lib/utils.ts`, `src/lib/motion.ts`, `src/components/ui/*`, `src/app/globals.css`, `src/app/layout.tsx`, `docs/design-*.md` | 1 | NOT STARTED |
| 2b | Shell + auth pages | `app-shell`, `theme-toggle`, login/register/welcome/onboarding | 2a | NOT STARTED |
| 2c | Codex pages (+ loading/error/empty) | `entry-card`, `codex/**`, `loading.tsx`, `error.tsx` | 2b | NOT STARTED |
| 2d | Editor, palette, graph, shortcuts | `entry-form`, `markdown-editor`, `command-palette`, `graph-view`, `keyboard-shortcuts` | 2c | NOT STARTED |
| 2e | Tools + admin + sweep (grep gates, axe) | `tools/*`, `admin/*`, `rbac-panel` | 2d | NOT STARTED |
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
