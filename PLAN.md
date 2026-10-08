# PLAN.md (v2): Natural-World Codex, shadcn/Motion Migration, vvd-style World Features

Status: **v2.1. Approved and in implementation. v2.1 adds the landing page and character creator (Q14, Phases 9 to 11).**
Repo root: `E:\Github\Asetheria\Asetheria-Web` (git root). Branch audited: `hardening-and-content` @ `911f882` (unpushed).
Previous plans: `docs/PLAN-archive-rbac-2026-09.md` (RBAC/RAG, executed).

## 0. Decisions received (binding for this plan)

| Q | Your answer | How I read it |
|---|---|---|
| Q1 sources | "Do A" | **Licence-safe only**: SRD 5.1/5.2 (CC BY), Open5e CC/OGL docs, public-domain real-world grounding, original writing. **No** Wikidot / Reddit / GM Binder scraping. |
| Q2 fauna | "A" | New **`fauna` kind**, separate from `creature` (Bestiary). |
| Q3 "locations" | "locations/places or structure or the places inside Asetheria" | Both: (i) every specimen gets a real `[[link]]` "Found in", AND (ii) new **places and structures** inside Asetheria are authored (buildings, ruins, mines, groves, landmarks inside settlements and wilds). |
| Q4 tables as entries | "Yes" | Roll tables become a **`table` entry kind** (graph, search, RBAC, revisions, backlinks). |
| Q5 scale | "Yes" (not an answer to 50/150/300+) | **Still open.** I propose defaults in §6 so work isn't blocked. |
| Q6 design | "do shad and motion" | **shadcn/ui + Motion migration happens, and happens BEFORE new UI is built** so nothing is written twice. |
| Q7 vvd | "ALL" | All four: map pins, world graph, card/page layout, campaign planner. Real-time collaboration and custom domains are vvd features I am treating as **not** included (confirm in Q10). |
| Q8 prod | "I'll supply prod access" | Neon `DATABASE_URL` provided by you at execution time. I never run against Neon without it and never run the test suite on it. |
| Q9 location | "yes" | `PLAN.md` at the git root. Old plan stays archived. |
| Q5 scale | "Do what you recommend" | **Closed.** Targets in §6 are the contract: +40 ores, +60 flora, +60 fauna, +100 places/structures, +24 tables. |
| Q10 vvd boundary | "Yes" | **Closed.** Real-time collaboration and custom domains are excluded. |
| Q11 table format | "Do what you recommend" | **Closed.** Markdown table in `body` + `fields.dice`. |
| Q12 map | "Do what you recommend" | **Closed.** `WIP Map.png` is the first map; normalised pin coordinates allow replacement. |
| Q14 landing page + character creator (2026-10-09) | Pasted request plus the Asetheria house rules | **Added to the plan as ENH-08 / ENH-09, Phases 9 to 11**, built after Phase 8d. Seven working assumptions are listed at the end of the "Added scope" section and can be corrected at any time. |
| Q13 visual | "keep the dark and light tone but give it a visual refresh" | **Closed. Overrides the plan's "no re-brand" default.** Keep the dark and light *tonal identity* (obsidian/ash dark, warm light) but refresh typography, spacing, surfaces, elevation, motion and component polish. Phase 2a's "pixel-tolerance diff" criterion is replaced by the refresh criteria in Phase 2a. |

*Interpretation note: you answered five questions (Q5, Q10, Q11, Q12, Q13) with three lines. I mapped "Do what you recommend" to Q5/Q11/Q12 (the ones that carried a recommendation), "Yes" to Q10, and the refresh line to Q13.*

*Phase 0 (prod catch-up) needs the Neon `DATABASE_URL`, which has not been supplied yet. All code phases run against the local disposable Postgres; each prod rollout waits for that credential.*

### Traceability: every item in your original finding

| Your ask | Where it lands |
|---|---|
| Scan ores and fauna on wikidot / reddit / gmbinder | **ENH-01**, Phase 4. Re-scoped: those three sites are not licensed for reuse; replaced by licence-safe sources (see §2). |
| Integrate them | Phase 4 |
| Populate entries: locations | ENH-03 (links, Phase 5) + ENH-03b (new places/structures, Phase 5) |
| Populate entries: descriptions | Phase 4 + Phase 5 |
| Populate entries: tables for everything | ENH-04, Phase 6 (+ data table view, Phase 7) |
| List enhancements: player side and DM side | §5 (now partly committed: Phase 8) |
| What can be improved / enhanced / added in future | §5 |
| Landing page with motion scenes; character creator following the 5e sheet, from the Asetheria homebrew rules, with Wikidot links and a player tab (2026-10-09) | ENH-08 and ENH-09, Phases 9, 10 and 11 |
| Polished site, inspired by vvdworldbuilding | Phase 2 (design system) + Phase 8 (map pins, graph, cards, planner) |

---

## 1. Executive Summary

1. **Content:** ores, flora and fauna are expanded from licence-safe sources and original Asetheria writing. A new `fauna` kind is added. Every specimen is linked to the real places it is found, and new places and structures inside Asetheria are written so those links have somewhere to go.
2. **Tables:** roll tables stop being a separate DM-only tool and become `table` entries, so they appear in search, the graph, backlinks and RBAC like everything else.
3. **Design:** the hand-rolled CSS UI (233 `className` uses, 484-line `globals.css`, 11 components) is migrated to shadcn/ui + design tokens + Motion + skeleton loading, *before* any new screens are built. This is the largest phase and is split into independently shippable slices.
4. **vvd-style features:** interactive map with pins, richer world graph, card/infobox page layout with per-kind templates, and a campaign/session planner. These need new tables (`maps`, `map_pins`) and are RBAC-scoped like entries.
5. **One schema change up front:** the irreversible Postgres enum additions (`fauna`, `table`) ship together in a single migration (Phase 1) so we only pay that cost once.
6. **Biggest risks:** the design migration blast radius, map-pin and field-link information leaks to players, content-quality at scale, and prod Neon already being behind local.

---

## 2. Findings Analysis

### Baseline (verified, with citations)
- Kinds = Postgres enum `src/db/schema.ts:31-50` + taxonomy `src/lib/kinds.ts`.
- `ore` fields incl. a free-text `location` (`kinds.ts:194-208`); `flora` has no habitat/location (`kinds.ts:211-222`); `creature` = cr/type/habitat/statblock (`kinds.ts:165-177`).
- The 8 existing fauna entries are `kind=flora` (`scripts/add-flora-fauna-ores.ts:77`).
- `fields` are scanned for `[[links]]` (`src/lib/link-graph.ts:29`).
- Roll tables: separate `roll_tables` table (`schema.ts:261-284`), DM manager in `src/app/(app)/tools/tables/*` (`table-manager.tsx` 470 lines).
- Kind browse = card grid, no sortable table (`codex/[kindSlug]/kind-filter.tsx`).
- Existing content: 9 seed + 8 original ores; 18 metals; 24 planar metals; 8 flora + 20 herbalism flora; 8 fauna; SRD creatures (CC BY); 12 named creatures; 118 city-pack places; one herbalism d20 table.
- Design today: Tailwind v4 already installed (`@import "tailwindcss"`, `@theme` in `globals.css:1-6`), dark mode via `data-theme` custom variant (`globals.css:3-4`), no `components.json`, no shadcn, no `motion`, only `src/components/skeleton.tsx` as a loading primitive. Tests lean on roles (`getByRole("button", {name})`), 8 CSS-class locators total (`.prose-codex`, ids like `#body`, `#username`), so a markup migration is **lower risk to the suite than feared**, but ids/classes above must be preserved.
- Map assets in repo: `WIP Map.png` (2250x1200, labelled WIP), `docs/maps/asetheria-labels.svg`, `Aetheria.jpg` (2048x1536), `The Port City of Helarchon.jpg` (2400x3106).
- Prod (Neon) is behind local; steps in `SESSION-HANDOFF.md` §3.

### ENH-01: Source integration (re-scoped per Q1)
- **Root cause of the original ask:** the three named sites are not open-licensed for reuse. Replaced by:
  - SRD 5.1 / 5.2 (CC BY 4.0), diffed against what `import-srd-monsters.ts` already imported.
  - Open5e documents whose licence field is CC-BY or OGL (per-document opt-in, OGL Section 15 note).
  - Public-domain grounding: Pliny, Dioscorides, medieval herbals, USGS mineral data, Linnaean taxa.
  - Original Asetheria writing grounded in those facts (existing pattern).
- Files: new `scripts/import-open5e-docs.ts`, `data/natural-world/{ores,flora,fauna}.json`, extend `scripts/add-srd-attribution-note.ts`, `docs/content-review.md` (licence ledger).
- Risk Med (legal if mishandled, otherwise low). Effort M. Depends on ENH-02.

### ENH-02: `fauna` kind (Q2=A) and `table` kind (Q4=yes), one migration
- Root cause: `flora` is one enum value for plants and animals; roll tables are outside the entry model.
- Files: `schema.ts`, `kinds.ts`, `rbac.ts`, `validation.ts`, `app-shell.tsx`, home `page.tsx`, `[kindSlug]/*`, `import-codex-file.ts:68`, `add-flora-fauna-ores.ts`, `tools/tables/*`, `src/lib/dice.ts`, drizzle migration, `scripts/sql/setup.sql`, `tests/rbac*.spec.ts`, `tests/roll-tables.spec.ts`, `tests/homebrew-content.spec.ts`.
- Risk Med. Effort M. Foundation for ENH-03/04/05.
- **Table representation (recommended):** `kind=table`, `fields.dice` ("1d20"), roll rows as a Markdown table in `body` (`| 1-3 | result |`). The roller parses the body. This makes tables human-editable in the existing editor and searchable. The old `roll_tables` rows are migrated into entries; the old table is left read-only and dropped only in a later, separate release.

### ENH-03: Specimen → place linkage + new places/structures (Q3)
- Root cause: no structured specimen→location data; few places exist below settlement level for wilds, mines, groves and ruins to attach to.
- Mechanism: `foundIn` field written as `[[Location]]` creates graph edges today. New places/structures are Location entries under the right parent (`parentId`), following the city-pack pattern (`data/city-locations.json`).
- Risk Med (secret-location leak via field links; R5). Effort L. Depends on ENH-02, Phase 2.

### ENH-04: Tables for everything
- Authored `table` entries: forage × biome, mining strike × ore tier, wildlife encounter × biome, harvest quality, "what's in this building" for new structures.
- Risk Low. Effort M. Depends on ENH-02, ENH-03.

### ENH-05: Table/database view per kind
- Root cause: card grid cannot sort/filter by cost, CR, rarity, biome. Needs sortable columns driven by `KINDS[].fields`.
- Risk Med (jsonb sort safety). Effort M. Depends on ENH-03 and Phase 2.

### ENH-06: Design-system migration (Q6)
- Root cause: root `CLAUDE.md` mandates shadcn/ui, tokens, Motion, skeletons, empty/error states; the app is hand-rolled.
- Shared with: every UI phase. This is the reason Phase 2 precedes Phases 3 to 8 UI work.
- Compatibility unknowns to settle in a spike before commitment: shadcn CLI with Tailwind v4 + React 19 + Next 16 (project `AGENTS.md` warns this Next has breaking changes: read `node_modules/next/dist/docs/` first), `next-themes` with the existing `data-theme` attribute, Motion's `motion` package under React 19.
- Risk High (breadth). Effort XL. Split into 5 shippable slices.

### ENH-07: vvd-style world features (Q7=ALL)
- **Map pins** — new tables `maps` (image, name, width/height, visibility) and `map_pins` (mapId, entryId, x/y normalized 0–1, label, visibility). RBAC: a player sees a pin only if they can read its entry. DM places pins by click.
- **World graph** — exists (`graph-view.tsx`, 286 lines). Add filters (kind, region, tag), cluster by parent, and the local 1–2 hop graph on entry pages.
- **Card/page layout** — infobox/hero card from `fields`, per-kind templates for new entries, recently viewed + pinned.
- **Campaign planner** — uses `session` kind. "Start session" command; prep checklist; encounter builder that draws on Bestiary + `table` entries; "reveal after session" bulk grant.
- Risk Med–High. Effort XL. Depends on Phase 2 and Phases 3 to 6 (data to show).

---

## 3. Phased Implementation Plan

**Sequencing rationale.** (1) Prod catch-up, so every later phase ships onto a known base. (2) The single enum migration, because it is irreversible and everything depends on it. (3) The design system, because every UI phase after it would otherwise be rewritten. (4) Content in dependency order: specimens → places and links → tables. (5) Database view needs the new fields. (6) vvd features last: they present everything built before. **Each phase carries its own prod rollout steps; there is no big-bang release.**

### Phase 0: Prod catch-up (no new code)
- Run `SESSION-HANDOFF.md` §3 against Neon (you supply `DATABASE_URL`). Take an `/api/export` backup first.
- Acceptance:
  1. A backup JSON exists and is non-empty before any write.
  2. After the steps, `GET /api/health` on prod returns 200.
  3. `npm run check:links` against prod reports no unresolved links beyond its recorded baseline.
  4. Prod `/codex/npcs` includes "Elira" exactly once.
- Rollback: restore from the backup; steps are idempotent and add-only.

### Phase 1: Enum migration: `fauna` + `table` (ENH-02, backend only)
- Files: drizzle migration, `schema.ts`, `kinds.ts` (minimal KindDefs, unstyled), `rbac.ts`, `validation.ts`, `import-codex-file.ts`, `scripts/migrate-fauna-and-tables.ts`.
- Approach: `ALTER TYPE entry_kind ADD VALUE 'fauna'` and `'table'` (committed outside the data transaction). Script retags the 8 fauna entries by an explicit name list; migrates each `roll_tables` row into a `table` entry (dice → `fields.dice`, items → Markdown table in `body`, same slug, same visibility); keeps `roll_tables` read-only.
- Rollback: data via reverse mapping script. Enum values stay, unused (Postgres cannot drop them).
- Acceptance:
  1. `/codex/fauna` returns 200 and lists the same 8 animals with unchanged slugs.
  2. Every old roll-table slug has a `table` entry with identical dice and item count (script asserts equality, exit code non-zero otherwise).
  3. `/codex/flora-fauna` still resolves.
  4. An ungranted player sees an empty `/codex/fauna` and `/codex/tables` (HTTP 200, zero entries, the same behaviour every existing kind has; the sections are navigation, not content), gets 404 on any individual fauna/table entry URL, and finds none in the palette feed; after a kind grant sees public only; secret never. *(Corrected during implementation: the original wording said 404 on the section pages, which contradicted the app's existing design for every kind.)*
  5. `npm run check:links` (new DB-backed checker; `verify:links` is only a seed-file dry run) reports no unresolved `[[links]]` beyond the 2 that already existed before Phase 1 (baseline recorded in the tracker); `tsc --noEmit` and `next build` pass.
  6. Running the migration script twice changes 0 rows the second time.
- Tests: extend `rbac.spec.ts`, `rbac-inheritance.spec.ts`, `roll-tables.spec.ts`; new `kind-migration.spec.ts`.
- Rollout: apply migration, then script, then `embeddings:generate`.

### Phase 2: Design system migration (ENH-06), five shippable slices
**2a. Spike + foundation (no page visibly changes)**
- `components.json`, `cn()`, token layer mapping the *existing* palette (Obsidian/ash dark, current light) to shadcn CSS variables, `next-themes` configured with `attribute="data-theme"`, `motion` presets in `src/lib/motion.ts`, `loading.tsx`/`error.tsx` scaffolds.
- Visual refresh (Q13): keep the dark (obsidian/ash) and light (warm parchment) tonal identity; refresh the type scale and font pairing, spacing scale (4/8/12/16/24/32/48/64), surface/elevation layers, border and focus-ring treatment, and motion defaults. The token file is `src/app/globals.css`, with the refreshed values documented in `docs/design-tokens.md`.
- Acceptance: 1. dark/light toggle still works and persists across reload with no flash of the wrong theme (tested on a hard reload); 2. both themes meet 4.5:1 text contrast for body, muted and primary-on-background pairs, measured by script on the token values and recorded in `docs/design-tokens.md`; 3. `next build` and the full suite pass; 4. the spike notes in `docs/design-migration.md` record the exact shadcn + Tailwind v4 + React 19 + Next 16 commands that worked; 5. before/after screenshots of 5 key pages at 375/768/1280px in both themes are saved to `test-results/design/` for your review.
- **Go/no-go gate:** if the spike fails, stop and report; do not proceed to 2b.

**2b. Shell + auth pages** (`app-shell`, `theme-toggle`, `login`, `register`, `welcome`, `onboarding`)
- Acceptance: login button and fields keep `#username`, `#password`, `#door-error` and accessible names ("Enter", "Enter as a player", "Enter the codex"); keyboard-only login works; 375/768/1280px screenshots captured.

**2c. Codex pages** (`entry-card`, kind browse, entry page, empty/error/loading states)
- Acceptance: the codex has a friendly error boundary with a working retry (`(app)/error.tsx`, root `error.tsx`) and a friendly not-found page that is still a real HTTP 404; slow data streams behind Skeleton placeholders shaped like the content (section lists and the front page, inside `<Suspense>` after every `notFound()`/`redirect()` guard); an empty section shows icon + title + hint (+ CTA for the DM), never plain text; `.prose-codex` and `#sec-*` anchors preserved. *(Corrected during implementation: the original wording required a route-level `loading.tsx` on every codex route. Verified in this repo that a `loading.tsx` on `/codex/[kindSlug]` makes `/codex/<unknown>` answer HTTP 200 instead of 404, which breaks the access rules and tests, so skeletons live in Suspense boundaries instead; see `docs/design-migration.md`.)*

**2d. Editor, command palette, graph, shortcuts** (`entry-form`, `markdown-editor`, `command-palette`, `graph-view`, `keyboard-shortcuts`)
- Acceptance: all `knowledge-features.spec.ts` assertions pass unchanged (chords, `?` sheet, `[[` autocomplete, draft recovery, preview).

**2e. Tools + admin + sweep** (`tools/*`, `admin/*`, `rbac-panel`, final gates)
- Acceptance: a repo grep gate finds 0 hardcoded colours (`bg-white`, `text-gray-*`, `bg-blue-*`), 0 `@keyframes`, 0 inline `style=` outside map/graph canvases, 0 plain `<button>`/`<input>` outside `components/ui`; axe scan shows 0 serious/critical issues on the 6 key routes; `prefers-reduced-motion` disables Motion transitions (tested).
- Each slice: independently shippable behind the same URL; full Playwright suite plus screenshot review at 375/768/1280.
- Rollback per slice: revert the slice commit (no data changes).

### Phase 3: `fauna` and `table` UI + field model (ENH-02 UI)
- Using the new components: fauna KindDef fields `scientificName, habitat, diet, behavior, harvest, foundIn, biome, rarity`; ore/flora gain `foundIn, biome, rarity`; `table` kind page with dice, rendered table, and a Roll button (replaces `tools/tables`, which redirects).
- Acceptance:
  1. A DM can create a fauna entry with all fields and see it at `/codex/fauna`.
  2. Opening any `table` entry shows a rendered table and a Roll button; 100 rolls of a "1d20" table always return a row whose range contains the roll.
  3. `/tools/tables` redirects to `/codex/tables` (302/308).
  4. A table with overlapping or gapped ranges shows an inline editor error and cannot be saved.
  5. Palette search for "forage" finds table entries for the DM; a player without a grant sees none.
- Tests: `fauna-kind.spec.ts`, `table-entries.spec.ts`; update `roll-tables.spec.ts`.

### Phase 4: Licence-safe ingestion + original specimens (ENH-01)
- Create `data/natural-world/*.json`; optional `import-open5e-docs.ts`; licence ledger; every imported entry carries `license`, `source`, an attribution line and a link to the attribution note.
- Approach: dry-run default; collision skip by name+kind; `--apply`; batch tag `import:<batch>`.
- Acceptance:
  1. Dry run prints per-source, per-licence counts; 0 entries missing `license`.
  2. A second `--apply` creates 0 duplicates.
  3. Every third-party entry body contains its attribution line and a working link to the licence note.
  4. A denylist test fails the build if any imported text contains a Wikidot, Reddit or GM Binder URL or marker.
  5. A batch can be archived with one command by tag, verified in a test.
- Tests: `natural-world-import.spec.ts`.
- Rollout: apply with `--fill-empty`, then `rebuild-links`, then `embeddings:generate`.

### Phase 5: Places, structures, specimen linkage (ENH-03)
- New Location entries (mines, groves, ruins, shrines, towers, inns, markets, wild landmarks) placed under correct `parentId`; every ore/flora/fauna entry gets `foundIn`.
- Gate before writing content: **R5 verification**. A failing test first proves whether field links can leak secret locations to players; fix in `getWikiLinkResolver` / the field renderer before backfilling.
- Acceptance:
  1. Every ore/flora/fauna entry has a non-empty `foundIn`; `verify:links` = 0 broken.
  2. A Location page's backlinks list the specimens found there.
  3. For a player, a `foundIn` pointing at a secret or ungranted location renders as plain text with no link and no tooltip.
  4. Every new place has a parent; no orphan locations are added (query assertion).
  5. Zero existing non-empty descriptions changed (`--fill-empty` diff shows additions only).
  6. Graph edge count rises by at least the number of `foundIn` links.
- Tests: `natural-world-links.spec.ts`; extend `search-safety.spec.ts`.

### Phase 6: Authored `table` entries (ENH-04)
- About 12 to 30 tables (see §6 scale), each linking to the specimens and places it references.
- Acceptance: 1. a script asserts every table covers its full dice span with no gap or overlap; 2. a table's backlinks show the places that cite it; 3. secret tables never appear for players; 4. re-import creates 0 duplicates.

### Phase 7: Database view per kind (ENH-05)
- `?view=table&sort=<key>&dir=`, whitelisted keys from `KINDS`, numeric-aware parse of values like "5,000 gp"; column picker.
- Acceptance: 1. `/codex/ores?view=table&sort=costPerLb` orders 5 gp before 5,000 gp; 2. unknown sort key ignored, no 500; 3. players never get DM-only columns or secret rows (tested); 4. usable at 375px with no horizontal page scroll.

### Phase 8: vvd-style world features (ENH-07), four slices
**8a. Entry page card layout, per-kind templates, local graph, recently viewed/pinned**
- Acceptance: 1. an NPC page shows a hero card with portrait slot and infobox from `fields`; 2. "New NPC" prefills Appearance/Motivation/Secrets headings; 3. local graph shows only entries the viewer may read (tested with a player); 4. last 8 viewed entries appear as the palette's empty state.

**8b. Interactive map with pins**
- New tables `maps`, `map_pins` (migration + rollback `DROP TABLE`). Map image stored under `public/maps/`. Normalised coordinates, so pins survive image resize.
- Acceptance: 1. DM clicks the map, picks an entry, a pin saves at the clicked position (±1% of image width, tested); 2. a player sees only pins whose entry they can read; hidden-entry pins are not in the HTML, JSON or network response (network assertion); 3. clicking a pin opens a preview card and "Open page"; 4. pan and zoom work by touch and keyboard (+/-/arrows); 5. deleting an entry removes its pins.

**8c. World graph upgrades**
- Filters (kind, region, tag), parent clustering, keyboard navigation.
- Acceptance: 1. filtering to kind=ore shows only ore nodes and their direct neighbours; 2. graph renders 600+ nodes at ≥ 30 fps on a mid laptop profile (measured, number recorded); 3. keyboard-only user can focus a node and open its page.

**8d. Campaign planner**
- "Start session" command creates a session entry with date and number; prep checklist; encounter builder that pulls Bestiary and `table` entries; "reveal after session" bulk grant of chosen entries to chosen players.
- Acceptance: 1. the command creates the entry and navigates to it; 2. rolling the builder yields only creatures the DM can read; 3. bulk reveal creates grants for exactly the selected player/entry pairs and nothing else (DB assertion); 4. a player sees revealed entries immediately and the "what's new" list includes them.

### Added scope, request of 2026-10-09 (Q14): landing page + character creator

Your words, kept as the contract: *a character-creation feature, on the landing page before anyone logs in as DM or player; fields and inputs taken from the Asetheria Homebrew compendium; systematic and easy; hyperlinks to the site explaining parts of it, connected to Wikidot; detailed but simple, following the D&D 5e character sheet; it asks the player questions; connected to the player login with a tab to click; and a landing page for Asetheria before the login and character creation, with motion graphics on the theme of Asetheria, D&D and fantasy, with scenes in the spirit of LOTR, The Hobbit, Percy Jackson and more fantastical types.*

#### ENH-08: Public landing page with motion scenes

- **Today:** a signed-out visitor is redirected by `src/proxy.ts` to `/welcome`, a "door" page (party password for players, DM login). Signed-in users are bounced off it.
- **Change:** `/welcome` becomes the landing page; the existing door (same component, same labels and roles, so the auth tests keep passing unmodified) is its last section. Two calls to action: **Enter the codex** (scrolls to / opens the door) and **Forge a hero** (links to `/create-character`, public).
- **Scenes (original artwork only, drawn as inline SVG and animated with Motion; no video, no photographs):**
  1. *The road at dawn*: layered misty peaks in parallax, drifting mist, a lone winding road, birds.
  2. *The round-door hillside*: a green hill home with warm windows, chimney smoke, fireflies (the cosy-adventure mood).
  3. *The sea-gate*: a harbour of white columns and a lighthouse, rolling waves, a constellation (the mythic Greek mood).
  4. *The three empires*: banners of Imperium Invicta, Hellenoria and Acheaoria, each with a one-line hook taken from the codex's own text.
  5. *The map unrolls*: the continent map reveals with a dotted route; then the call to adventure.
  Motion: scroll-linked reveals and parallax, pointer parallax on desktop, floating particles. All motion is transform and opacity only.
- **Not borrowed:** no names, logos, characters, quotations or artwork from The Lord of the Rings, The Hobbit, Percy Jackson or any other work. The brief asks for the *mood*; the art and copy are original (risk R19).
- **Rules from `CLAUDE.md` that apply:** design tokens only (SVG fills use token classes, no hex), Motion not `@keyframes`, no inline style objects, semantic HTML, WCAG 2.2 AA, `prefers-reduced-motion` respected.

**Acceptance (Phase 9)**
1. A signed-out visitor to `/` or `/welcome` sees the landing page: one `h1`, at least five scenes, and both calls to action. A signed-in user is still redirected away (existing behaviour).
2. "Forge a hero" opens `/create-character` without signing in (HTTP 200, no redirect).
3. "Enter the codex" reaches the existing door; **every existing auth spec passes unmodified**.
4. With `prefers-reduced-motion: reduce`: no scene animation runs (asserted through the Web Animations API and Motion state), no parallax, and all text and calls to action are still present.
5. axe finds no serious or critical violation in both themes; 375, 768 and 1280 px have no horizontal scroll; keyboard-only can reach both calls to action; all decorative art is `aria-hidden`.
6. Performance budget, measured and recorded: added JavaScript at most 60 KB gzipped beyond what the app already ships, total inline art at most 150 KB, cumulative layout shift under 0.05, and 90% of frames within 33 ms while scrolling under a 4x CPU throttle. Animations pause when off-screen.
7. Licence guard: a test fails the build if the page text, alt text or asset names contain a protected title or character name from a denylist (for example Tolkien, Hobbit, Middle-earth, Percy Jackson, Olympus camp names), and `docs/content-licences.md` gets a "landing page art: original" row.
8. Public means public: the page makes no database read and ships no codex entry text beyond constants written for it (risk R20; asserted by reading the HTML).

#### ENH-09: Character creator (D&D 5e sheet, Asetheria house rules)

**The rules, from the Asetheria Homebrew compendium** (your paste, with the duplicated sections merged). They live in one constants module (`src/lib/character/house-rules.ts`) so the engine, the UI text and the tests share a single source:

| Topic | Rule as given |
|---|---|
| Ability scores, three methods | **Point buy**: budget is 27 + 2 + 1d4 points; before bonuses each score is at most 15 and at least 6. **Roll**: 4d6, drop the lowest, six times, once per stat; the six must total at least 72; below 72 you reroll all six; at 72 or more you either keep them or reroll once more and **must keep the new rolls** even if they are lower. **Standard array**: one of 15/14/13/12/10/8, 16/13/13/12/10/7, 17/13/12/11/10/7. |
| Hit points | When rolling, maximise hit dice for levels 1 to 3, then roll normally. At each level you roll, a 1 may be rerolled once and the new roll must be used. |
| Citizenship | Pick Imperium Invicta, Hellenoria or Acheaoria, or none; each carries benefits and weaknesses. |
| Worship | Follow one of the gods or stay unaffiliated; the tie is personal, no binding obligations. |
| Combat house rules (shown for reference on the sheet) | Flanking gives advantage on melee attacks; a critical hit maxes one set of damage dice then rolls normally; a natural 20 on a half-damage saving throw takes no damage; death saves are whispered to the DM and the player keeps character-welfare talk minimal; party members may swap initiative places once each, before combat, with nobody between them. |

**The wizard** asks one question group at a time, with a progress bar and a Back button, in this order, and saves a draft after every answer:
1. Who is this? (character name, player name, one-line concept)
2. Heritage (SRD races, or "other" in your own words)
3. Class and starting level (SRD classes; level 1 to 20)
4. Background (names with a free feature box; the SRD only ships one background)
5. Ability scores: choose **Point buy / Roll / Standard array**, then the method's own screen enforces the house rules (live budget, 6 to 15 limits, the 72 total, the single optional reroll, each array value used once); racial bonuses apply afterwards
6. Skills and proficiencies (the class's number of choices, validated)
7. Hit points (the house rules above: an automatic roller that applies "max for levels 1 to 3" and the reroll-a-1 rule, or manual entry)
8. Equipment and starting gold (simple list)
9. Citizenship (the three empires or none, with each one's benefits and weaknesses)
10. Worship (a god or unaffiliated)
11. Personality (traits, ideals, bonds, flaws, appearance, backstory)
12. Review: a full 5e-style character sheet (name block; six abilities with modifiers; proficiency bonus; saving throws; eighteen skills; passive Perception; AC, initiative, speed; hit points and hit dice; attacks; features; spellcasting block for casters with ability, save DC, attack bonus and slots; equipment; personality; proficiencies; the house-rules card). Actions: print or save as PDF (print stylesheet), download as JSON, and for signed-in players save to their account.

**Links to explain things (Wikidot):** every step has "Learn more" links that open `dnd5e.wikidot.com` in a new tab (`rel="noopener noreferrer"`). These are **links only**; nothing is copied or scraped from Wikidot (decision Q1 stands). Where the codex has its own page (the three empires, deities) the link goes to the codex page instead. The URLs live in one table (`src/lib/character/links.ts`); a test asserts each is `https`, the host is exactly `dnd5e.wikidot.com`, and the path matches an allowlist.

**Where the options come from:** SRD 5.1 (CC BY 4.0, already attributed in the app) for races, classes, skills and tables; names of non-SRD backgrounds are listed as plain names with a Wikidot link and no description text.

**Public versus member (important design decision, risk R20):** the public route cannot read the codex. Its citizenship list is three constants; "worship" is free text plus a short curated list of names I will ask you to supply. Signed-in players get the same wizard inside the app, where citizenship and worship are dropdowns built from the entries *that player may read* (the normal access rules), plus free text.

**Saved characters.** Anonymous visitors: the draft lives in the browser (localStorage), and they can print or download. Signed-in players: a new table `characters` (id, user id with cascade delete, name, `data` jsonb with a `schemaVersion`, timestamps, soft delete). Server-side the character is **re-validated and its derived numbers recomputed**: an illegal point-buy spend, a reused array value, a roll set under 72 that was not rerolled, or an impossible score is rejected, and the dice rolls are stored with the sheet so the DM can see how it was made. A player sees only their own characters; the DM sees all (read-only). Limits: 20 characters per player, 64 KB per character.

**Tab:** the sidebar gains **Characters** (players: "My characters" and "New character"; DM: a read-only list of everyone's). Same wizard component, `mode: "public" | "member"`.

**Acceptance (Phase 10: engine, rules, storage)**
1. Pure unit tests (run in the Playwright runner like the existing `dice` and `roll-table` tests) cover: ability modifier for scores 1 to 30; proficiency bonus for levels 1 to 20; point-buy budget (27 + 2 + d4 gives 30 to 33) with the 6 and 15 boundaries and every illegal spend rejected; rolling (4d6 drop lowest over 5,000 trials stays in 3 to 18 with the right mean; total of 72 accepted, 71 forces a reroll; after the one optional reroll the new rolls are binding even below 72); each standard array is accepted once per value and rejects reuse; hit points (levels 1 to 3 are maximum, a rolled 1 at level 4 or higher is rerolled once and the second result stands even if 1); spell-slot tables; AC, initiative, saves, skills and passive Perception on fixed fixtures.
2. The `characters` migration is idempotent and has a rollback script that drops only that table (verified inside a rolled-back transaction, like the map tables).
3. API: players create, read, update and delete only their own (403 on someone else's, 401 signed out); the DM can read all and write none; a tampered payload (illegal stats, wrong derived numbers, oversized, wrong schema version, unknown fields) is rejected with 400 and nothing is stored; the stored derived numbers always equal the server's recomputation.
4. Concurrency and limits: the 21st character is refused; two saves of the same character resolve to the latest, never a mix.

**Acceptance (Phase 11: wizard, sheet, tab)**
1. The public wizard runs end to end without signing in, for each of the three ability methods, and produces a sheet whose numbers match the engine; invalid input at every step shows a friendly message and blocks Next.
2. Back and refresh lose nothing (draft restored); clearing storage starts clean; corrupt stored data is ignored, not crashing.
3. Every step has at least one working "Learn more" link, all pointing at `dnd5e.wikidot.com` (or a codex page), opening in a new tab with `noopener noreferrer`.
4. Signed-in players see the Characters tab, the dropdowns contain only entries they may read (a secret deity is not in the list or the HTML), and Save stores a character they can reopen and edit; the DM sees it in the DM list; another player cannot open it.
5. The public route's HTML and network traffic contain no codex entry data (risk R20).
6. Print stylesheet produces a clean one-page sheet; JSON download re-imports.
7. axe clean in both themes at 375, 768 and 1280 px; fully keyboard operable; reduced motion respected.

#### New phases (after Phase 8d; Phase 0 then also rolls out `characters.sql`)

| Phase | Slice | Depends on |
|---|---|---|
| **9** | Landing page and motion scenes (ENH-08) | Phase 2 |
| **10** | Character engine, house rules, `characters` table and API (ENH-09 part 1) | Phase 9 not required; needs 8d done |
| **11** | Character wizard, 5e sheet, Wikidot links, public route, Characters tab (ENH-09 part 2) | Phases 9 and 10 |

**Assumptions I am proceeding on unless you correct them (Q14).** (a) The citizenship "benefits and weaknesses" table did not come through in the paste ("Untitled"); until you supply it I show each empire's own codex description and a clearly marked "benefits and weaknesses: to be supplied by the DM" slot that reads from a field on the empire entry, so it fills in the moment you add the text. (b) The "Stat Calculator" link was not included; I build the calculator in the app and add your external link if you send it. (c) Point-buy costs: the standard 5e table for 8 to 15 (0, 1, 2, 3, 4, 5, 7, 9) with 7 refunding 1 and 6 refunding 2; the extra 1d4 is rolled once when the character is started, stored with the draft, and not rerolled on refresh. (d) Class features appear as names with Wikidot links, not copied text. (e) Starting level 1 to 20; per-level hit points follow the house rule. (f) The DM can read every saved character. (g) "Connected to Wikidot" means outbound links only.

---

## 4. Risk Register

| # | Risk | Blast radius | Mitigation |
|---|---|---|---|
| R1 | Reuse of copyrighted text on a publicly reachable site | Legal | Q1=A; licence ledger; denylist test (Phase 4 criterion 4) |
| R2 | Wrong SRD/OGL attribution | Legal | Single note, per-entry link, per-document opt-in |
| R3 | Enum values cannot be dropped | Permanent schema | Both added once in Phase 1, intentionally |
| R4 | `roll_tables` → entries migration changes tables subtly (range parse errors) | Wrong rolls at the table | Script asserts equal dice and item count and a round-trip parse; old table kept read-only |
| R5 | **Field links leak secret locations** (body links are role-scoped; field rendering not verified) | DM secrets exposed | Failing test first; fix before Phase 5 content |
| R6 | **Map pins leak hidden entries** (coords, labels, ids) | DM secrets exposed | Filter in the query layer, never client-side; network assertion test |
| R7 | Design migration breaks flows or regresses accessibility | Whole UI | Five slices, go/no-go gate, per-slice screenshots and axe, role-based test selectors preserved |
| R8 | shadcn + Tailwind v4 + React 19 + Next 16 incompatibility | Plan viability | Spike in 2a with explicit gate |
| R9 | `next-themes` clashes with the existing `data-theme` switching | Flash of wrong theme | Configure `attribute="data-theme"`; test persistence and no-FOUC |
| R10 | Motion adds JS weight and hurts reduced-motion users | Perf and a11y | `prefers-reduced-motion` test; lazy-load; bundle size recorded before/after |
| R11 | Content quality at scale (generic or repetitive entries) | Site feels padded | Per-entry `basis` note; spot-review sample before apply; cap per batch |
| R12 | Bulk writes overwrite DM edits | Data loss | `--fill-empty` only; dry-run diff; export before apply |
| R13 | jsonb sort on `fields` slow or injectable | Perf/security | Whitelisted keys; no raw SQL |
| R14 | Prod Neon behind local, drift | Confusing failures | Phase 0 first; rollout per phase |
| R15 | Stale embeddings after imports | Semantic search misses new content | `embeddings:generate` in each rollout step |
| R16 | Tests tied to entry names/counts | CI red | Update in same phase; look up by name, not count |
| R17 | Map image is `WIP Map.png` (labelled work-in-progress, 2250x1200 raster) | Pins misplaced if the map changes | Normalised coords + per-map version; Q12 |
| R18 | Scope growth from "ALL" (4 vvd features) | Schedule | Each 8x slice approved/shipped separately; planner last |
| R19 | Landing art or copy borrows from The Lord of the Rings, The Hobbit, Percy Jackson or other works | Legal (trademark, copyright) | Original SVG art and copy only; mood not content; denylist test on text, alt text and asset names; ledger row |
| R20 | **The public (pre-login) creator leaks private codex data** (secret deities, entry text) | DM secrets exposed to anyone with the URL | Public routes read nothing from the database: options are constants; members get access-scoped dropdowns; test reads the public HTML and network traffic |
| R21 | Character data tampered with or illegal stats saved (point buy over budget, reused array value, rolls under 72 kept) | Unfair characters, trust | Server re-validates and recomputes everything; rolls stored with the sheet; rejection tests for each rule |
| R22 | Landing animation hurts performance or accessibility (motion sickness, low-end devices) | Perf and a11y | Transform/opacity only; off-screen pause; reduced-motion static mode; budgets measured under 4x throttle |
| R23 | Wikidot links rot or the host changes | Dead help links | Single link table, host and path allowlist test, optional link-check script; links only, nothing copied |
| R24 | The pasted house rules are ambiguous (6 and 7 in point buy, reroll-a-1 wording, "reroll once more" at 72+) | Wrong rules encoded | Encoded literally from one constants module, assumptions (a) to (g) listed, exact fixture tests; DM can correct the constants in one place |

---

## 5. Out of Scope

- Scraping Wikidot, Reddit, GM Binder (licensing, Q1).
- vvd real-time collaboration and custom-domain wikis (confirm Q10).
- DDB / Beneos / Tom Cartos / DMDave content.
- Block-based editor rewrite.
- Rewriting the 482 seed entries.
- Dropping `roll_tables` (a later release, after a stable period).
- Copying or scraping any text from Wikidot or the player's handbook (the creator links out only).
- A full spell, feature or equipment database inside the creator (names and links, not text).
- Leveling-up flows, multiclassing and a battle map for characters (the creator makes the sheet at creation).

**Adjacent problems found, flagged for decision (not expanded):**
1. Thessalonika/Aepistra tags contradict their write-ups.
2. Duplicate titles "The Truth — Notable/Triggers" per fallen kingdom.
3. 19 Foundry characters tagged `needs-writeup`.
4. City sub-places only visible once granted; the auto-visibility-for-children work was mid-flight at the end of the last session and I haven't verified it landed.
5. `npm run lint` is only `tsc --noEmit`; no ESLint, no unit-test runner beyond dice; the 70% coverage rule is unmet.
6. Branch `hardening-and-content` is unpushed.
7. Playwright's Postgres is a Docker container that stops between sessions.

**Future enhancements (not committed):**
- *Player:* offline PWA mode; private journal per entry; "discovered" silhouettes until revealed; printable handouts; "what's new" feed (partly in 8d).
- *DM:* inline property editing; searchable parent picker; revision diffs; tag hierarchy; slash commands; transclusion `![[Entry#Section]]`; data-quality dashboard; in-world calendar/timeline.
- *Foundations:* real ESLint + unit tests, CI running Playwright against a service Postgres.

---

## 6. Open Questions (remaining)

**Q5 (still open). Scale.** You answered "Yes", which doesn't pick a number. Unless you say otherwise I will plan these *targets* for Phases 4 to 6:
- Ores/materials: +40. Flora: +60. Fauna: +60 (non-combat ecology).
- New places and structures: +100 (wilds, mines, groves, ruins, landmarks).
- Authored `table` entries: +24.
- Per-entry quality bar: 3 to 6 sentences of ecology/use/place, a `foundIn` link, a `basis` note.
Tell me to raise or lower these.

**Q10. vvd "ALL" boundary.** I read "ALL" as map pins, world graph, card layout and campaign planner. Real-time multi-user editing and custom-domain wikis are excluded. Confirm.

**Q11. Table representation.** Markdown table in the entry `body` plus `fields.dice` (recommended: editable, searchable, linkable). The alternative is a structured JSON field with a dedicated editor (stricter, but not human-editable in the normal editor). Approve the recommendation?

**Q12. Map source.** `WIP Map.png` is labelled work-in-progress. Use it as the first map (pins use normalised coordinates, so a later final map can replace it with a re-pin pass), or do you have a final map file?

**Q13. Design baseline.** Keep the existing Obsidian/ash dark and current light palettes as the shadcn tokens (recommended, no visual re-brand), or do you want a visual refresh as part of the migration?

(Answered and closed: Q1, Q2, Q3, Q4, Q6, Q7, Q8, Q9.)
