# The Continent of Asetheria

A private codex and campaign manager for the world of Asetheria — built to add,
edit, search, and cross-reference everything in the setting, from a phone at the
table or a laptop while prepping.

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

Fifteen hundred years of continental history, 186 gods, three empires built on
Rome, Greece, and Achaemenid Persia — and the thing I actually needed at the
table was to type six letters and get the right page in under a second.

So this is that. The whole world in one Postgres database, full-text search with
a fuzzy fallback, and `[[wiki links]]` that build the cross-reference graph for
me. Opening a god shows every organization sworn to them, because the links go
both ways and I never had to write that list.

Two other things mattered enough to build around:

**My players can read it too.** There is a player account that sees the world
minus anything I have marked secret, and separately a *DM notes* field on every
entry that a player never receives under any circumstances — that is where "the
innkeeper is a doppelganger" goes. The filtering happens in SQL, in the data
layer, not in the UI, so a mistake in a component cannot leak the ending.

**Nothing is ever deleted.** I have lost campaign notes before. Archive is a
timestamp, every edit keeps a full snapshot of what came before, and the one code
path that truly removes a row refuses to run on anything that has content.

The original Notion export lives in [`data/notion-export/`](data/notion-export)
and is never modified. It is the permanent fallback copy of the world.

---

## What's in here

The importer turned 1,102 Notion pages and 44 databases into **462 live
entries** and 317 cross-references:

| Section | Count |  | Section | Count |
| --- | --- | --- | --- | --- |
| Deities | 186 | | Pantheons | 7 |
| Organizations | 107 | | Empires | 6 |
| Locations | 86 | | Systems | 5 |
| Families | 14 | | House Rules | 5 |
| Lore | 12 | | Factions | 4 |
| Quests | 10 | | Flora & Fauna | 3 |
| Ores & Materials | 9 | | Items, NPCs, Notes, Sessions | 8 |

Locations are not one list. The Notion database already classified every
settlement through its tags — "Invictian City", "Hellenorian Town", "Island
Village" — so each tier gets its own section:

| Tier | Count | | Tier | Count |
| --- | --- | --- | --- | --- |
| Capitals | 3 | | City Districts | 8 |
| Major Cities | 16 | | Sites | 12 |
| Towns | 17 | | The Wilds | 21 |
| Villages | 9 | | | |

20 further entries are archived rather than deleted — empty Notion index pages
and duplicate roll-up rows. They are all restorable from `/archive`.

Nothing else was thrown away. The Godatabase is a Notion roll-up that re-exports
every god already present in its pantheon folder, so those were merged rather
than imported twice. The importer ends with an integrity check that fails the
run if any source page containing prose is missing from the output.

---

## Getting it running

### 1. Create the database

In your Vercel dashboard: **Storage → Create Database → Neon**. Vercel injects
`DATABASE_URL` into the project automatically.

For local work, copy the pooled connection string from the Neon dashboard.

### 2. Configure

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

- `DATABASE_URL` — from Neon
- `AUTH_SECRET` — generate one:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

- `DM_PASSWORD` and `PLAYER_PASSWORD` — **change both before deploying**
- `SIGNUP_CODE` — optional; leave blank unless you want players to be able to
  create their own accounts (see [below](#letting-players-create-their-own-account))

### 3. Create the schema and load the world

```bash
npm run db:setup
```

That pushes the schema, installs the search extensions, creates the accounts,
loads every entry, and builds the link graph.

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

## Deploying to Vercel

```bash
vercel
```

Then in **Project → Settings → Environment Variables**, add `AUTH_SECRET`
(`DATABASE_URL` is already there from the Neon integration) and redeploy. The
app reads exactly those two variables at runtime.

Use the same `AUTH_SECRET` as the local `.env.local`, or every existing session
is invalidated.

If the Neon database was already seeded from your machine, production points at
that same database and there is nothing further to load.

---

## Two kinds of account

| | DM | Player |
| --- | --- | --- |
| Read public entries | ✅ | ✅ |
| Read secret entries | ✅ | ❌ |
| See DM notes | ✅ | ❌ *(never, on any entry)* |
| Create / edit / archive | ✅ | ❌ |
| Archive, backup, import | ✅ | ❌ |

Redaction happens in the data layer (`src/lib/entries.ts`), not in the UI, so a
missed check in a component cannot leak a secret. Every query a player makes is
filtered in SQL before rows leave the database, and list views never select the
`dmNotes` column at all.

Add more accounts:

```bash
npm run user:add -- --username alice --password "a long passphrase" --role player
```

Re-running it for an existing name resets the password and signs that account
out everywhere.

### Letting players create their own account

Set `SIGNUP_CODE` in `.env.local` (and in Vercel, for production) to open
`/register`:

```bash
SIGNUP_CODE="a phrase you'd say out loud at the table"
```

Leave it unset and `/register` stays closed — that is the default, so a
deployment nobody has configured for this stays sealed. Whoever knows the
phrase can create their own account, and the account it creates is **always a
player**: the role is written by the server, not read from the form, so there
is no field to tamper with and no path from this form to a DM account. Change
the phrase if it gets passed around further than you meant it to.

Registration is throttled per address — 10 accounts per 15 minutes — looser
than login's limit because a whole table registering from one house shares an
address and every attempt counts, including a mistyped code.

---

## Nothing is ever deleted

This was a hard requirement, so it is enforced in three places:

1. **Archive, not delete.** The Archive button sets a timestamp. The row stays
   in the table and can be restored from `/archive` at any time.
2. **Full revision history.** Every edit writes a complete snapshot of the
   previous version first. Any of them can be restored from the entry's edit
   page.
3. **Permanent deletion is gated.** The one code path that actually removes a
   row (`purgeBlankEntryAction`) checks the entry first and refuses if it has a
   body, summary, DM notes, tags, or any property. Only genuinely empty entries
   can be purged, and only from the archive.

Importing a backup never deletes either — entries in the file are updated or
added, and anything not in the file is left untouched.

---

## Using it

**Finding things.** `Ctrl/⌘ K` or `/` opens search from anywhere. Arrow keys and
Enter to jump. Enter on no result runs a full-text search across every entry.
Spelling is forgiving: "aeterna cty" finds Aeterna City.

**Linking.** Type `[[Aeterna City]]` in any description to link another entry.
The link appears on that entry's page too, under *Linked mentions* — so opening
a god shows every organization dedicated to them without you maintaining a list.

**Secrets.** Each entry is Everyone / DM only / Revealed. Separately, the
**DM notes** field on any entry is never sent to a player, even when the entry
itself is public.

**Dice.** `/tools/dice` takes full notation: `4d6kh3`, `1d20adv`, `3d6!`,
`6x4d6kh3`, `1d8+2d6-1`.

**Backups.** `/admin` downloads a complete JSON copy — every entry, secret, note,
link, and table. Worth doing before a big session.

---

## Tech

Next.js 15 (App Router) · TypeScript · Neon Postgres · Drizzle ORM ·
Tailwind CSS v4 · `jose` sessions

**Security:** scrypt password hashing, httpOnly `SameSite=Lax` JWT cookies,
DB-backed session revocation, rate-limited login and registration (hashed
identifiers so no raw IPs are stored), constant-time comparison for both
passwords and the invite code, self-registration closed by default and role
always written server-side, Zod validation on every write, CSP and security
headers, and a Markdown renderer that escapes input before parsing so stored
HTML cannot execute.

### Commands

| | |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run db:setup` | Push schema + extensions + seed (first-time setup) |
| `npm run db:seed` | Re-seed; updates existing entries, never deletes |
| `npm run db:studio` | Browse the database in Drizzle Studio |
| `npm run import:notion` | Re-run the Notion import into `data/world-seed.json` |
| `npm run user:add` | Add or update an account |
| `npm run typecheck` | Type check |

Maintenance scripts, all dry-run by default — pass `--apply` to write:

| | |
| --- | --- |
| `npx tsx scripts/reclassify-locations.ts` | Re-derive location tiers from tags; archive empty Notion index and duplicate pages |
| `npx tsx scripts/populate-tags.ts` | Fill in tags for entries that have none, derived from each entry's own properties |
| `npx tsx scripts/enrich-from-html.ts` | Recover page bodies from a Notion **HTML** export where the Markdown export dropped them |

### Re-importing from Notion

If you keep editing in Notion and want to pull changes across, replace
`data/notion-export/` with a fresh export and run:

```bash
npm run import:notion && npm run db:seed
```

The seed matches on slug and **will not overwrite work done in the app**. A
description you have written, a summary, a property you have set, tags you have
curated, and the section an entry was re-filed into are all left alone —
imported values only ever fill a gap.

That last one matters because the importer classifies from the export's folder
tree, which cannot know that a page was deliberately moved. "The 3 Empires" is
empire history filed under a location folder in Notion and belongs in Lore here,
so the seed keeps it there and says so:

```
· kept 1 kind set in the app (pass --reclassify to take the export's)
```

If you reorganise in Notion and *do* want the export's classification to win:

```bash
npm run db:seed -- --reclassify
```

One caveat worth knowing: Notion's Markdown export silently drops the contents
of column layouts and some toggle blocks. Its HTML export does not. If a page
looks emptier here than it does in Notion, export as HTML and run
`scripts/enrich-from-html.ts` against it.
