# IMPLEMENTATION_TRACKER.md

Tracks execution of `PLAN.md`. Updated after every phase with real status and evidence — no phase is marked DONE without an observed, executed check.

Test DB: local disposable `asetheria-test-pg` (docker, port 55432) — never the Neon production database.

| # | Phase | Resolves | Files touched | Dependencies | Status |
|---|---|---|---|---|---|
| 0 | Multi-player identity & RBAC data model | ENH-01 | `src/db/schema.ts`, `src/lib/auth.ts`, `src/lib/rbac.ts` (new), `src/lib/entries.ts`, `src/lib/session.ts`, `src/app/welcome/*` (new), `src/app/login/login-form.tsx`, `src/app/api/auth/login/route.ts`, `src/app/(app)/layout.tsx`, `src/components/app-shell.tsx`, `scripts/migrate-legacy-players.ts` (new) | none | **DONE** |
| 1 | Content ingestion pipeline | ENH-05/06/07/08 | `scripts/import-foundry.ts` (new), `scripts/import-homebrew.ts` (new), `data/homebrew/*`, `src/lib/kinds.ts` | Phase 0 (soft) | **DONE** |
| 2 | GM RBAC control panel UI | ENH-02 | `src/app/(app)/admin/rbac/page.tsx` (new), `src/components/rbac-panel.tsx` (new), `src/app/api/rbac/route.ts` (new), `src/components/app-shell.tsx` | Phase 0 | **DONE** |
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

**ENH-08 (GM Binder scrape) — done.** Fetched all 3 URLs with WebFetch and read the actual content before deciding anything:
- **"Fantasy Metals Compendium"** (`-M-mdGRNm2-f66yo-DYw`): 24 original planar materials (one per plane, from the Elemental Planes through the Nine Hells and the Abyss). Original homebrew, not reproducing any official book — added in full as new `ore` entries in `data/homebrew/planar-metals.json`. One material from this page, "Adamantine (Arborea)," was deliberately skipped for the same reason as the earlier Cold Iron/Mithril overlap: it would have been a third entry for a concept the setting already has under its own name (Adamantium).
- **"The Horticulturist's Guide to Plants"** (`-NTnLz4LxJVNjsj5BhvN`): its d20 table turned out to be *the exact same table* already supplied directly in your prompt and already imported in the first Phase 1 commit — no new content there. Its DC/procedure rules (finding plants, identifying them, where to learn about a specific one) were original and are not a duplicate, so those were kept as one new `rule` entry, "Foraging & Herbalism Checks," in `data/homebrew/flora.json`.
- **"5e Official Plants Lists"** (`-MUtz6xTilx7n21GGzM3`): **deliberately excluded.** This page verbatim-reproduces official Wizards of the Coast sourcebook content (28 plants cited to specific pages of *Tomb of Annihilation*, *Eberron: Rising from the Last War*, *Out of the Abyss*, and *Explorer's Guide to Wildemount*) — the same commercial-content concern already applied to the `ddb-asetheria-*` Foundry packs in ENH-05. Not imported without your explicit call on republishing licensed book content.

**Verified:** ran `npm run import:homebrew` again after adding the planar metals and the rule (24 + 1 created, 0 duplicates, the 18 metals and 19 flora from before correctly reported as already existing rather than re-created). New assertions in `tests/homebrew-content.spec.ts` confirm a planar metal renders, the new rule entry exists, and — the important negative check — no entry exists for the excluded official-content page (`dancing-monkey-fruit` 404s). Full suite re-run clean at 53/53 (same one pre-existing unrelated failure). Build clean.

**Phase 1 total new content:** 18 + 24 = 42 new `ore` entries (3 enriched, not duplicated), 20 new `flora`/`rule` entries, 5 new `npc` entries from Foundry, 1 new roll table — **68 new/enriched entries**, taking the codex from 520 to 587.

**Open follow-up for you:** all of Phase 0 and Phase 1 has only run against the local disposable test Postgres. Before this ships, run once against the **production Neon database**: `npm run db:setup` (picks up the `entry_grants` migration), `npm run migrate:legacy-players`, then `npm run import:homebrew` and `npm run import:foundry` (the latter needs Foundry closed, since it holds the pack's LevelDB lock while running).

### Phase 2 — DONE (2026-09-27)

New `Players & Access` page at `/admin/rbac` (nav link added to the sidebar's "Keeper" section, DM-only — see Open Questions #4 below on the literal "tab at the bottom" wording), backed by a new `POST /api/rbac` route and `src/components/rbac-panel.tsx`.

**What it does:**
- Player dropdown (switches which player's grants you're editing — URL-addressable via `?player=<id>`, so it's linkable/bookmarkable).
- One row per entry kind (Deities, Locations, Empires, …) with a single toggle: "Hidden from player" / "Visible to player ✓" — this is the coarse-grained control from the original ask ("a toggle for what towns they can see").
- Each kind with entries can expand into a checklist of every entry in that kind, with **select all**, **Approve selected**, **Reject selected**, and **Clear override** (removes the per-entry row, falling back to the kind-level toggle) — covers "select all filters, bulk add bulk remove approve and reject" from the original ask directly.
- A per-entry approve/reject always overrides the kind-level toggle for that one entry (same precedence rule as Phase 0's `grantCondition`), shown as a "granted"/"denied" chip next to the entry.
- Server-side: `requireDM()` on every mutation, not just a hidden UI — verified by a test that a player's direct `POST /api/rbac` call 403s even though it isn't linked from their nav.

**Acceptance criteria verified (PLAN.md Phase 2, all via `tests/rbac-panel.spec.ts`, real browser + real DB, not mocked):**
1. Toggling "Locations" off/on for a player changes what that player can load immediately (checked via a second, already-logged-in browser context reloading the entry mid-test — no re-login, no cache clear).
2. Explicitly rejecting one specific location for a player hides only that one, while its sibling (same kind, same kind-level "on" toggle) stays visible — proves the override precedence, not just that *something* got hidden.
3. A non-GM redirects away from `/admin/rbac` and gets 403 from the API directly.

**Not built (scoped down from the original ask, flagged rather than silently dropped):**
- A literal fixed tab bar pinned to the bottom of the viewport — used the existing sidebar's DM-only "Keeper" section instead (where Archive and Backup & Import already live). Functionally in the same place a DM already looks for admin tools; a true bottom tab bar would be a broader nav redesign affecting every page, out of proportion to this feature. Flagged in case the literal placement matters to you.
- Bulk actions currently operate within one kind at a time (e.g., "select all locations"), not across kinds at once — matches how the original ask described it ("a toggle for what towns they can see... select all") but doesn't support a single "grant everything" button across the whole codex. Easy to add if wanted.
- No UI yet for creating a new player account from this panel — still `npm run user:add` from the command line. Not requested explicitly, noted as a likely next ask.
