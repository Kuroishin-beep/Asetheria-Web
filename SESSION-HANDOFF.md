# SESSION-HANDOFF.md — Asetheria-Web

Where things stand and how to pick them up. The detail lives in
`docs/AUDIT-AND-ROADMAP.md`; this is the "get back to work" version.

## 0. PAUSED 2026-10-10: read this first (everything below §0 is older history)

### Where things stand
- **PLAN.md v2.1 is finished** (Phases 0 to 11 plus the Step 2 to 4 test deliverables), verified and merged.
  `origin/main` and `origin/hardening-and-content` are both at `f520c26` (fast-forward, no force).
- One local commit is **not pushed yet**: `de487ce` (SESSION_HANDOFF_UPDATE.md update), plus this file's update.
  Push both with `git push origin hardening-and-content` and `git push origin hardening-and-content:main`
  (both are fast-forwards).
- The owner's local `main` is checked out in another worktree
  (`.claude/worktrees/hellenoria-museum-heist-a38a2b`) and is only behind: run `git pull` there.
- Final run: 509 passed, 0 failed, 0 flaky (18.6 min). `test-cases.html` and `TEST-REPORT.md` hold the results.
- Neon production has the full schema, including `characters` (added 2026-10-10).
- Details: `SESSION_HANDOFF_UPDATE.md` §0, `HANDOFF.md`, `IMPLEMENTATION_TRACKER.md`, `TEST-REPORT.md`.

### Owner's production steps (still open)
1. Create the DM account. 2. Vercel env: `DATABASE_URL`, `AUTH_SECRET`, `PLAYER_PASSWORD`,
optional `SIGNUP_CODE`, `EMBEDDINGS_CACHE_DIR`. 3. Deploy and check `/api/health`.
4. **Rotate the Neon password** (it was pasted in chat).

### Next work: LegendKeeper / World Anvil features (chosen by the owner 2026-10-10)
Not started. Step one is to write these into PLAN.md as Phases 12 to 19 with acceptance criteria
(this is new scope beyond v2.1), then build them one phase at a time with the same rules: full suite
green on an idle machine before each commit, `tsc`, build, design gates, tracker entry, case ids
for new tests, `test-cases.html` regenerated at the end.

| Phase | Feature (owner's choice) | Estimate |
|---|---|---|
| 12 | Inline secret blocks: DM-only paragraphs inside any page, each revealable to chosen players; never in a player's HTML, search, embeddings or exports | 2.5 h |
| 13 | Page templates the DM can edit in the app (today they are fixed in `src/lib/entry-templates.ts`) | 1.5 h |
| 14 | 5e statblocks on creature and NPC pages from structured fields (links to rules only, no copied text) | 1.5 h |
| 15 | Asetheria calendar: the world's own months, weekdays and current in-game date; sessions placed on it. **Ask the owner for the month and weekday names.** | 2 h |
| 16 | Timeline / chronicle: dated events in eras, linked to pages, filtered by each player's access (uses the calendar) | 2.5 h |
| 17 | Family trees for Families pages, plus alliance and rivalry webs between empires and organizations | 3 h |
| 18 | Map regions (drawn territories), layer toggles, and drill-down from a city pin to that city's own map | 3.5 h |
| 19 | Characters linked to the world: a codex page per saved character (party roster), a per-character journal, links to empire, god and home | 2 h |

Total: about 20 to 25 hours of work plus roughly 3 hours of full-suite runs.
Not chosen (do not build): boards (freeform canvas), level-up flow.

### Working notes
- Run full suites with the machine idle; concurrent CPU work skews the frame-time tests, and this
  machine is memory-tight (two runs were stopped for low memory). One Playwright run at a time;
  never edit `src/` while one runs.
- Never commit the owner's files: `Aetheria.jpg`, `The Port City of Helarchon.jpg`, `WIP Map.png`, `docs/maps/`.
  `.env.neon` and `backups/` stay git-ignored; never print the Neon URL.
- New SQL for production goes through `scripts/apply-sql.ts` with `DATABASE_URL` from `.env.neon`
  (additive only); `setup.sql` must not go through it (it has `$fn$` bodies).

## 1. State

| Item | State |
|---|---|
| `main` (GitHub) | `6bfc6d5`: the RBAC phases, the search-security fixes, and main's heist/bestiary work, merged |
| Working branch | `hardening-and-content`, not yet pushed |
| Tests | Playwright full suite (see §4), `tsc --noEmit` clean, `next build` clean |
| Prod DB (Neon) | **Not updated.** No credentials in this environment; see §3 |
| Local test DB | Docker container `asetheria-test-pg`, port 55432. Docker Desktop stops between sessions: start it, then `docker start asetheria-test-pg`. **Never point tests at Neon.** |

## 2. What `hardening-and-content` adds

**Security and platform**
- drizzle 0.45 (SQL-injection advisory) and Next 16 (postcss advisories); `npm audit --omit=dev` clean
- `middleware.ts` → `proxy.ts`
- The party door now needs the party password (= `PLAYER_PASSWORD`)
- `clientIp()` no longer trusts the client's first `x-forwarded-for` hop
- Wiki links on pages are role-scoped: no links to secret, ungranted or archived pages
- Embeddings refresh after every save (`after()`); they're no longer in exports or revisions
- GitHub Actions CI: typecheck, prod audit, build, dice unit tests

**Graph (Obsidian-style)**
- Aliases ("Also known as")
- Shared titles resolve by kind priority
- Prose mentions survive edits (relation `named`)
- Unlinked mentions panel (DM)
- Hover previews

**Keyboard (Superhuman-style)**
- Palette runs commands
- `g`-chords, `c`, `e`, `?` sheet
- Ctrl+S saves

**Editor and pages (Notion-style)**
- `[[` autocomplete
- Write/Preview tabs
- Draft recovery
- Page outline with `#sec-` anchors

**Content**
- `data/foundry-world.json`: 57 Asetheria-authored entries from the Foundry worlds (licensed modules excluded)
- `data/lore-population.json`: bodies for all 186 deities
- `scripts/merge-duplicates.ts`: 13 duplicate settlements merged, spellings kept as aliases

**Cities**: `data/city-locations.json` — 96 new places inside the 16
capitals/major cities plus Deiperduem and Duneforged: 63 common institutions
in each empire's idiom (forum/baths/basilica/garrison; agora/temple
precinct/gymnasion/theatre; bazaar/fire-temple/caravanserai/water-court) with
a city-specific section, and 33 landmarks the city write-ups already named.
22 existing pages (Duneforged's districts and temples, Aqua Aeterna, the
Paradise, Palace of Eronis) now sit under their city. Note: players only see
these once granted — default grants cover empires + `major-city` tags only.

**Scripts now work on any Postgres**: all 15 of main's content scripts used to
be Neon-only; `scripts/lib/script-db.ts` routes local DBs through `pg`, so the
local test DB now holds the same descriptions Neon does (cities, towns,
villages, wilds, sites, organizations). `enrich-from-html` still needs the
Notion HTML export, which is not on this machine.

New scripts: `foundry:extract`, `codex:import-file`, `lore:build`,
`codex:merge-duplicates`, `links:rebuild`, `cities:build`.

## 3. To ship

```powershell
cd E:\Github\Asetheria\Asetheria-Web
git push -u origin hardening-and-content     # then open a PR into main, or fast-forward main
```

Then, against **Neon** (`$env:DATABASE_URL` = the Neon URL), in order:

```powershell
psql $env:DATABASE_URL -f scripts/sql/setup.sql
npx tsx scripts/import-codex-file.ts data/foundry-world.json --fill-empty
npx tsx scripts/import-codex-file.ts data/lore-population.json --fill-empty
npx tsx scripts/merge-duplicates.ts --apply
npx tsx scripts/import-codex-file.ts data/city-locations.json --fill-empty
npx tsx scripts/rebuild-links.ts
npm run embeddings:generate
```

All idempotent; nothing is deleted. Set the Vercel env vars too: `PLAYER_PASSWORD`
now gates the party door. Optionally set `EMBEDDINGS_CACHE_DIR`.

To refresh Foundry content later: `npm run foundry:extract`, review the diff
of `data/foundry-world.json`, then re-run the import line above.

## 4. Test suite additions

- `tests/knowledge-features.spec.ts`: palette commands, chords, `?` sheet,
  shortcuts blocked while typing, player has no create command, `[[`
  autocomplete, preview, draft recovery, alias links + outline, unlinked
  mentions, player-scoped wiki links, imported quests and deities
- `tests/entry-doors.spec.ts`: party door now requires a password
- `tests/search-safety.spec.ts`: test words no longer share the `zz` prefix
  with test entry names (it tripped the semantic floor; not a leak)
- `tests/import-export.spec.ts`: export carries no embeddings

## 5. Open items

See `docs/AUDIT-AND-ROADMAP.md` §3. Top picks:
- a local graph on each entry page
- a searchable parent picker
- inline property editing
- per-kind templates
- recently viewed and pinned entries

The shadcn/ui + Motion migration mandated by the root `CLAUDE.md` is still
outstanding.
