# HANDOFF — state at 2026-10-10

All of `PLAN.md` v2.1 (Phases 0 to 11) and the Step 2 to 4 test deliverables are done,
verified, committed, and merged to `main`.

## Evidence
- Final full suite: 509 passed, 0 failed, 0 flaky, 0 skipped (18.6 min, one worker, retries 0).
- `tsc` clean, `npm run build` OK, `npm audit --omit=dev` 0 vulnerabilities, design gates 0 violations.
- `test-cases.html` (offline) holds every case with its real result; `TEST-REPORT.md` has totals, bugs, test corrections and risks; `IMPLEMENTATION_TRACKER.md` has per-phase evidence.
- Neon production: schema current, including `characters` (added 2026-10-10, additive, 0 rows); entries 1,060.

## Left for the owner
1. Create the DM account on production.
2. Vercel environment: `DATABASE_URL`, `AUTH_SECRET`, `PLAYER_PASSWORD`, optional `SIGNUP_CODE`, `EMBEDDINGS_CACHE_DIR`.
3. Deploy, then check `/api/health`.
4. Rotate the Neon password (it was pasted in chat). Update `.env.neon` and Vercel afterwards.

## Proposals, not built
- LegendKeeper or World Anvil style features (timelines, per-player handouts, interactive family trees). Ask to plan them.
- Load balancing: the app is stateless, so Vercel scales it horizontally; nothing to build unless you move off Vercel.

## Working notes for the next session
- Run the full suite on an idle machine: concurrent CPU work skews the frame-time tests. This machine is memory-tight, and runs have been stopped for low memory.
- Regenerate the test-case document after a run: `npx tsx scripts/build-test-cases.ts --results test-results/results.json` (`--strict` fails on an empty coverage slot).
- New tests get ids automatically. A loop-generated test is named at run time with `tc()` from `tests/case-id.ts`.
- Never commit the owner's files: `Aetheria.jpg`, `The Port City of Helarchon.jpg`, `WIP Map.png`, `docs/maps/`. `.env.neon` and `backups/` stay git-ignored.
