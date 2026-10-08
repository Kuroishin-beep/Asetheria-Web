# SESSION_HANDOFF_UPDATE.md — Asetheria-Web

Pick-up document for the next session. It replaces nothing: `SESSION-HANDOFF.md`
is the older RBAC-era handoff; `PLAN.md` (v2) is the spec; `IMPLEMENTATION_TRACKER.md`
holds per-phase evidence. This file says where the build stands **right now**, what is
half-done, and exactly what to do next.

No secrets are written in this file. The Neon credentials the user pasted are in
`.env.neon` (git-ignored). **They were pasted into a chat, so tell the user to rotate
that database password when Phase 0 is finished.**

---

## 1. The task, in one paragraph

The user asked for a full upgrade of the Asetheria D&D codex (`E:\Github\Asetheria\Asetheria-Web`):
scan ores and fauna (licence-safe sources only), integrate them, populate entries (places,
descriptions, tables), add player-side and DM-side enhancements, and polish the site with
vvd.world as the inspiration. `PLAN.md` was approved and the instruction is
"implement `PLAN.md` from 0% to 100%" under loki mode, with hard rules (below). The user
later said they also want LegendKeeper and World Anvil as inspirations, and asked that the
site be efficient and not lag the server, and mentioned load balancing. Those last two
are handled in section 7 (scope notes).

### Hard rules from the user (keep following them)
- No stubs, mocks or fake data in production paths.
- Never claim a test passed unless it was executed and observed. Never weaken, skip or delete a failing test; if a test is genuinely wrong, justify it explicitly before changing it.
- Never start phase N+1 while phase N has a failing check.
- **No scope expansion beyond `PLAN.md`: STOP and ask.** STOP and ask on real ambiguity.
- No destructive commands (drop database, force push, rm -rf on non-generated dirs) without explicit approval.
- Per phase: re-read the spec, implement fully, run `tsc`, build, tests, state evidence per acceptance criterion, update `IMPLEMENTATION_TRACKER.md`, commit `feat(phase-N): ...` (trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`).
- Never point tests or scripts that the suite runs at Neon. Tests run only against the local Docker Postgres `asetheria-test-pg` (port 55432, started with `docker start asetheria-test-pg`).
- Project `CLAUDE.md` rules: terse output, a `[TOKENS] ~N tokens | est. $X` line after completed tasks, shadcn/ui + design tokens, no inline style objects, no plain `<button>`, no hardcoded colours.

---

## 2. Where everything stands

### Committed (branch `hardening-and-content`, local; `origin/main` = `833c007` = Phase 4)

| Phase | Commit | What |
|---|---|---|
| 1 | (earlier) | `fauna` + `table` enum values, migration of 8 animals and legacy roll tables |
| 2a-2e | `2bad816`…`62babd5` | shadcn/ui + Motion + next-themes migration, tokens, a11y, design gates |
| 3 | `5956972` | fauna and table UI, rollable table entries, `foundIn` connections |
| 4 | `833c007` | 160 original natural-world entries (40 ore, 60 flora, 60 fauna), verifier, licence ledger |
| 5 | `17463d1` | 100 new places; role-scoped `Found in` links (R5); `foundIn` backfill |
| 6 | `ac23c5b` | 24 authored random tables, cross-linked to places |
| 7 | `d273e08` | server-driven database view (`?view=table&sort=&dir=&cols=`), numeric-aware sort |
| 8a | `c67a34e` | NPC/deity hero card, per-kind templates, local graph, recently viewed (palette) |
| 8b | `7ee79ce` | interactive map with role-scoped pins (`maps`, `map_pins`) |

**Pushed:** only up to Phase 4 (`origin/main` and `origin/hardening-and-content` = `833c007`). Phases 5, 6, 7, 8a, 8b are committed locally and **not pushed** (the user's earlier push approval was a one-time request).

### In the working tree, NOT committed: Phase 8c (world graph upgrades)
Files: `src/lib/graph-filter.ts` (new), `src/lib/graph-cache.ts` (new), `src/lib/layout-cache.ts` (new), `src/lib/graph-layout.ts`, `src/lib/entries.ts` (`getGraphData` now returns tags/region/parentId), `src/app/(app)/graph/page.tsx`, `src/components/graph-view.tsx` (rewritten), `tests/graph-upgrades.spec.ts` (new), `tests/a11y.spec.ts`, `tests/editor-ui.spec.ts`, `.gitignore` (adds `.env.neon`, `backups/`).

**Update:** `src/lib/rbac.ts` and `tests/rbac-inheritance.spec.ts` were the user-requested "children of granted cities are visible" change; they are now committed as `9b0722d` (full suite 352/352 with the 8c tree). Grants now inherit from the nearest ancestor *location* with an explicit row, so a Phase 8d "reveal" of a city also reveals the places inside it.

**Do NOT commit** these pre-existing files that belong to the user: `Aetheria.jpg`, `The Port City of Helarchon.jpg`, `WIP Map.png`, `docs/maps/`. (A copy of `WIP Map.png` is already committed as `public/maps/wip-map.png`, which is the app's asset.)

### 8c status: implemented and verified except one final full run
- Last **full** suite run (before the final test edit): **351 passed, 1 failed**. The one failure was `tests/editor-ui.spec.ts` "graph › loads with no console errors..." which asserted that a focused node has a `<text>` child. The label moved to a separate overlay layer (a performance fix), so the assertion was updated to check the overlay label `getByTestId("graph-hover").locator("text")` has the focused node's name. That edited spec was re-run alone: 2 passed. This change is intentional and justified (structure changed, behaviour kept; it is stricter than before).
- **To finish 8c:** run `npx tsc --noEmit`, run the full suite once more (expect about 352 passing), run `npm run build`, `npm audit --omit=dev`, `npx tsx scripts/check-design-system.ts`, add the 8c section to `IMPLEMENTATION_TRACKER.md`, then commit `feat(phase-8c): ...`.
- 8c acceptance evidence so far:
  1. kind=ore shows only ores + direct neighbours, checked node-for-node against the database (`graph-upgrades.spec.ts`); filters by kind/region/tag live in the URL (`?kind=&region=&tag=&cluster=parent`), validated against what the viewer can see; secret pages' tags/regions are absent for players and asking for them changes nothing.
  2. Performance: 1,044 nodes, 4x CPU throttle (CDP), pointer sweep. Last runs: p90 frame time 16.8 to 33.3 ms, median 16.7 ms, mean 38 to 44 fps (the test asserts p90 <= 33.4 ms and no frame over 1 s; it sits on the boundary, so if it flakes under load, look at the hover layer before touching the threshold). The number is recorded in `test-results/graph-fps.json` by the test. Before the fixes p90 was 50 to 83 ms.
  3. Keyboard: one tab stop; arrow keys move to the nearest node in that direction; Enter opens; Escape leaves; all asserted.
  4. Parent clustering: `cluster=parent` places children on an orbit ring around their parent (`placeChildrenAroundParents`); test asserts mean parent-child distance drops below half.
- Efficiency work done in 8c (answering "efficient, don't lag the server"): server layout cost cut ~3x (grid repulsion, `REPULSION_RADIUS = 70`), result cached by content fingerprint (`layout-cache.ts`, LRU 24, per instance, so correct behind any load balancer), links drawn as two `<path>`s instead of ~3,500 `<line>`s, edges `pointer-events-none`, hover trace in its own overlay svg.
- Design decision to note for the user: a `/graph` link that still passes a stale tag etc. is simply ignored.

### Remaining phases

**Phase 8d: Campaign planner. NOT STARTED (only code-reading done).** Spec in `PLAN.md`:
> "Start session" command creates a session entry with date and number; prep checklist; encounter builder that pulls Bestiary and `table` entries; "reveal after session" bulk grant of chosen entries to chosen players. Acceptance: 1) the command creates the entry and navigates to it; 2) rolling the builder yields only creatures the DM can read; 3) bulk reveal creates grants for exactly the selected player/entry pairs and nothing else (DB assertion); 4) a player sees revealed entries immediately and the "what's new" list includes them.

Design worked out (not yet coded):
- `src/lib/planner.ts` (server-only): `createSession(user)`: kind `session`, name `Session N` (N = max numeric `fields.sessionNumber` + 1), slug `session-N` with retry on collision (no transaction, because prod may use the neon-http driver), `fields {sessionNumber, playDate: today}`, **visibility `secret`** (prep), body = prep checklist markdown (`## Prep checklist` with `- [ ]` items, `## Scenes`, `## Encounters`, `## After the session`), `dmNotes` template, tag `session`; then snapshot a revision, `rebuildLinksForEntry`, `refreshEmbeddingAfterResponse`, `revalidatePath`. Mirror `createEntryAction` in `src/lib/actions.ts` (its helpers `snapshot`/`uniqueSlug` are private to a `"use server"` file; do NOT export them from there; reimplement in the new module).
- `POST /api/planner/session` (DM only) returns `{slug, number}`; client navigates to `/codex/entry/<slug>`. Add a palette action "Start a new session" (`src/lib/shortcuts.ts` actions only have `href`; add a handler kind) and a button on the planner page and the Sessions section.
- `POST /api/planner/encounter` (DM only): body `{tableSlug?, count 1..8, crMax?, type?, habitat?}`; picks creatures from the DM-readable bestiary using `listEntries` (access-scoped; archived never returned), CR via `numericValue()` from `src/lib/field-sort.ts`, random via `crypto.randomInt`; rolls the chosen `table` entry with `rollOnTable`/`roll` from `src/lib/dice.ts` (`parseRollTable` in `src/lib/roll-table.ts`).
- `POST /api/planner/reveal` (DM only): `{playerIds[], entryIds[]}` -> for each player `bulkSetGrant(dm.id, playerId, entryIds.map(entryId => ({entryId})), true)` (`src/lib/rbac.ts`). **Creates entry-level grants only, never kind grants, never changes visibility.** Secret entries are skipped and reported (`skippedSecret`), because a grant alone cannot reveal a `secret` entry (`readable()` = `visibility != secret AND grantCondition`); the UI must tell the DM to set such entries to `revealed` in the editor first. Validate players exist with role `player`.
- `getWhatsNew(user, limit)`: entries the player has an explicit grant on (`entry_grants.entry_id` not null, `granted = true`) that are live and readable, newest `granted_at` first; show as "New for you" on the front page (`src/app/(app)/page.tsx`, `Dashboard`).
- `/planner` page (DM only; sidebar link under "Keeper" in `src/components/app-shell.tsx`): start-session button + recent sessions, encounter builder, reveal form (players via `listPlayers()` from `src/lib/rbac.ts`; entries by search through `/api/find`).
- Tests (`tests/planner.spec.ts`): parallel start-session calls give distinct numbers/slugs; entry is secret and DM-only; player gets 403; encounter never returns an archived creature over many rolls, honours `crMax`, table roll lands in a row, bad table 404/400; reveal DB assertion: only the selected (player, entry) rows are added, snapshot the whole `entry_grants` table before/after, non-selected players untouched, secret entries skipped, idempotent re-run, invalid ids 400, player caller 403; a player with no kind grant gets 404 before and 200 immediately after, and the entry is in "New for you"; axe in both themes; 375px.

**Phase 0: Prod (Neon). BLOCKED/DECIDED, NOT STARTED.** See section 3.

**Steps 2 to 4 of the user's instruction. NOT STARTED:**
- Step 2: `test-cases.html` — one self-contained offline file. Columns: ID `TC-<MODULE>-<NNN>`, Module, Category (Happy/Sad/Edge/Boundary/Validation/Permission & Auth/Security/Data Integrity/Concurrency/Error & Recovery/Responsive/Accessibility), Priority, Preconditions, Steps, Test Data, Expected, Actual (blank), Status dropdown (Not Run/Pass/Fail/Blocked), Notes. Plus a summary dashboard, filters and search, a traceability section (PLAN.md criterion -> TC ids), print stylesheet. Coverage floor: for every user action, one happy, one invalid-input, one unauthorized and one boundary case.
- Step 3: Playwright specs that mirror `test-cases.html` 1:1, **named with the TC id**; screenshot on every test, video + trace on failure, `retries = 0`, artifacts to `./test-results/`; start and health-check the app, seed deterministic data, run, fix application code for failures, mark BLOCKED and ask if the plan is contradictory. (Existing 46 spec files already cover much of this; the mirror should reference or wrap them rather than duplicate blindly. Decide the mapping up front and record it in the traceability section.)
- Step 4: update `test-cases.html` with real results, write `TEST-REPORT.md` (the old one was archived under `docs/*-archive-rbac-2026-09.*`: totals, bugs with root cause and fix, remaining risks), fully update `IMPLEMENTATION_TRACKER.md`, give a chat summary. Say "All phases implemented and verified" **only if true** (it is not true while 8c is uncommitted, 8d is unbuilt, and Phase 0 is not done).

---

## 3. Neon / production (Phase 0)

- The user supplied Neon credentials. They are in **`.env.neon`** (git-ignored; also `backups/` is git-ignored). Variables: `DATABASE_URL` (pooled, for the app and neon-http scripts) and `DATABASE_URL_UNPOOLED` (use for `psql`/DDL). Test code loads only `.env.local` and `.env`, never `.env.neon` (`tests/load-env.ts`).
- **Finding:** a read-only inspection showed that database is **completely empty** (Postgres 18.6, only the `plpgsql` extension; no tables, no `entry_kind` enum, nothing). The handoff note had assumed a live prod needing "catch-up". That was ambiguous, so the user was asked; **the user chose: "It's the right, new DB: build it"** (create the full schema and load all content).
- **Nothing has been written to Neon.** Only the read-only inspection was run.
- Plan for the build (all additive; confirm the DB is still empty first):
  1. Backup is vacuous on an empty DB; still write `backups/neon-before-<timestamp>.json` (or note "empty") as the Phase 0 artifact.
  2. Schema: `npx drizzle-kit push` against Neon (set `DATABASE_URL` from `.env.neon` for that command only; check what it proposes first) creates all tables/enums from `src/db/schema.ts` (includes `maps`, `map_pins`, the `fauna`/`table` kinds). Alternatively apply a generated SQL. Do not point tests at it.
  3. `scripts/sql/setup.sql` through psql (the file has `$fn$` function bodies containing semicolons, so **do not** use `scripts/apply-sql.ts` for it; that script splits on `;` and is only for simple files such as `maps.sql`). `psql` is not installed on the host: run it through the Docker container, passing the URL by environment variable so it never appears in the command text: `DBURL=$(grep '^DATABASE_URL_UNPOOLED=' .env.neon | cut -d= -f2- | tr -d '"'); docker exec -i -e DBURL="$DBURL" asetheria-test-pg sh -c 'psql "$DBURL" -v ON_ERROR_STOP=1 -f -' < scripts/sql/setup.sql`. Needs `CREATE EXTENSION vector` and `pg_trgm` (Neon allows both).
  4. `scripts/sql/maps.sql` (`npm run db:maps`), then `npm run maps:seed`; copy `public/maps/` with the deploy.
  5. Users: create the DM and the player-door config (see `scripts/create-user.ts`; `PLAYER_PASSWORD` is a Vercel env var that gates the party door; `SESSION_HANDOFF.md` section 3).
  6. Content, in order (each idempotent; dry-run first with `--dry-run`): `import-notion`/seed as used for the original corpus (see `scripts/seed.ts` and `docs/AUDIT-AND-ROADMAP.md`), `import-codex-file.ts` for `data/foundry-world.json`, `data/lore-population.json` (`--fill-empty`), `data/city-locations.json`, `data/natural-world/ores-*.json`, `flora-*.json`, `fauna-*.json`, `places-*.json`, `tables.json`; `scripts/merge-duplicates.ts --apply`; `scripts/backfill-found-in.ts --apply`; `scripts/link-tables-to-places.ts --apply`; `scripts/migrate-fauna-and-tables.ts` (retags the 8 original animals and migrates legacy roll tables: needs those source entries to exist first); `scripts/rebuild-links.ts`; `npm run embeddings:generate`; `npm run check:links` (baseline: 2 known unresolved links).
  7. The homebrew batches (`data/homebrew/*.json`: flora, metals, planar-metals) are **kept** by the user's decision (section 4b): load them into prod with `import-homebrew.ts`/`import-codex-file.ts` as the local DB did (check `scripts/import-homebrew.ts` and `tests/homebrew-content.spec.ts` for the exact commands), and update the ledger.
  8. Acceptance (from PLAN.md Phase 0): backup artifact exists before any write; `GET /api/health` on the deployed app returns 200 (needs the prod app URL and the code deployed with the Neon env vars; **ask the user where it is hosted and who deploys**); `check:links` baseline holds; `/codex/npcs` includes "Elira" exactly once (check by query: `select count(*) from entries where name ilike 'Elira' and archived_at is null`).
  9. Order matters: schema and data first, then deploy the code, because the code now expects the new enum values and tables.
- Ask the user to **rotate the Neon password** afterwards (it was pasted in chat), then update `.env.neon` and the Vercel env var.
- A second pasted identifier, `scl_...` (and a `@vercel/connect` `getToken('neon/asetheria-web', ...)` snippet), could not be used: not a connection string. Nothing was saved from them; `@vercel/connect` was **not** installed.

---

## 4. How to run things (Windows, Git Bash)

```bash
cd /e/Github/Asetheria/Asetheria-Web
docker start asetheria-test-pg                      # local test DB, port 55432
npx tsc --noEmit                                    # "npm run lint" is the same
npx playwright test --reporter=line                 # full suite; ~12 to 14 min; ONE worker; never run two at once
npx playwright test tests/<file>.spec.ts --reporter=line
npm run build ; npm audit --omit=dev
npx tsx scripts/check-design-system.ts              # 12 design gates, must be 0 violations
npx tsx scripts/check-contrast.ts
npm run verify:natural-world                        # data files: 40/60/60 specimens, 100 places, 24 tables
npm run check:links -- --max 2
```
- The Playwright `webServer` reuses a dev server on :3000 if one is running; before `npm run build`, stop it (`Get-NetTCPConnection -LocalPort 3000 ... Stop-Process`).
- **Do not edit app code while a full suite is running** (it hot-reloads and produces spurious failures; this happened once and the run was discarded).
- Local DB state now includes everything built so far (1,000+ entries, 100 places, 24 tables, the `wip-map` map). Tests create `zz-` fixtures and clean them up.
- Playwright run in background: a command over 10 minutes is moved to the background; poll the log file with an `until grep` loop.

### Gotchas that cost time this session
- Bash heredocs with apostrophes/backticks break (`unexpected EOF`); use the Write tool for files and a small Python script file for multi-line edits. Python on Windows needs `C:\...` paths, not `/c/...`.
- Python text-mode writes can turn LF into CRLF; the edit scripts here read with `newline=''` and normalise.
- The Read hook can fail when the shell cwd is `Asetheria-Web`; end Bash commands with `cd /e/Github/Asetheria`.
- Test players need `display_name` set or they are redirected to `/onboarding` (a 200).
- A click right after `page.goto` can land before React hydrates and be lost; retry with `expect(...).toPass()` (see `openPin` in `tests/map.spec.ts`).
- `loading.tsx` breaks `notFound()` status codes; skeletons live in Suspense instead.
- `ALTER TYPE ... ADD VALUE` must run outside a transaction.
- A grant alone does not reveal a `secret` entry.

---

## 4b. Decisions the user made after this file was first written (latest message, authoritative)

| Topic | Decision |
|---|---|
| GM Binder-derived homebrew (`planar-metals`, herbalism `flora`, `metals`) | **KEEP it.** Load it into prod with everything else. Update `docs/content-licences.md` to record "kept by the owner's decision" instead of "needs your decision". Do not archive or rewrite it. |
| Hosting / deploy | **The app is on Vercel and the user deploys it.** I do not deploy. After the Neon database is built, tell the user exactly which env vars to set on Vercel (`DATABASE_URL`, the existing session/player-door secrets, optional `EMBEDDINGS_CACHE_DIR`) and which commit to deploy. The `/api/health` check on prod is theirs to run after their deploy (ask for the URL), or they paste the result. |
| Scope | **Finish ALL phases** (8c finish, 8d, Phase 0 Neon build, deliverables in Steps 2 to 4), "Do all". |
| Git | **After everything is finished: push `hardening-and-content` and merge to `main`** (fast-forward if possible; `origin/main` is currently `833c007`, Phase 4). This is explicit approval for that push and merge only. Never commit the user's pre-existing files listed in section 2. |
| Neon | Build the empty DB as a fresh production database (decided earlier). |

These supersede items 1, 2 and 3 in section 5 below. Items 4 (LegendKeeper / World Anvil) and 5 (load balancing) are still open: do not build them; list them as proposals in the final report.

## 4c. Update, 2026-10-09 (read this first)

**Resumed after the pause.** Local services were restarted (`docker start asetheria-test-pg`). A full suite run for Phase 8c was started again and is the next thing to check (log at `/tmp/full-suite-p8c3.log`, may be gone; just rerun).

**Neon production database: BUILT and VERIFIED (Phase 0 data side done).** The user confirmed "build it" for the empty database. Done, in this order, all additive, nothing deleted:
1. Extensions `vector` and `pg_trgm`; schema from `drizzle-kit export --sql` (9 tables, 3 enums, 20 entry kinds) applied in one transaction; `scripts/sql/setup.sql` (search vectors, indexes, triggers); `scripts/sql/maps.sql`. Production structure compared with local: identical (tables, 20 kinds, 33 indexes, 2 triggers, extensions, search/embedding columns).
2. Content copied from the local database with the new `scripts/clone-content.ts` (dry-run default; refuses a Neon source or a non-empty target; one transaction; copies entries with embeddings, links, legacy roll tables, maps; skips users, grants, revisions, pins and all `zz-`/`test:` fixtures). Result in production: 1,060 entries (1,041 live, 19 archived, all 1,060 embedded), 3,561 links, 1 roll table, 1 map. **Checksums of entries and of links are identical to local.** The kept homebrew is included (62 live entries with a `homebrew:` source).
3. Phase 0 checks run against production: `check-links` = exactly the 2 known unresolved links (baseline held); "Elira" appears exactly once as a public NPC; full-text search works; all embeddings are 384-d.
Still to do for production (needs the user): **create the DM account** and set the party-door password (see below), set the Vercel environment variables, deploy, and run `/api/health`. Rotate the Neon password afterwards (it was pasted in chat).

Exact commands for the user (do not invent the DM password for them):
```bash
# DM account in production (Git Bash, from Asetheria-Web). Use the pooled URL from .env.neon:
DATABASE_URL="<DATABASE_URL from .env.neon>" npm run user:add -- --username <dm name> --password "<a strong passphrase>" --role dm
```
Vercel environment variables (Project Settings, Environment Variables): `DATABASE_URL` (the pooled Neon URL; the Neon integration may inject it), `AUTH_SECRET` (32+ chars: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`), `PLAYER_PASSWORD` (the party-door password), optional `SIGNUP_CODE` (only if self-registration is wanted), optional `EMBEDDINGS_CACHE_DIR`. See `.env.example`. Players are created at the party door or through `/register` with the signup code; they start with the default access rules.

**New scope added to PLAN.md (v2.1) by the user on 2026-10-09: Q14, Phases 9 to 11.** Read `PLAN.md` section "Added scope, request of 2026-10-09". Summary:
- **Phase 9, landing page:** `/welcome` becomes a public cinematic landing page (original SVG scenes animated with Motion: misty peaks and road, a round-door hillside home, a sea-gate with columns and lighthouse, the three empires, the unrolling map), with calls to action "Enter the codex" (the existing door stays as the last section so the auth specs pass unmodified) and "Forge a hero" (`/create-character`). Reduced-motion static mode; performance budget; a denylist test for borrowed titles (no LOTR / Hobbit / Percy Jackson names, art or text).
- **Phase 10, character engine:** house rules in one constants module (point buy 27+2+1d4, 6 to 15; 4d6 drop lowest, total >= 72, reroll rules; three standard arrays; HP maxed levels 1 to 3 and reroll-a-1 once; citizenship; worship; combat house rules), pure functions with exact tests, `characters` table with `scripts/sql/characters.sql` and a rollback, API with server re-validation and recomputation.
- **Phase 11, wizard and sheet:** 12-step wizard asking the player questions, a 5e-style sheet, print/JSON export, Wikidot "Learn more" links (links only), public mode (no database reads, constants only) and member mode (access-scoped dropdowns, save to account), a "Characters" tab in the sidebar, DM read-only list.
- Seven working assumptions (a to g) are written in the plan; the main ones to confirm with the user: the citizenship benefits/weaknesses table did not paste ("Untitled") and the stat-calculator link was not supplied.
- Order: finish 8c, build 8d, then Phases 9, 10, 11, then the Steps 2 to 4 deliverables (which must now include the new phases in `test-cases.html` and the traceability), then push and merge to `main`. When the new phases are built, add `characters.sql` to the production rollout and re-copy or apply it (the copy tool only loads an EMPTY target, so for later additions apply the new SQL and import only the new rows).

**8d drafting in progress:** `src/lib/planner.ts` (session creation with retry on slug collision, encounter builder, reveal to players, what's-new, recent sessions) was drafted OUTSIDE `src/` at `<scratchpad>/8d/src/lib/planner.ts` so it would not disturb the running suite. If the scratchpad is gone, rebuild it from the design in section 2. The routes, page, client panels and tests are not written yet.

**Reminders for the next session:** never edit app source while a full suite is running; `.env.neon` is git-ignored; the user's RBAC inheritance commit `9b0722d` is now on the branch (it changes `grantCondition`; the map and planner queries use it).

## 5. Open decisions waiting on the user

1. ~~**GM Binder-derived homebrew**~~ (RESOLVED: keep, see 4b) (predates the licence rule "licence-safe sources only"): `data/homebrew/planar-metals.json` (24 entries, "GM Binder Fantasy Metals Compendium"), `flora.json` (20 herbalism entries marked "external GM Binder page"), `metals.json` (player-supplied, origin unrecorded). Options: keep (with the author's permission), rewrite as original, or archive (reversible: `npm run codex:archive-batch -- "homebrew: Fantasy Metals Compendium" --apply`, `--restore --apply` to undo). Written up in `docs/content-licences.md`. Nothing was changed.
2. ~~**Where the production app is hosted and who deploys**~~ (RESOLVED: Vercel, the user deploys, see 4b) (needed for the `/api/health` acceptance check).
3. ~~**Push/merge:**~~ (RESOLVED: push and merge to main after all phases, see 4b) Phases 5 to 8b (and 8c once committed) are local only. The user previously approved one push and fast-forward of `main` (done through Phase 4). Ask before pushing again.
4. **LegendKeeper / World Anvil inspiration** (new): this is beyond `PLAN.md` (vvd.world only). Do not build; after the planned phases, offer a short proposal of gaps (for example timelines, calendar, family trees, boards/canvases) for approval.
5. **Load balancing:** not in `PLAN.md` and not application code. The app is stateless (signed cookie sessions, state in Postgres) so it already runs behind any balancer or on a serverless host; layout cache is per instance and content-keyed, so it is correct with several instances. If the user wants a real deliverable (multi-replica Docker/compose with a reverse proxy), scope it as an added phase.

---

## 6. Decisions and deviations already made (all recorded in the tracker; summary)

- `PLAN.md` decisions: Q1 licence-safe sources only; Q2 new `fauna` kind; Q3 link specimens to places and author new places; Q4 tables become entries (`table`); Q5 scale +40 ores/+60 flora/+60 fauna/+100 places/+24 tables; Q6 shadcn + Motion first; Q7 all four vvd features; Q10 no real-time collaboration/custom domains; Q11 table = Markdown table in body + `fields.dice`; Q12 `WIP Map.png` is the first map; Q13 keep dark/light tone, refresh visually.
- Table results in the roller are plain text, so `[[links]]` for tables live in each table's intro prose.
- Templates put secrets in **DM notes**, not the body (a template can never publish a secret).
- Local graph on entry pages is hidden from assistive tech (`aria-hidden`, `tabindex=-1`): it duplicated link names and double-announced; the reference and linked-mention lists carry every link.
- "Pinned" entries (in the 8a heading, not in its acceptance list) were not built.
- The optional Open5e importer from Phase 4 was not built.
- `entries.readable()`/`liveOnly()` are now exported from `src/lib/entries.ts` for the map queries.
- Map image is behind the sign-in gate (the auth proxy covers `/maps/*`).
- A one-off unreproduced failure in `search-safety.spec.ts` (during a run when app code was being edited) was investigated: 22 realistic repeats and 40 gibberish probes found no leak; recorded in the Phase 7 tracker entry.

## 7. Scope/efficiency notes for the final report

- "Efficient and not lag the server": done for the graph (section 2). Other server hot spots worth a look if the user wants more: `getGraphData` reads up to 5,000 entries and 20,000 links per request (fine now, ~1,000 entries); `quickFind`/search are indexed; embeddings are generated offline.
- Final report must state: totals from the last full run, bugs found with root cause and fix (see tracker), remaining risks (hydration-timing-sensitive tests, graph frame-time test on the boundary, the unreproduced search-safety one-off, GM Binder content, prod DB unbuilt, nothing deployed).

## 8. Suggested order for the next session

1. `docker start asetheria-test-pg`; `git status`; read this file, `PLAN.md` Phase 8d and 0, `IMPLEMENTATION_TRACKER.md` tail.
2. Finish 8c: tsc, full suite, build, audit, design gates, tracker section, commit. (Do not commit the user's pre-existing files.)
3. Build 8d (section 2 design), full suite, commit.
4. Phase 0 build of the Neon database (section 3), step by step with read-only checks between steps; report; ask the user to rotate the password.
5. Steps 2 to 4: `test-cases.html`, mirrored Playwright specs, run, `TEST-REPORT.md`, final tracker, chat summary.
6. Push `hardening-and-content` and merge to `main` (approved, see 4b). Then give the user the Vercel env-var list and the commit to deploy, and ask them to run `/api/health` after deploying. Mention the LegendKeeper/World Anvil and load-balancing proposals; rotate the Neon password.
