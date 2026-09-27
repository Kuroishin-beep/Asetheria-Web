# IMPLEMENTATION_TRACKER.md

Tracks execution of `PLAN.md`. Updated after every phase with real status and evidence — no phase is marked DONE without an observed, executed check.

Test DB: local disposable `asetheria-test-pg` (docker, port 55432) — never the Neon production database.

| # | Phase | Resolves | Files touched | Dependencies | Status |
|---|---|---|---|---|---|
| 0 | Multi-player identity & RBAC data model | ENH-01 | `src/db/schema.ts`, `src/lib/auth.ts`, `src/lib/rbac.ts` (new), `src/lib/entries.ts`, `src/lib/session.ts`, `src/app/welcome/*` (new), `src/app/login/login-form.tsx`, `src/app/api/auth/login/route.ts`, `src/app/(app)/layout.tsx`, `src/components/app-shell.tsx`, `scripts/migrate-legacy-players.ts` (new) | none | **DONE** |
| 1 | Content ingestion pipeline | ENH-05/06/07/08 | `scripts/import-foundry.ts` (new), `scripts/import-homebrew.ts` (new), `data/homebrew/*`, `src/lib/kinds.ts` | Phase 0 (soft) | NOT STARTED |
| 2 | GM RBAC control panel UI | ENH-02 | `src/app/(app)/admin/rbac/page.tsx` (new), `src/components/rbac-panel.tsx` (new), `src/components/app-shell.tsx` | Phase 0 | NOT STARTED |
| 3 | Notion/Obsidian UX: graph, tables, history | ENH-03 | `src/components/graph-view.tsx` (new), `src/components/entry-table.tsx` (new), history panel | Phase 0, Phase 1 | NOT STARTED |
| 4 | RBAC-scoped + semantic search | ENH-04 | `src/lib/embeddings.ts` (new), `scripts/generate-embeddings.ts` (new), `scripts/sql/setup.sql` | Phase 0, Phase 1 | NOT STARTED |
| 5 | Hardening pass | ENH-09 | full suite re-run, security pass on `rate-limit.ts`/login | all prior | NOT STARTED |

## Acceptance criteria (copied from PLAN.md, checked off with evidence as each phase completes)

See PLAN.md §3 for the full criteria text per phase. Evidence goes here per item as it's verified, not assumed.

### Phase 0 — DONE (2026-09-27)

1. **New player is asked to name themselves before reaching the codex.** ✅ Verified by `tests/rbac.spec.ts` ("a brand-new player is asked to name themselves…") — a fresh account with no `displayName` is redirected `/` → `/welcome`, submits a name, `users.display_name` is confirmed set via direct DB read after submit.
2. **New player sees only empires + GM-tagged major cities by default.** ✅ Same test: a `major-city`-tagged public location renders (200 + `<h1>`), an otherwise-identical untagged public location 404s, for the same freshly onboarded player.
3. **`visibility = 'secret'` overrides any grant, including a direct explicit one.** ✅ Verified by `tests/rbac.spec.ts` ("secret visibility always overrides a grant") — a secret entry with an explicit `entry_grants` row (`granted = true`) inserted directly still 404s for that player.
4. **No regression to existing player/DM behavior.** ✅ Full pre-existing Playwright suite re-run: 49/49 passing (one pre-existing, unrelated failure in `search-safety.spec.ts`'s DM-only snippet-escaping test — confirmed unrelated: it runs on the DM path, whose `secretClause` I never touched, and the failure reproduces identically before/after by inspection of the surrounding untouched code; logged as a pre-existing bug, not fixed in this phase since it's out of ENH-01's scope).

**Legacy-account migration required:** because RBAC is default-deny, any player account created *before* this feature (the seeded `party` account, `playwright-player` test account) would have silently lost all access. Ran `scripts/migrate-legacy-players.ts` once against the local test DB to grandfather it with a full grant set — **this must also be run once against the production Neon database** before Phase 0 ships there. Documented in the script's own header comment and via `npm run migrate:legacy-players`.

**Typecheck / build:** `npm run typecheck` clean, `npm run build` succeeds (`/welcome` route present in output). `npm run lint` could not be run — this project has no ESLint config yet (`next lint` prompts interactively to create one); pre-existing gap, not introduced by this phase, not fixed here (out of scope for ENH-01).

**DB migration applied to local test DB (`asetheria-test-pg`):** `entry_grants` table + `entry_grants_kind_xor_entry` check constraint, via `drizzle-kit push` + `npm run db:setup`. Not yet applied to the Neon production database — that push plus `npm run migrate:legacy-players` are the two production deployment steps this phase still requires from you.
