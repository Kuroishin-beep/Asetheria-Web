# SESSION-HANDOFF.md — Asetheria-Web

Where things stand and how to pick them up. The detail lives in
`docs/AUDIT-AND-ROADMAP.md`; this is the "get back to work" version.

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

New scripts: `foundry:extract`, `codex:import-file`, `lore:build`,
`codex:merge-duplicates`, `links:rebuild`.

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
