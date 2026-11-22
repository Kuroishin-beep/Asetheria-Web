# The Continent of Asetheria

A private codex and campaign manager for the world of Asetheria — built to add,
edit, search, and cross-reference everything in the setting, from a phone at the
table or a laptop while prepping.

**7,563 live entries · 104,000 cross-references · 2,431 creatures · 1,499 spells ·
three empires, one inland sea.** See [ABOUT.md](ABOUT.md) for the short version.

---

## Why I built this

Asetheria lived in Notion for years, and Notion was fine for writing it. It was
miserable for *running* it.

Mid-session, someone asks which god the temple in Delphara is dedicated to. I
know I wrote it down. I do not know whether it is on the Delphara page, in the
Hellenorian pantheon table, or in a database row three folders deep — and the
party is waiting while I scroll. Notion search returns forty results and none of
them are the one. Half the pages are database roll-ups that exist twice. Nothing
tells me that eleven organizations are dedicated to the same deity unless I
maintain that list myself, by hand, forever.

Fifteen hundred years of continental history, two hundred gods, three empires
built on Rome, Greece, and Achaemenid Persia — and the thing I actually needed at
the table was to type six letters and get the right page in under a second.

So this is that. The whole world in one Postgres database, full-text search with
a fuzzy fallback and semantic search on top, and `[[wiki links]]` that build the
cross-reference graph for me. Opening a god shows every organization sworn to
them, because the links go both ways and I never had to write that list.

Two other things mattered enough to build around:

**My players can read it too.** Every player has their own login and sees the
world minus anything I have marked secret, and separately a *DM notes* field on
every entry that a player never receives under any circumstances — that is where
"the innkeeper is a doppelganger" goes. The filtering happens in SQL, in the data
layer, not in the UI, so a mistake in a component cannot leak the ending.

**Nothing is ever deleted.** I have lost campaign notes before. Archive is a
timestamp, every edit in the app keeps a full snapshot of what came before, and
the one code path that truly removes a row refuses to run on anything that has
content.

The original Notion export lives in [`data/notion-export/`](data/notion-export)
and is never modified. It is the permanent fallback copy of the world.

---

## What's in here

The world grew in layers: the Notion import, original additions, the Foundry VTT
world, and finally the **Codex Expansion** — a book-length polish and extension
of the whole setting.

| Section | Count | | Section | Count |
| --- | --- | --- | --- | --- |
| Bestiary | 2,431 | | Items | 147 |
| Rules (incl. 1,499 spells) | 1,658 | | Organizations | 126 |
| Locations | 1,309 | | Ores & Materials | 96 |
| Lore | 622 | | Flora & Fauna | 158 |
| Deities | 207 | | Systems | 86 |
| Families & Houses | 191 | | Tables | 81 |
| NPCs | 169 | | Factions | 60 |
| Quests | 163 | | Notes, Events, Pantheons, Empires | 59 |

4,066 of those entries are DM-only.

### The Codex Expansion

The biggest layer. A long, canon-checked extension of the codex, written to a
shared brief so every city, house and champion agrees with every other:

- every city, town and village rewritten and extended — districts, rulers,
  noble houses, temples, trouble — with the empires' own titles (Dux, Archon,
  Satrap) and the named roads that tie them together;
- the twenty champions and the rulers, with full stat blocks;
- systems of the empires (grain, water, coin, law, faith, the military),
  campaign arcs, ready-to-run dungeons, artefacts and heirlooms, festivals,
  calendars, myths, folklore, handouts, travel rules and player options;
- the **Bestiary of Asetheria** — 2,364 creatures, each re-homed in Asetherian
  regions with local names, lore, every stat block version, and an adventure
  hook in the DM notes;
- the **Spellbook of Asetheria** — 1,499 spells, 180 of them Asetheria homebrew.

It lives in two forms:

1. **As codex entries.** Each section and card became its own entry, filed under
   its parent (a district under its city, a house under its seat, a creature
   under the Bestiary), linked to everything it names. Anything that is not in
   the Players' Guide is DM-only, and the book's DM boxes went into DM notes.
   Existing pages were never overwritten wholesale: blank fields were filled and
   only one-line stubs were replaced by the fuller text.
2. **As two books** at `/books/`: the **Players' Guide**, open to anyone signed
   in, and the **DM Codex**, which only the DM can open (everyone else gets a
   404). Both are linked from the sidebar.

The converter is [`scripts/codex-expansion/convert.py`](scripts/codex-expansion/convert.py):
it turns the expansion's DM book into an `asetheria-codex` JSON file, which
`scripts/import-codex-file.ts --fill-empty` loads.

### Licences

The Notion world, the expansion's prose and the 180 homebrew spells are the DM's
own work. The Bestiary and most of the Spellbook come from open-licence books —
SRD 5.1 and 5.2 (CC BY 4.0, Wizards of the Coast), the Black Flag SRD (CC BY 4.0,
Kobold Press), Level Up A5E (EN Publishing) and Kobold Press's OGL 1.0a books —
used with the DM's permission. **Every stat block and spell names its source
book**, and the books' credits are kept on the Bestiary and Spellbook pages.
Content from licensed Foundry VTT modules and commercial sourcebooks is never
imported.

---

## Features

- **Search.** `Ctrl/⌘ K` or `/` from anywhere. Forgiving spelling ("aeterna cty"
  finds Aeterna City), full-text search on Enter, and semantic search
  (all-MiniLM-L6-v2 vectors in pgvector) for "that city with the salt trade".
- **Links and the graph.** `[[Aeterna City]]` links anywhere; every page shows
  its *Linked mentions*, and `/graph` draws the whole web.
- **Secrets.** Each entry is Everyone / DM only / Revealed, plus secret blocks
  inside an entry that you can reveal to the table one at a time.
- **Players & access.** Per-player logins managed from the Party page, with
  category- and entry-level grants at `/admin/rbac`.
- **Characters.** A character creator, drafts, and imported Foundry characters.
- **Maps.** Interactive maps with layers, regions and pins.
- **Calendar and timeline.** The campaign calendar, events and a timeline.
- **Planner.** Session prep that pulls straight from the codex.
- **Tools.** Dice (`4d6kh3`, `1d20adv`, `3d6!`, `6x4d6kh3`) and roll tables.
- **Backups.** `/admin` downloads a complete JSON copy — every entry, secret,
  note, link and table.

---

## Getting it running

### 1. Create the database

Create a Postgres database on [Neon](https://neon.com) (the free plan is enough)
and copy its pooled connection string. For local work you can use any Postgres
with the `pgvector` extension instead.

### 2. Configure

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

- `DATABASE_URL` — your Postgres connection string
- `AUTH_SECRET` — generate one:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

- `DM_PASSWORD` and `PLAYER_PASSWORD` — **change both before deploying**
- `SIGNUP_CODE` — optional; leave blank unless you want players to be able to
  create their own accounts (see [below](#letting-players-create-their-own-account))

Never commit `.env.local` or any file holding the production connection string.

### 3. Create the schema and load the world

```bash
npm run db:setup
```

That pushes the schema, installs the search extensions, creates the accounts,
loads every entry, and builds the link graph. Then load the later layers:

```bash
npx tsx scripts/import-codex-file.ts data/foundry-world.json
npx tsx scripts/import-codex-file.ts <codex-expansion.json> --fill-empty
npm run embeddings:generate   # required once for semantic search
```

`import-codex-file.ts` never deletes anything, leaves existing entries alone
unless you pass `--fill-empty` (which only fills blanks and replaces marked
stubs), and accepts `--dry-run` to report without writing.

> Watch the account lines in the output. If a password is missing from the env
> the seed prints `skipped <role> account (no password in env)` and carries on —
> the run still looks successful, but you will not be able to sign in. Fix it
> with `npm run user:add`. Passwords must be at least 10 characters.

### 4. Run it

```bash
npm run dev
```

Open http://localhost:3000 and sign in with your DM username and password.

---

## Deploying to Netlify

The site deploys to Netlify from `main`; `netlify.toml` holds the build settings
and the Next.js runtime is applied automatically.

In **Site configuration → Environment variables**, set `DATABASE_URL` and
`AUTH_SECRET` (plus `SIGNUP_CODE` if you use it). Use the same `AUTH_SECRET` as
your local `.env.local`, or every existing session is invalidated.

If the database was already seeded from your machine, production points at that
same database and there is nothing further to load. Deploy only committed code.

---

## Two kinds of account

| | DM | Player |
| --- | --- | --- |
| Read public entries | ✅ | ✅ (as granted) |
| Read secret entries | ✅ | ❌ |
| See DM notes | ✅ | ❌ *(never, on any entry)* |
| Open the DM Codex book | ✅ | ❌ |
| Create / edit / archive | ✅ | ❌ |
| Archive, backup, import | ✅ | ❌ |

Redaction happens in the data layer (`src/lib/entries.ts`), not in the UI, so a
missed check in a component can't leak a secret. Every query a player makes is
filtered in SQL before rows leave the database, and list views never select the
`dmNotes` column at all. This is a hard ceiling: a `secret` entry is never shown
to a player, no matter what the per-player access controls say.

**Per-player access.** Each player signs in with their own login, created from
the Party page or with `npm run user:add`. A forgotten password goes to the DM,
who resets it from the Party page. A new player account is asked its name once at
`/onboarding` and starts with the continent's empires and any location tagged
`major-city` — everything else needs an explicit grant. At `/admin/rbac`
("Players & Access" in the sidebar) the DM toggles whole categories per player,
or drills into one category to approve or reject specific entries.

```bash
npm run user:add -- --username alice --password "a long passphrase" --role player
```

Re-running it for an existing name resets the password and signs that account
out everywhere.

### Letting players create their own account

Set `SIGNUP_CODE` (locally and on Netlify) to open `/register`:

```bash
SIGNUP_CODE="a phrase you'd say out loud at the table"
```

Leave it unset and `/register` stays closed — that is the default. The account
it creates is **always a player**: the role is written by the server, not read
from the form. Registration is throttled per address — 10 accounts per
15 minutes.

---

## Nothing is ever deleted

This was a hard requirement, so it is enforced in three places:

1. **Archive, not delete.** The Archive button sets a timestamp. The row stays
   in the table and can be restored from `/archive` at any time.
2. **Full revision history.** Every edit in the app writes a complete snapshot of
   the previous version first. Any of them can be restored from the entry's edit
   page.
3. **Permanent deletion is gated.** The one code path that actually removes a row
   (`purgeBlankEntryAction`) refuses if the entry has a body, summary, DM notes,
   tags, or any property.

Imports never delete either. Bulk imports run outside the revision history, so
take a backup from `/admin` before a large one.

---

## Tech

Next.js 16 (App Router) · React 19 · TypeScript · Neon Postgres + pgvector ·
Drizzle ORM · Tailwind CSS v4 · shadcn/ui · Motion · `jose` sessions ·
Playwright · deployed on Netlify

**Security:** scrypt password hashing, httpOnly `SameSite=Lax` JWT cookies,
DB-backed session revocation, rate-limited login and registration (hashed
identifiers so no raw IPs are stored), constant-time comparison for passwords and
the invite code, self-registration closed by default with the role always written
server-side, Zod validation on every write, CSP and security headers, and a
Markdown renderer that escapes input before parsing so stored HTML cannot
execute.

### Commands

| | |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run typecheck` | Type check |
| `npm run db:setup` | Push schema + extensions + seed (first-time setup) |
| `npm run db:seed` | Re-seed; updates existing entries, never deletes |
| `npm run db:studio` | Browse the database in Drizzle Studio |
| `npm run embeddings:generate` | Embed new or changed entries for semantic search |
| `npm run import:notion` | Re-run the Notion import into `data/world-seed.json` |
| `npm run import:foundry` | Import the custom Foundry compendium |
| `npm run user:add` | Add or update an account |
| `npx tsx scripts/import-codex-file.ts <file> [--fill-empty] [--dry-run]` | Load an `asetheria-codex` JSON file |
| `python scripts/codex-expansion/convert.py <zip-root> <out.json>` | Convert the Codex Expansion book to codex JSON |

Schema changes for features added after the first release ship as idempotent SQL
with a matching rollback, applied with `npm run db:<feature>` (for example
`npm run db:maps` / `npm run db:maps:rollback`).

### Re-importing from Notion

Replace `data/notion-export/` with a fresh export and run:

```bash
npm run import:notion && npm run db:seed
```

The seed matches on slug and **will not overwrite work done in the app** —
imported values only ever fill a gap. If you reorganise in Notion and want the
export's classification to win, pass `--reclassify`:

```bash
npm run db:seed -- --reclassify
```

Notion's Markdown export silently drops the contents of column layouts and some
toggle blocks. If a page looks emptier here than in Notion, export as HTML and
run `scripts/enrich-from-html.ts` against it.
