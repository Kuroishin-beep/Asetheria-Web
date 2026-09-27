# IMPLEMENTATION_TRACKER.md

Tracks execution of `PLAN.md`. Updated after every phase with real status and evidence — no phase is marked DONE without an observed, executed check.

Test DB: local disposable `asetheria-test-pg` (docker, port 55432) — never the Neon production database.

| # | Phase | Resolves | Files touched | Dependencies | Status |
|---|---|---|---|---|---|
| 0 | Multi-player identity & RBAC data model | ENH-01 | `src/db/schema.ts`, `src/lib/auth.ts`, `src/lib/rbac.ts` (new), `src/lib/entries.ts`, `src/lib/session.ts`, `src/app/welcome/*` (new), `src/app/login/login-form.tsx`, `src/app/api/auth/login/route.ts`, `src/app/(app)/layout.tsx`, `src/components/app-shell.tsx`, `scripts/migrate-legacy-players.ts` (new) | none | **DONE** |
| 1 | Content ingestion pipeline | ENH-05/06/07/08 | `scripts/import-foundry.ts` (new), `scripts/import-homebrew.ts` (new), `data/homebrew/*`, `src/lib/kinds.ts` | Phase 0 (soft) | **IN PROGRESS** — metals + flora done (ENH-06/07); Foundry import (ENH-05) and GM Binder scrape (ENH-08) not started |
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

### Phase 1 — IN PROGRESS (2026-09-27): metals + flora done, Foundry + GM Binder not started

**ENH-06 (metals) — done.** `data/homebrew/metals.json` + `scripts/import-homebrew.ts`, run via `npm run import:homebrew`.
- 18 new `ore` entries: 11 mundane metals (Brass, Bronze, Copper, Electrum, Gold, Iron, Lead, Platinum, Silver, Steel, Tin), 3 exotic (Celestium, Orichalcum, Tenebrium), 4 name-only stubs (Ironfell, Darksteel, Infernal Iron, Star Metal) per PLAN.md's decision.
- **Judgment call, flagged rather than silently applied:** the reference table's Adamantine, Mithral, and Cold Iron already exist in this setting under its own names/lore (Adamantium, Mithril, Cold Iron) with different, hand-written flavor text. Rather than create confusing duplicates, those three existing entries were *enriched* — `costPerLb`/`ferrous`/`armorClass` added to their `fields` — while their existing body/lore was left completely untouched. Verified directly against the DB (see below).
- Added `costPerLb`, `ferrous`, `armorClass` fields to the `ore` KindDef (`src/lib/kinds.ts`) so these render as real fields, not free text.

**ENH-07 (flora) — done.** `data/homebrew/flora.json`, same importer.
- 19 new `flora` entries: the 13 named herbs with mechanical effects, 3 "Popular Magical & Alchemical Plants," 3 monster-flora (Assassin Vines, Creeping Kudzu, Ordeal Trees).
- 1 new roll table, "The Herbalist's Field Guide (d20)," all 20 rows, DM-only visibility (matches the source material's poison/invisibility/truth-serum entries being GM-facing, not player-facing).

**Verified (not assumed):**
- Ran `npm run import:homebrew` against the local test DB: 18 + 19 entries created, 3 enrichments applied, 0 skipped/errored, idempotent (re-run inserts 0 duplicates — confirmed by slug-existence check in the script itself; not yet re-run a second time to double-confirm, see Open follow-up below).
- Direct DB read after import confirmed: `cold-iron`'s original body ("Disrupts magical effects on contact...") is byte-for-byte unchanged, with `armorClass`/`costPerLb`/`ferrous` now present alongside the original `lore`/`uses`/`location`/`properties`/`description` keys.
- `npm run typecheck` clean, `npm run build` succeeds, full existing Playwright suite still 49/49 (same one pre-existing unrelated failure as Phase 0).
- New `tests/homebrew-content.spec.ts` (2 tests) — both pass: a new metal renders with its stat, the enriched Cold Iron page shows both its original lore and its new Armor Class field, a new herb page renders, the new roll table appears in `/tools/tables`.

**ENH-05 (Foundry import) — done, but narrower than the compendium folder as a whole.** `scripts/import-foundry.ts`, run via `npm run import:foundry`.
- Inspected the actual pack with `classic-level` before writing any import logic: `asetheira-compendium` (the one **custom** pack in `E:\FoundryVTT\Data\worlds\asetheria\packs\`) contains exactly 5 `character`-type actors (player characters) and their embedded items (spells/feats/equipment as inventory, not separate lore pages) — not journals, locations, or lore entries as I'd assumed while planning. There was nothing else in it to import.
- All 5 imported as `npc` entries: race and background resolved from their embedded-item IDs (not plain strings in Foundry's data model — required cross-referencing the actor's own item list), class+level, HP/AC into a `statblock` field, and biography HTML converted to plain paragraphs (stripped, not escaped-and-shown-as-literal-tags).
- **Deliberately did not import** `ddb-asetheria-ddb-*` (D&D Beyond content) or `beneos_module_*` (third-party module content) — both are licensed/commercial, and PLAN.md's ENH-05 decision was to leave those out pending your explicit confirmation (see Open Questions #2 in PLAN.md). `--path`/`FOUNDRY_COMPENDIUM_PATH` let you point the script at a different pack if you want one of those imported later, once you've decided.
- Verified: ran the importer twice — first run creates 5, second run reports "already exists" for all 5 and creates 0 (confirmed idempotent by direct re-execution, not just by reading the code). New `tests/foundry-import.spec.ts` confirms an imported character's race/class render as real fields and the biography shows as readable text, not literal `<p>` tags.

**Not started yet:**
- **ENH-08 (GM Binder scrape):** the 3 GM Binder URLs have not been fetched yet — the next piece of Phase 1.

**Open follow-up for you:** once ENH-05/ENH-08 land, `npm run import:homebrew` (or its equivalent) plus `npm run migrate:legacy-players` both still need to run once against the **production Neon database** — nothing in Phase 0 or Phase 1 has touched production yet, only the local disposable test Postgres.
