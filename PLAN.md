# PLAN.md — Asetheria Codex: RBAC, Notion/Obsidian UX, Content Expansion, RAG Search

Status: **DRAFT — awaiting approval. No code written.**
Audited by: Chief Orchestrator session, 2026-09-27.
Decisions below were made autonomously (user authorized "use what's recommended, run autonomously") where the original request left a choice open. Each such decision is marked **[DECISION]** and can be overridden before implementation starts.

---

## 1. Executive Summary

Asetheria-Web is a working Next.js 15 + Drizzle + Neon Postgres codex: a single polymorphic `entries` table (18 kinds incl. `ore`, `flora`), a working link graph (`links` table, wiki-style `[[Name]]` resolution), weighted full-text search with a separate player-safe tsvector, revision history, roll tables, and a two-account model (one shared `dm` login, one shared `player` login) with binary `public/secret/revealed` visibility.

What's requested is four things bundled together:

1. **Real multi-player accounts + per-toggle RBAC** — today there is exactly one player account for the whole party; the ask is named individual players, an onboarding "what should I call you" flow, and a GM-only control panel that grants visibility per player per content-kind/entry (e.g. "these three towns," "the Empires," bulk approve/reject) instead of the current binary secret flag.
2. **A Notion/Obsidian-flavored UI pass** — nested pages/blocks, table views, a visual backlink graph (the graph data already exists in `links`; there is no graph UI), version history surfaced to the user (the `revisions` table already exists but isn't shown).
3. **Content ingestion** — pull the custom Foundry VTT compendium (`E:\FoundryVTT\Data\worlds\asetheria\packs\asetheira-compendium`, plus the DDB and Beneos import packs in the same `packs/` folder) into the codex; add the supplied metals/materials table and flora/herbalism tables to the existing `ore` and `flora` kinds; scan three external GM Binder pages for further content.
4. **Search overhaul** — GM searches everything; player search is filtered by the new RBAC, not just the old public/secret binary; add a semantic (RAG) layer on top of the existing Postgres full-text search.

None of this requires a new app or a rewrite — it is additive to the existing schema and route structure. The riskiest piece is RBAC, because it changes the meaning of "visible to a player" everywhere a player can currently read data, and it must not regress the "secret never leaks" guarantee `redactForPlayer`/`visibilityFilter` currently provide.

---

## 2. Findings Analysis

### ENH-01 — Named multi-player accounts + onboarding
**Ask:** "the player should be asked for what they should be called, and they do not have permissions at the start."
**Root cause / current state:** `src/db/schema.ts` `users` table has `role: userRole("role")` with only two values (`dm`, `player`) and the seed script (`scripts/seed.ts`, `scripts/create-user.ts`) creates exactly one row per role from `DM_USERNAME`/`PLAYER_USERNAME` env vars. There is no per-player identity — every player logs into the same `party` account. "Ask what they should be called" cannot be satisfied by the current model at all; it requires distinct rows.
**Affected files:** `src/db/schema.ts` (users table + new `player_grants`/similar), `src/lib/auth.ts` (`getCurrentUser`, `redactForPlayer`, `visibilityFilter` all currently branch on the two-value role — need a per-user grant lookup), `src/lib/session.ts`, `src/lib/session-cookie.ts`, `src/app/login/*`, `scripts/create-user.ts`, `scripts/seed.ts`, `.env.example`/README (env-seeded single player account becomes obsolete or becomes "first player").
**Risk:** High — touches every auth check in the app.
**Effort:** Medium (schema + a first-login name-capture screen; no external auth provider needed since sessions are already first-party JWT/cookie based per `src/lib/session*.ts`).
**Depends on:** nothing upstream; everything else (RBAC, search scoping) depends on this.

### ENH-02 — GM-only RBAC control panel (bottom tab, toggles, bulk ops)
**Ask:** a GM tab with dropdowns/toggles for what each player can see (e.g. "these towns"), select-all/bulk-add/bulk-remove/approve/reject, and CRUD everywhere.
**Root cause:** Visibility today is a single enum column on `entries` (`public | secret | revealed`) shared by *all* players — there is no concept of "player A can see this, player B cannot." A per-(player, entry) or per-(player, kind) grant table doesn't exist.
**Affected files:** new table (see §3 Phase 1 schema), `src/lib/auth.ts` (`visibilityFilter` becomes per-user, not per-role), every read path that calls it — `src/lib/entries.ts` (369 lines, all list/get queries), `src/app/(app)/codex/**`, `src/app/(app)/search/page.tsx`, `src/components/command-palette.tsx` (client-side palette must not even receive hidden entries), new `src/app/(app)/admin/rbac/page.tsx` (or a bottom-bar tab per the ask), `src/lib/actions.ts` (bulk mutation actions).
**Risk:** High — this is the one place a bug leaks DM-only content to a player. Must have automated tests (extends existing `tests/entries-player-readonly.spec.ts`, `tests/search-safety.spec.ts`).
**Depends on:** ENH-01 (needs individual player rows to grant against).
**Contradiction to flag:** the finding says visibility "depends on the toggles on the RBAC on the GM screen" but also that players "at the start... do not have permissions" beyond "the 3 empires and the major cities" — this reads as a **default grant set**, not a toggle a GM must set per new player each time. **[DECISION]:** implement a `default_visible_kinds`/seed grant of `empire` (all) + a GM-flagged subset of `location` (major cities) applied automatically to every newly onboarded player, editable afterward from the RBAC tab. This is called out explicitly in §6 Open Questions in case the intent was different (e.g., zero default access until the GM manually grants).

### ENH-03 — Notion/Obsidian/Superhuman-inspired redesign
**Ask:** copy Notion's blocks/tables/linking, Obsidian's node graph, Superhuman's docs efficiency.
**Root cause:** This is UI/UX work layered on data that mostly already exists — `links` (backlinks), `parentId` (nesting), `revisions` (version history) are all in `schema.ts` already but have no corresponding UI (no graph view component exists in `src/components/`; `admin/page.tsx` shows only aggregate counts, not a revision browser). The only truly missing primitive is Notion-style block-level content — `entries.body` is a single Markdown text field (`src/lib/markdown.ts`), not a block array.
**Affected files:** `src/components/entry-card.tsx`, `entry-form.tsx` (currently single-textarea editing per `src/lib/markdown.ts`), new `src/components/graph-view.tsx`, new `src/app/(app)/codex/[slug]/history` (surfacing `revisions`), `src/db/schema.ts` if block-structured content is adopted (see decision below).
**[DECISION]:** Do **not** rebuild `body` as a Notion-style block array — that is a multi-week editor rewrite (custom rich-text engine) with no proportionate payoff for a GM-facing wiki. Recommended scope: keep Markdown body, but add (a) a force-directed backlink graph view per entry and continent-wide, using the existing `links` table — this is the single highest-value Obsidian feature and is nearly free given the data already exists; (b) table/database views per kind (sortable/filterable grid, Notion's core UX) on top of existing `fields` jsonb; (c) a revision history panel using the existing `revisions` table. Flagged in Open Questions in case a true block editor is actually wanted.
**Risk:** Medium. **Depends on:** none structurally, but graph/table views should filter through the same RBAC predicate as everything else once ENH-02 lands, so sequence after it.

### ENH-04 — Search overhaul: GM full search, player RBAC-scoped search, RAG
**Ask:** GM searches everything; player search is limited by their RBAC grants; use RAG/vector search "if needed to be faster."
**Root cause:** `scripts/sql/setup.sql` already implements two generated tsvector columns (`search_vector` full, `player_search_vector` minus DM notes) and `command-palette.tsx` queries by role. This is a solid foundation — full-text search is not the bottleneck vector search would fix. "Faster" is very likely not the real problem (Postgres GIN-indexed tsvector search over ~500–2,000 rows is sub-millisecond); the actual asks are **semantic** search (find entries by concept/synonym, not just literal keyword) and, more urgently, **RBAC-correct filtering**, which is orthogonal to RAG.
**Affected files:** `scripts/sql/setup.sql` (add a third, per-user-safe path or move filtering to query time against grants), `src/lib/entries.ts` search functions, `src/components/command-palette.tsx`, `src/app/(app)/search/page.tsx`, new `pgvector` migration + embedding pipeline script.
**[DECISION — no API key configured]:** `.env.example` has no LLM/embedding key today, and CLAUDE.md's own rule is to STOP and request credentials for a missing key — overridden here per your "use what's recommended, proceed autonomously" instruction. Recommended default: **local, no-API-key embeddings** via a small ONNX sentence-transformer run in Node (e.g. `@xenova/transformers`, `all-MiniLM-L6-v2`) writing into a `pgvector` column, combined with existing tsvector via hybrid rank (`ts_rank` + cosine similarity). This avoids a hard dependency on a paid key while still delivering semantic search. If you'd rather use OpenAI/Anthropic embeddings for materially better quality, that only requires adding one API key — flagged in Open Questions.
**Risk:** Medium (new dependency, new column, background embedding job). **Depends on:** ENH-02 (RBAC must exist before "player search filtered by RBAC" means anything) and ENH-01/05/06/07 content landing (no point embedding before the corpus is final).

### ENH-05 — FoundryVTT compendium ingestion
**Ask:** scan `E:\FoundryVTT\Data\worlds\asetheria` "especially" the custom compendium, and import into the database/world.
**Audit finding:** `E:\FoundryVTT\Data\worlds\asetheria\packs\` exists and contains one **custom** pack, `asetheira-compendium/`, plus a large set of **third-party** packs: `ddb-asetheria-ddb-{backgrounds,classes,feats,items,journals,monsters,override,species,spells,summons,tables,vehicles}`, `beneos_module_{actors,items,journal,spells}`, `ai-importer-monsters`, `battlemap-arena-type`, `mass-edit-presets-main`. All packs are **LevelDB** (`.ldb`/`CURRENT`/`MANIFEST-*` files — Foundry v10+ format), not plain JSON, so they cannot be read with a text parser; they require a LevelDB client (`classic-level` npm package, same one Foundry itself uses) to enumerate keys and decompress the stored documents.
**Root cause of "why isn't this already in the codex":** the Notion importer (`scripts/import-notion.ts`) only ever read the Notion export in `data/notion-export/`; nothing in this repo has ever touched Foundry data — this is genuinely new ingestion, not a bug.
**Scope decision needed:** the `ddb-*` and `beneos_*` packs are **licensed D&D Beyond / commercial third-party content**, not original Asetheria setting content. **[DECISION]:** import only `asetheira-compendium/` (the custom, setting-specific pack) automatically; treat the DDB/Beneos packs as **out of scope for automatic bulk import** (see §5) pending your confirmation, since re-publishing licensed monster/spell/item text into a self-hosted database raises redistribution concerns the original ask didn't address and I should not silently decide for you.
**Affected files (new):** `scripts/import-foundry.ts` (new, mirrors `scripts/import-notion.ts` structure), new dependency `classic-level`, mapping table from Foundry document types (`JournalEntry`, `Actor`, `Item`, `RollTable`) to existing `entryKind` values (new kinds likely needed — see Phase 2 below), `src/db/schema.ts` (extend `entryKind` enum if Foundry content doesn't map cleanly onto the 18 existing kinds, e.g. a `monster`/`stat-block` kind — `creature` already exists and is the natural target).
**Risk:** Medium — LevelDB reads are read-only and offline (no live Foundry server needed), so this is low blast-radius to existing data, but de-duplication against the 482 already-imported Notion entries needs the same "don't import twice" integrity check the Notion importer already does (`verify-expansion.ts`/`verify-links.ts` precedent).
**Depends on:** ENH-06/07 share the same importer-and-dedupe machinery conceptually but are independent data.

### ENH-06 — Metals & materials table
**Ask:** add the supplied 15-metal cost/AC/description table plus the extended lore entries (Adamant, Adamantine, Copper, Gold, Mithral, Silver, Star metal/Infernal iron/Darksteel/Ironfell [named but not detailed in the prompt], Celestium, Cold Iron/Meteoric Iron, Orichalcum, Tenebrium).
**Root cause / fit:** The `ore` kind **already exists** (`src/lib/kinds.ts:179-191`) with `location`, `properties`, `uses`, `lore` fields, and the codex already has 9 ore entries per the README. This is a content-only addition, not a schema change, **except**: the supplied table has structured columns (`Cost per lb.`, `Ferrous?`, `AC`) that don't map to the current free-text `properties` field. **[DECISION]:** add three new structured fields to the `ore` `KindDef` (`costPerLb`, `ferrous`, `armorClass`) rather than jamming them into `properties` text, so they render as real fields and are filterable in the new table view (ENH-03).
**Affected files:** `src/lib/kinds.ts` (ore field list), new seed data file (e.g. `data/homebrew/metals.ts` or CSV consumed by a new script), `scripts/seed.ts` extension or a new one-off `scripts/import-homebrew.ts`.
**Risk:** Low. **Depends on:** none; can ship first as a proof of the content pipeline.

### ENH-07 — Flora / herbalism content
**Ask:** add the "Popular Magical & Alchemical Plants" list, the d20 plant/effect table, and the ~13 named herbs (Adder's-Tongue, Birthwort, Calendula, Comfrey, Garlic, Heartberry, Juniper, King's Candle, Moorroot, Stinking Nightshade, Witch Hazel, Woundwort) with mechanical effects.
**Root cause / fit:** The `flora` kind **already exists** (`src/lib/kinds.ts:193-204`) with `scientificName`, `effects`, `lore`. This maps cleanly — `effects` already exists as a field, which is exactly what the herb write-ups need. No schema change required, only content + possibly a `rollTable` row for the d20 table (the `rollTables` table already exists in schema per `admin/page.tsx`'s `tableCount` query, and `src/lib/dice.ts`/`tests/roll-tables.spec.ts` confirm rollable tables are a first-class, tested feature).
**Affected files:** same seed pipeline as ENH-06, plus one new `rollTables` row for the d20 plant-effect table.
**Risk:** Low. **Depends on:** none; shares the seed pipeline with ENH-06 (sequence together).

### ENH-08 — External GM Binder content (3 URLs)
**Ask:** scan `gmbinder.com/share/-M-mdGRNm2-f66yo-DYw`, `-NTnLz4LxJVNjsj5BhvN`, `-MUtz6xTilx7n21GGzM3` and pull content in, "with more enhancement."
**Audit note:** these were **not fetched during this planning session** — pulling and restructuring third-party homebrew content is implementation work, not audit work, and doing it now would mean writing content into the plan before you've approved the plan. **[DECISION]:** Phase 1 implementation will fetch each URL, extract structured tables the same way ENH-06/07 were handled (rules text → fields, tables → either `fields` or `rollTables` rows), and route content into the closest existing `KINDS` entry (most GM Binder homebrew of this shape is items/monsters/rules → `item`, `creature`, or `rule` kind) rather than inventing new kinds unless the content genuinely doesn't fit (e.g., a wholly new subsystem).
**Risk:** Low-Medium (unknown content until fetched; possible copyright/attribution note needed for third-party homebrew — will credit source in `sourcePath` the same way Notion imports already are).
**Depends on:** shares the seed/ingestion pipeline built for ENH-05/06/07 — sequence together as one "Phase 1: Content Ingestion."

### ENH-09 — General bug scan
**Ask:** "check for bugs as well."
**Findings from this audit pass** (light-touch — a full line-by-line review of all ~30 source files was out of scope for a token-bounded planning session; flagging what surfaced while tracing the above):
- `src/db/schema.ts` comment states generated search columns "are created by `scripts/sql/setup.sql`... because generated columns and `gin_trgm_ops` are not expressible in Drizzle's push workflow" — this means **`db:push` alone does not fully set up a fresh database**; `scripts/sql/setup.sql` must be run separately. Not a bug per se, but worth an explicit `db:setup` check/assertion so a fresh clone doesn't silently run without search. Will re-verify against `scripts/seed.ts` in Phase 0 to confirm it's already wired (README's `npm run db:setup` implies it is — needs confirmation, not assumed).
- No rate-limiting/lockout was inspected in depth (`src/lib/rate-limit.ts` exists) — will get a real security pass as part of Phase 0 since ENH-01 touches auth directly anyway.
- Everything else requires the Phase 0 code-reading pass (below) to surface reliably rather than guessing from file lists.

---

## 3. Phased Implementation Plan

Sequencing rationale: **schema/auth foundation → content ingestion (parallel-safe, independent of UI) → RBAC UI → Notion/Obsidian UX → search/RAG → hardening.** RBAC UI must follow the schema change that makes per-player grants possible; search scoping must follow RBAC (there's nothing to scope search by until grants exist); content should land before embeddings are generated (embedding a moving target wastes the compute). Bug fixes are folded into the phase that touches the affected code, not deferred to the end, per the Sacred Loop.

### Phase 0 — Multi-player identity & RBAC data model (resolves ENH-01, foundation for ENH-02/04)
**Files to create:** `src/lib/rbac.ts` (grant-resolution logic, replacing role-only checks), migration for new tables.
**Files to modify:** `src/db/schema.ts`, `src/lib/auth.ts`, `src/lib/session.ts`, `src/lib/session-cookie.ts`, `src/app/login/page.tsx` + `login-form.tsx` (add name-capture step), `scripts/create-user.ts`, `scripts/seed.ts`, `.env.example`, `README.md`.
**Technical approach:**
- Add `player_profiles` (or extend `users`) with a `displayName` set at first login rather than by env var — `users.displayName` already exists as a column (`schema.ts` line ~68) but is currently unused by the player flow; wire the existing column into a first-login prompt instead of adding a new one.
- Add `entry_grants` table: `(id, userId → users.id, kind entry_kind NULL, entryId uuid NULL, granted boolean, grantedBy, grantedAt)`. `kind`-only rows grant/deny a whole category (e.g., "all `empire` entries"); `entryId` rows override for a specific entry (e.g., one specific city visible even though `location` category is otherwise hidden). Null-`kind`+null-`entryId` is invalid (checked constraint).
- Default grants on first player login: **[DECISION, see ENH-02]** auto-insert `granted=true` rows for `kind='empire'` and for `kind='location'` rows the GM has flagged `isMajorCity: true` (new boolean in `location`'s `fields`, or a `tags` value `major-city` — reusing `tags` avoids a schema change, **[DECISION]** use tag `major-city`).
- Rewrite `visibilityFilter(role)` → `visibilityFilter(user)`: DM unchanged (`sql\`true\``); player becomes a subquery/join against `entry_grants` resolved per user, falling back to the existing `visibility <> 'secret'` as a hard ceiling (a grant can never expose a `secret` entry — RBAC is additive on top of the existing DM/secret wall, not a replacement for it, so a bug in the new table can't leak DM secrets).
- `redactForPlayer` unchanged (still strips `dmNotes` unconditionally).
**DB migration:** `drizzle-kit generate` for `entry_grants` (new table) — additive, no data loss. **Rollback:** `DROP TABLE entry_grants;` (no other table references it, so this is a clean drop).
**Acceptance criteria:**
1. A brand-new player who signs in for the first time is prompted "What should we call you?" before reaching the codex, and that name is saved to `users.displayName` and shown in the app shell instead of a generic "Player."
2. That new player, before any GM action, can list entries and receives only `empire` kind entries plus `location` entries tagged `major-city` — a request for a `deity` or a non-major-city `location` returns 0 rows / 404, not an error leak.
3. Setting an entry's `visibility` to `secret` hides it from every player regardless of any `entry_grants` row that grants it — verified by a test that grants a secret entry directly and confirms it is still excluded.
4. `tests/entries-player-readonly.spec.ts` and `tests/search-safety.spec.ts` (existing suites) still pass unmodified in spirit — extended, not weakened, with new per-player-grant cases.
**Tests:** extend `tests/auth.spec.ts` (name-capture flow), extend `tests/entries-player-readonly.spec.ts` (per-player grant cases), new `tests/rbac.spec.ts` for grant CRUD.
**Depends on prior phases:** none — this is the foundation phase.

### Phase 1 — Content ingestion pipeline (resolves ENH-05, ENH-06, ENH-07, ENH-08)
**Files to create:** `scripts/import-foundry.ts`, `scripts/import-homebrew.ts` (or one unified `scripts/import-content.ts` with source adapters), `data/homebrew/metals.ts`, `data/homebrew/flora.ts`, `data/homebrew/gmbinder/*.ts` (post-fetch, structured).
**Files to modify:** `src/lib/kinds.ts` (add `costPerLb`/`ferrous`/`armorClass` to `ore`; add whatever new fields the GM Binder content needs once fetched), `src/db/schema.ts` only if `entryKind` needs a genuinely new value (default assumption: it doesn't — Foundry `Actor`→`creature`, `Item`→`item`, `JournalEntry`→`lore`/`note`, `RollTable`→ the existing `rollTables` table, not `entries`).
**Technical approach:**
- `import-foundry.ts`: use `classic-level` to open each pack's LevelDB directory read-only, iterate keys, `JSON.parse` the stored document blobs (Foundry stores full document JSON as values), filter to `asetheira-compendium` only for the automatic pass (ENH-05 decision), map `type`/`documentName` → `entryKind`, write via the same insert path `import-notion.ts` uses so `rebuildLinksForEntry` and revision tracking fire consistently — never a raw SQL insert that bypasses `link-graph.ts`.
- Dedup: hash-match on `name` + `kind` against existing entries before insert (same pattern as the Notion importer's stated 213-duplicate merge behavior); log skipped duplicates for review, don't silently drop.
- `import-homebrew.ts`: reads the metals/flora/GM-Binder structured data files (typed TS objects, not free CSV, so field mapping is compile-checked) and inserts through `src/lib/entries.ts`'s existing create path.
- GM Binder fetch: one-time WebFetch of each of the 3 URLs during implementation, hand-transcribed into the typed `data/homebrew/gmbinder/*.ts` files (not a live scraper — these are static pages behind no API, fetched once, and the result is reviewed by a human before insert, consistent with "take inspiration... add more enhancement" implying editorial judgment, not verbatim republish).
**DB migration:** none required if `entryKind` doesn't need a new value; if fetched GM Binder content needs one (unknown until fetched), a single additive enum-append migration. **Rollback:** for enum additions, Postgres does not support removing an enum value cleanly — rollback plan is to leave the unused value (harmless) rather than attempt a destructive enum rebuild, documented so it's a conscious choice if it happens.
**Acceptance criteria:**
1. `npm run import:foundry` (new script) run against `E:\FoundryVTT\Data\worlds\asetheria\packs\asetheira-compendium` inserts N new `entries` rows and prints a summary (created/skipped-duplicate/errored counts), matching the existing `import-notion.ts` output convention.
2. All 15 metals from the supplied table exist as `ore` entries with `costPerLb`, `ferrous`, `armorClass`, and `lore` populated, findable via `/codex/ores`.
3. All 13 named herbs plus the d20 plant table exist — herbs as `flora` entries with mechanical `effects` text, the d20 table as a new row in `rollTables` playable via the existing dice-roll UI (`src/lib/dice.ts`).
4. Re-running any import script a second time inserts zero duplicate rows (idempotency check via the dedup hash).
**Tests:** new `tests/import-foundry.spec.ts` (or extend `tests/import-export.spec.ts`) asserting counts and no duplicates on re-run.
**Depends on prior phases:** none functionally, but should land before Phase 4 (embeddings) so the corpus is stable before it's indexed.

### Phase 2 — GM RBAC control panel UI (resolves ENH-02)
**Files to create:** `src/app/(app)/admin/rbac/page.tsx`, `src/components/rbac-panel.tsx` (dropdowns/toggles per kind, bulk select-all/add/remove/approve/reject), `src/lib/rbac-actions.ts` (server actions for grant mutations).
**Files to modify:** `src/components/app-shell.tsx` (add the bottom GM-only tab per the ask — "a tab at the bottom"), `src/lib/actions.ts`.
**Technical approach:** a two-pane UI — left: list of players (from Phase 0's per-player rows); right: for the selected player, one row per `KINDS` entry with a toggle (grant/deny whole kind) and an expandable list of individual entries in that kind with per-entry override checkboxes, a "select all" per kind, and bulk action buttons that call one server action mutating N `entry_grants` rows in a single transaction (not N round-trips).
**DB migration:** none (uses Phase 0's `entry_grants`).
**Acceptance criteria:**
1. GM toggles "Locations" off for Player X; Player X's codex list for `location` immediately shows 0 entries (verified live, not just after re-login — session doesn't need to be invalidated since the check is per-request against `entry_grants`, not cached in the session token).
2. GM selects 5 specific `location` entries via checkboxes and clicks "Grant selected" — exactly those 5 become visible to the player even though the `location` kind toggle remains off.
3. Bulk "select all" in a kind followed by "Reject" removes all previously-granted entries in that kind for that player in one action (one network request, verified via browser network panel / Playwright request assertion).
4. A non-GM user cannot reach `/admin/rbac` (redirects like the existing `/admin` page does) and cannot invoke the RBAC server actions directly (action re-checks `requireDM()` server-side, not just hides the UI).
**Tests:** new `tests/rbac-panel.spec.ts` (Playwright, GM flows), extends `tests/entries-player-readonly.spec.ts` for the negative-access case in criterion 4.
**Depends on:** Phase 0.

### Phase 3 — Notion/Obsidian-style UX: graph view, table views, revision history (resolves ENH-03)
**Files to create:** `src/components/graph-view.tsx` (force-directed graph over `links`, likely `d3-force` or a lighter canvas approach given no heavy graph lib is currently a dependency), `src/app/(app)/graph/page.tsx` (continent-wide graph), per-entry mini-graph section on `entry-card.tsx`, `src/components/entry-table.tsx` (sortable/filterable grid per kind), `src/app/(app)/codex/[kind]/history` or a history panel on the entry page surfacing `revisions`.
**Files to modify:** `src/app/(app)/codex/**` pages to add table-view toggle alongside the existing card/list view, `entry-card.tsx`.
**Technical approach:** the graph endpoint queries `links` joined to `entries`, filtered through the **same RBAC predicate as Phase 0/2** (a player's graph view must not reveal edges to entries they can't see, including via node-hover previews) — this is the one place graph work has a hard dependency on RBAC being correct first. Table views read the same `entries`+`fields` data already used by the card view, just rendered as rows/columns with client-side sort (no new backend query shape needed beyond existing list endpoints).
**DB migration:** none.
**Acceptance criteria:**
1. `/graph` renders every entry the current user can see as a node and every link between two visible entries as an edge; an entry the user cannot see does not appear even as an unlabeled node.
2. Clicking a node navigates to that entry; hovering shows name + kind icon without a full page load.
3. Each codex section (e.g. `/codex/deities`) offers a table view showing all structured `fields` as sortable columns, matching the fields defined in `KINDS` for that kind.
4. An entry page has a "History" section listing prior revisions with timestamp and author, matching row count in the `revisions` table for that entry.
**Tests:** new `tests/graph-view.spec.ts`, `tests/table-view.spec.ts`; visual check via existing `tests/responsive-visual.spec.ts` pattern.
**Depends on:** Phase 0 (RBAC-correct graph), Phase 1 (graph is more meaningful with the expanded content).

### Phase 4 — RBAC-scoped + semantic (RAG) search (resolves ENH-04)
**Files to create:** `src/lib/embeddings.ts` (local ONNX embedding generation), migration adding a `pgvector` column, `scripts/generate-embeddings.ts` (backfill + incremental job).
**Files to modify:** `scripts/sql/setup.sql` (add `pgvector` extension + index), `src/lib/entries.ts` search functions, `src/components/command-palette.tsx`, `src/app/(app)/search/page.tsx`.
**Technical approach:** add `embedding vector(384)` column (dimension matches `all-MiniLM-L6-v2`); `scripts/generate-embeddings.ts` runs after any content import (hook into Phase 1's import scripts to call it, or a cheap trigger-based "needs embedding" flag column checked by a cron/manual run — **[DECISION]** manual/CI-triggered run, not a live DB trigger, to keep write-path latency unaffected). Search becomes: full-text `ts_rank` candidates ∪ top-K vector-similarity candidates, re-ranked, then — critically — **filtered through the Phase 0 RBAC predicate before returning results**, so semantic search can never surface a title/snippet the player isn't otherwise allowed to see.
**DB migration:** `CREATE EXTENSION IF NOT EXISTS vector;` + `ALTER TABLE entries ADD COLUMN embedding vector(384);` + HNSW or IVFFlat index. **Rollback:** `DROP COLUMN embedding; DROP EXTENSION vector;` (safe, no other table depends on it).
**Acceptance criteria:**
1. GM searching "storm god" finds Olympus (titan of storms) even if that exact phrase doesn't appear in the entry (semantic match), confirmed as a top-3 result.
2. A player with no grant on `deity` entries gets zero deity results for any query, including semantically-close ones — confirmed by a test using a query known to semantically match a deity-only entry.
3. Search response time for the full corpus (post Phase 1, likely 600–900+ entries) stays under 300ms p95 in local testing.
**Tests:** extend `tests/search-safety.spec.ts` (RBAC + semantic leak check — the highest-priority test in this whole plan), new `tests/search-semantic.spec.ts`.
**Depends on:** Phase 0 (RBAC), Phase 1 (stable corpus to embed).

### Phase 5 — Hardening pass (resolves ENH-09 + anything Phases 0–4 surfaced)
**Technical approach:** re-run full Playwright suite after every prior phase merges (already required by the Sacred Loop), plus a targeted security pass on `src/lib/rate-limit.ts` and the login flow given Phase 0 changed it, plus a full `tsc --noEmit` + `next lint` pass.
**Acceptance criteria:** zero failing tests across the full suite; zero TypeScript/lint errors; `docs/content-review.md` updated with the final entry counts (mirrors README's existing count table, which will need updating regardless once Phases 1/5/6/7 land content).
**Depends on:** all prior phases.

---

## 4. Risk Register

| Risk | Blast radius | Mitigation |
|---|---|---|
| RBAC bug leaks a `secret` entry to a player | Breaks the core promise of the app (DM notes/secrets exposed) | `visibility='secret'` remains a hard ceiling independent of grants (Phase 0 design); dedicated leak tests in every phase that touches read paths, not just Phase 0 |
| Foundry LevelDB packs are locked while a Foundry server is running | Import script fails/hangs | Document "close Foundry before running `import:foundry`"; open in read-only mode; catch lock errors with a clear message, don't retry-loop |
| DDB/Beneos packs contain licensed third-party content | Legal/redistribution exposure if bulk-imported | Explicitly excluded from automatic import (§2 ENH-05 decision); flagged in Open Questions for your explicit call |
| Local embedding model (`@xenova/transformers`) adds real dependency weight / cold-start cost to a serverless-friendly Next.js app | Slower cold starts, larger bundle if imported into a request path | Run embedding generation only in the standalone `scripts/generate-embeddings.ts` (Node script, not a Next.js API route), never on the request path |
| Enum-append migrations for new Foundry/GM-Binder content types can't be cleanly rolled back in Postgres | Minor — an unused enum value persists if a phase is reverted | Documented in Phase 1 rollback notes; avoided entirely if content maps onto existing kinds, which is the default assumption |
| Existing single shared `party` account/env vars become meaningless once real per-player accounts exist | Confuses redeploys, could double-create accounts | Phase 0 migrates the existing player row into "first player" rather than deleting it; README/`.env.example` updated in the same phase |
| Bulk RBAC UI actions (Phase 2) mutate many rows — a bug could grant/revoke far more than intended | A GM's bulk "reject all" fat-fingered on the wrong tab could hide broad swaths of content from a player mid-session | Every bulk action requires the explicit kind/selection to be echoed in a confirmation state before commit (client-side); server action logs `grantedBy`/timestamp on every row for auditability/undo |

---

## 5. Out of Scope — flagged for decision

These surfaced during the audit but were **not** in your findings list; not actioned, listed for your call:

- **DDB/Beneos-sourced Foundry packs** (commercial/licensed content) — excluded from automatic bulk import pending your explicit confirmation that you want licensed third-party content re-published into this codex (see ENH-05, Risk Register).
- **A true Notion-style block editor** (drag-reorderable block types: heading/paragraph/table/embed as discrete records) — scoped down to Markdown-body + graph/table views (ENH-03 decision) because a full block engine is an editor rewrite, not a UI pass; call it out if block-level editing (not just block-level *viewing*) is actually required.
- **Real-time multiplayer presence** ("Superhuman" is a fast single-user client, not a multi-user real-time doc — if what's wanted is players seeing each other's cursors/live edits Notion-style, that's a websocket/CRDT layer not currently planned).
- `Ironfell`, `Darksteel`, `Infernal iron`, `Star metal` are named in your material list but given no description/mechanics in the prompt (unlike Adamant, Mithral, Celestium, etc., which have full write-ups) — these will be added as stub `ore` entries with name only unless you supply their lore/mechanics.
- `docs/content-review.md` and README's entry-count table will drift out of date the moment Phase 1 lands — proposed as part of Phase 5, not separately requested but necessary bookkeeping.

---

## 6. Open Questions

1. **Default player visibility** (ENH-02): confirmed reading is "3 empires + major cities visible by default, everything else requires a GM grant." If you actually meant **zero** default access until the GM manually grants per player, say so — Phase 0's seed logic changes from "auto-grant empire+major-city" to "auto-grant nothing."
2. **DDB/Beneos Foundry packs**: import them too, or leave them out as licensed content (current plan: leave out)?
3. **Embedding provider** (ENH-04): local no-key model (current plan, zero cost/no key) vs. an OpenAI/Anthropic embeddings API key for higher-quality semantic search — if you want the latter, which key should I expect in `.env.local`?
4. **Notion "blocks"**: is block-level *viewing* (tables, graph, backlinks — current plan) sufficient, or do you specifically want block-level *editing* (drag-and-drop mixed content blocks like real Notion)? This materially changes Phase 3's size.
5. **Ironfell/Darksteel/Infernal iron/Star metal**: stub-only (name, no mechanics) unless you provide detail, or should these be dropped from the metals list entirely?
6. The three GM Binder URLs will be fetched and hand-mapped onto existing kinds during Phase 1 implementation (not fetched during this planning pass) — flag now if you'd rather see their content summarized *before* approving Phase 1, which would add one more back-and-forth before implementation starts.

No answer is required to proceed — per your instruction, Phase 0 will implement the **[DECISION]** defaults above and these will be re-confirmed via the phase-by-phase reports in Prompt 3 (implementation), where you can redirect at any checkpoint before further phases build on top of a wrong assumption.
