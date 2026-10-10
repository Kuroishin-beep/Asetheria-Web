# TEST-REPORT.md

Covers `PLAN.md` v2.1, Phases 0 to 11, and the Step 2 to 4 test deliverables.
Every automated run is against the local, disposable Postgres container
(`asetheria-test-pg`) and `next dev` on localhost:3000. The suite never reads
`.env.neon` and never touches the Neon production database.

## Final run

| | |
|---|---|
| Date | 2026-10-10, started 04:39 UTC |
| Command | `npx playwright test` (one worker, `retries: 0`) |
| Result | **509 passed, 0 failed, 0 flaky, 0 skipped** |
| Duration | 18.6 minutes |
| Artifacts | `./test-results/`: a screenshot for every test; video and trace kept for any failure (none); `results.json` |
| Machine | Windows 10, run with nothing else working (concurrent work skews the frame-time checks; see risks) |

Also green at the time of the final commit: `tsc --noEmit` clean, `npm run build`
OK, `npm audit --omit=dev` 0 vulnerabilities, design gates 12 rules 0 violations.

Measured numbers recorded by the suite:
- World graph, 1,044 nodes, pointer sweep under a 4x CPU throttle: p90 frame 16.7 ms, 56 to 59 fps (limit p90 33.4 ms).
- Landing page, full scroll under a 4x CPU throttle: p90 frame 16.8 ms (limit 33.4 ms); layout shift under 0.05.
- Landing page JavaScript over `/login`, production build: 12.9 KB gzipped (limit 60 KB).

## The test-case document

`test-cases.html` is one self-contained file that opens offline. It has 509 cases,
one per automated test, and each test's title starts with its id (`[TC-<MODULE>-<NNN>]`).
Steps, test data and expected results are read from the real test bodies by
`scripts/build-test-cases.ts`. Actual and Status come from this run's `results.json`.
The page has a summary dashboard, filters and search, a coverage-floor matrix, a
traceability table from every PLAN.md acceptance criterion to its cases, and a print
stylesheet. Status and Notes can be changed in the page and are remembered in that browser.

| Category | Cases | | Priority | Cases |
|---|---|---|---|---|
| Happy | 229 | | P0 | 162 |
| Accessibility | 63 | | P1 | 91 |
| Validation | 53 | | P2 | 256 |
| Permission & Auth | 43 | | | |
| Security | 35 | | | |
| Boundary | 26 | | | |
| Data Integrity | 24 | | | |
| Responsive | 16 | | | |
| Error & Recovery | 9 | | | |
| Concurrency | 6 | | | |
| Edge | 5 | | | |

Coverage floor: 30 user actions, each with a happy, an invalid-input, an unauthorized
and a boundary case. Eleven slots that nothing covered got new tests in
`tests/coverage-gaps.spec.ts` (TC-COV-001 to 012; 010 was retired when its test was rewritten). Where a slot cannot exist (for
example invalid input to "sign out", which takes none), the matrix says why.
`npx tsx scripts/build-test-cases.ts --strict` fails if any slot is empty without a reason.

Categories come from a keyword classifier over each title, with hand corrections in
`test-cases/overrides.json`. They are a sound guide, not a hand-audited taxonomy.

To regenerate after a run: `npx playwright test` then
`npx tsx scripts/build-test-cases.ts --results test-results/results.json`.

## Bugs found and fixed (Phases 8d to 11)

Earlier phases' bugs are recorded per phase in `IMPLEMENTATION_TRACKER.md`.

| # | Symptom | Root cause | Fix |
|---|---|---|---|
| 1 | No toast ever appeared anywhere (palette, map, planner, creator) | `<Toaster />` was never mounted | Mounted once in the root layout via `AppToaster` |
| 2 | Mounting the toaster made the graph pointer-sweep p90 jump from 16.8 to 50 ms | The fixed toast layer added compositing work over the busy graph SVG | `AppToaster` skips `/graph` (see risks) |
| 3 | Graph frame-time test intermittently at 50 ms | Every hover re-rendered the whole graph component, including filter lists with hundreds of options | Hover lives in a small external store read only by the overlay; 56 to 59 fps |
| 4 | Landing scroll p90 50 ms; scenes "animated" off screen and under reduced motion | A looping transition (`repeat: Infinity`) kept tweening toward the resting value | `still()` gives a zero-length transition when a scene is off screen or motion is reduced; fewer animated elements; p90 16.7 ms |
| 5 | Landing had no `contentinfo` landmark | Footer was inside `<main>` | Footer moved outside `<main>` |
| 6 | Sign out failed with a 401 when the session had already expired | `/api/auth/logout` was behind the auth gate | Added to the public paths (it only clears the cookie) |
| 7 | The wizard lost its last change on a quick reload | The draft is saved 250 ms after a change | Also saved on `pagehide` |

## Tests corrected (each one justified, none weakened)

- Frame-time checks: a p90 of exactly two display frames measured 33.400000000000546 against a 33.4 limit. Compared at the measured precision; the limit is unchanged.
- Point-buy floor: the test clicked five times where 8 to 6 is two steps.
- "Back" locator also matched the "4. Background" step button; made exact.
- "New for you": read the links before the streamed section arrived; now waits for them.
- A long accessibility test (three full axe audits) got 90 s instead of 30 s; same assertions.
- Public-page leak checks sampled entry names at random and sometimes picked one of the three empire names the pages show on purpose (constants). Those three are excluded from the sample.
- The 300/301-character name test assumed the browser would send 301 characters; the field caps at 300. It now checks the cap and that the server refuses 301 when the cap is bypassed.

## Remaining risks

1. **Frame-time tests depend on the machine.** They pass on an idle machine. When I ran CPU-heavy work at the same time they failed (p90 50 ms). Run the suite on an idle machine or in CI with a fixed profile.
2. **Memory on this machine.** Two full runs were stopped by Claude Code for low memory. Recording video for every test (needed for video on failure) and a screenshot per test add load.
3. **A toast fired while on `/graph` is not shown** (bug 2). Nothing on the graph page itself uses toasts. A command-palette error raised from that page would be silent.
4. **Production steps that are yours:** create the DM account; set the Vercel environment (`DATABASE_URL`, `AUTH_SECRET`, `PLAYER_PASSWORD`, optional `SIGNUP_CODE`, `EMBEDDINGS_CACHE_DIR`); deploy; check `/api/health`; **rotate the Neon password** (it was pasted in chat).
5. **Phase 0 is verified by scripts and SQL, not Playwright,** by design. Evidence is in the tracker. The `characters` table was added to Neon on 2026-10-10 (additive; 0 rows; 1,060 entries unchanged).
6. **Case ids are keyed by file, describe path and title.** Renaming a test gives it a new id on the next build. `test-cases/ids.json` is the record.
7. **Generated steps are mechanical.** They are faithful to the code ("Click button "Save changes"") but not polished prose.
8. **Not built (proposals only):** LegendKeeper or World Anvil style features, and load balancing. The app is stateless, so it can scale horizontally on Vercel as it is.
