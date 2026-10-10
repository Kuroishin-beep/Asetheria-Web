# HANDOFF — state at 2026-10-09 ~05:50

Repo: `E:\Github\Asetheria\Asetheria-Web`, branch `hardening-and-content`. origin/main = `833c007` (Phase 4). Later commits are local only.
Plan: `PLAN.md` v2.1. Tracker: `IMPLEMENTATION_TRACKER.md`. Older notes: `SESSION_HANDOFF_UPDATE.md`.

## Owner decisions (authoritative)
- Keep the GM Binder-derived homebrew (it is in prod). The owner deploys to Vercel.
- "Finish all phases then push and merge to main" = approved, only after everything is finished and verified.
- Never commit the owner's pre-existing files: `Aetheria.jpg`, `The Port City of Helarchon.jpg`, `WIP Map.png`, `docs/maps/`.
- Neon prod DB is built and verified. Credentials only in `.env.neon` (git-ignored, never print). Owner should rotate the Neon password. Tests never touch Neon.
- Not to build unless approved: LegendKeeper / World Anvil inspiration, load balancing (infra; app is stateless).

## Done and committed
Phases 1 to 8c, then:
- `3b921a6` Phase 8d planner. Full suite 378/378, tsc, build, audit (0 vulns), design gates all clean.
- `8613029` Phase 10 character engine + `characters` table + API. 53 tests pass (`character-engine`, `characters-api`). Local DB has the table (`npm run db:characters`).

## Phase 11 — integrated, NOT committed (uncommitted files)
- New: `src/components/character/*`, `src/lib/character/{draft,links,member-options,public-options}.ts`, `src/app/create-character/page.tsx`, `src/app/(app)/characters/**`, `src/components/app-toaster.tsx`, `scripts/check-wikidot-links.ts`, `tests/character-{draft,creator}.spec.ts`.
- Edits: `src/proxy.ts` (`/create-character` public), `src/components/app-shell.tsx` (Characters link), `src/lib/section-icons.ts` (UserRound), `src/app/layout.tsx` (`<AppToaster />`).
- Phase 11 specs: 44 pass. Wikidot link check: 40/40 live.
- Findings fixed this phase:
  - `<Toaster />` was never mounted anywhere, so every toast in the app (palette, map, planner) never showed. Now mounted via `AppToaster`.
  - Mounting it on `/graph` pushed graph pointer-sweep p90 from 16.8 to ~50 ms (test fails at >33.4). `AppToaster` therefore skips `/graph`. Limitation: a palette toast fired while on `/graph` will not show. p90 now 16.8 to 33.3 ms across repeat runs.
  - Wizard draft is now also written on `pagehide` (reload no longer loses the last change).
  - Test corrections (justified): point-buy floor test used 5 clicks (8 to 6 is 2); "Back" locator needed `exact: true` (matched "4. Background"); two tests plant state after the pagehide save / use a fresh browser profile.
- First full run for 10+11: 474 passed, 1 failed (graph perf, cause above). Rerun was started in background (`/tmp/full-suite-p11b.log`). It must be green before committing.

## Next steps, in order
1. Read `/tmp/full-suite-p11b.log` tail. If all green: `npx tsc --noEmit`, `npm run build` (stop port 3000 first), `npm audit --omit=dev`, `npx tsx scripts/check-design-system.ts`. Add a Phase 11 tracker section (include the Toaster finding and `/graph` limitation). Commit `feat(phase-11): character creator wizard, 5e sheet, Wikidot links, Characters tab` with trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. If the graph perf test fails again, investigate; do not loosen it.
2. Phase 9 landing page. Drafted in scratchpad `...\6559e50c-736b-45fa-9b70-0ee56f77cf2d\scratchpad\9\`: `src/components/landing/{use-scene.ts,scenes.tsx,landing.tsx}`, `src/app/welcome/page.tsx`, `tests/landing.spec.ts`. Needs: design-gate exemption for `src/components/landing/` (documented; Motion values need `style`), existing door intact (`EnterButtons`, "Enter as a player", "Party password", `#door-error`, first `/sign in/i` link to `/login?next=...`) so `entry-doors`, `auth`, `a11y` `/welcome` still pass, add landing art to `docs/content-licences.md` as original, record the 10 → 11 → 9 order deviation in PLAN.md/tracker, run tests, commit.
3. Prod rollout of new SQL: `characters.sql` on Neon via `DATABASE_URL` from `.env.neon` (additive only; the clone tool loads only an EMPTY target). Do not print creds.
4. Deliverables: `test-cases.html` (one self-contained file; TC-<MODULE>-<NNN>, all categories, dashboard, filters, traceability incl. Phases 9 to 11, print CSS), mirrored Playwright specs named by TC id (screenshot every test, video+trace on failure, retries 0, artifacts `./test-results/`), real results back into the HTML, `TEST-REPORT.md`, final tracker, chat summary. Say "All phases implemented and verified" only if true.
5. Finally: push `hardening-and-content` and merge to `main` (approved). Never commit the owner's pre-existing files.
6. Tell the owner: create the DM account, set Vercel env (`DATABASE_URL`, `AUTH_SECRET`, `PLAYER_PASSWORD`, optional `SIGNUP_CODE`, `EMBEDDINGS_CACHE_DIR`), deploy, check `/api/health`, rotate the Neon password.

## Working rules to keep
- No stubs/mocks/fake data. Never claim a test passed unless run and observed. Never weaken/skip/delete a failing test (a genuinely wrong test may change only with stated justification).
- Never edit `src/` (or add files there) while a full suite runs (hot reload causes spurious failures). Never run two Playwright runs at once.
- Machine is memory-constrained: a background suite was once killed for low memory. Do not restart a killed run unless asked; close other apps first.
- Python heredoc edits of multi-line strings failed on CRLF files; use `sed` or normalise `\r\n` first.
- `scripts/apply-sql.ts` splits on `;`; do not use it for `setup.sql` (has `$fn$` bodies).
- Output style: terse, `[TOKENS]` line after each completed task (CLAUDE.md).
