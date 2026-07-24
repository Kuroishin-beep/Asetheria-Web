# The Continent of Asetheria

A private codex and campaign manager for the world of Asetheria — built to add,
edit, search, and cross-reference everything in the setting, from a phone at the
table or a laptop while prepping.

Your original Notion export lives in [`data/notion-export/`](data/notion-export)
and is never modified. It is the permanent fallback copy of the world.

---

## What's in here

The importer turned 1,102 Notion pages and 44 databases into **482 entries**:

| Section | Count |  | Section | Count |
| --- | --- | --- | --- | --- |
| Deities | 186 | | Ores & Materials | 9 |
| Organizations | 107 | | Pantheons | 7 |
| Locations | 106 | | Empires | 6 |
| Families | 14 | | Systems | 6 |
| Lore | 11 | | House Rules | 5 |
| Quests | 10 | | Factions | 4 |
| | | | Flora, Items, NPCs, Notes, Sessions | 13 |

Nothing was thrown away except **478 genuinely blank placeholder rows** (empty
rows in Notion databases, which export as untitled pages with no content) and
**213 duplicate pages** — the Godatabase is a Notion roll-up that re-exports
every god already present in its pantheon folder, so those were merged rather
than imported twice.

The importer ends with an integrity check that fails the run if any source page
containing prose is missing from the output.

---

## Getting it running

### 1. Create the database

In your Vercel dashboard: **Storage → Create Database → Neon**. Vercel injects
`DATABASE_URL` into the project automatically.

For local work, copy the connection string from the Neon dashboard.

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

### 3. Create the schema and load the world

```bash
npm install
npm run db:setup
```

That pushes the schema, installs the search extensions, creates your two
accounts, loads all 482 entries, and builds the link graph.

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
(`DATABASE_URL` is already there from the Neon integration). Redeploy.

Run the seed once against the production database from your machine — set
`DATABASE_URL` in `.env.local` to the production string and run `npm run db:setup`.

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
missed check in a component can't leak a secret. Every query a player makes is
filtered in SQL before rows leave the database.

Add more accounts:

```bash
npm run user:add -- --username alice --password "a long passphrase" --role player
```

Re-running it for an existing name resets the password and signs that account
out everywhere.

---

## Nothing is ever deleted

This was a hard requirement, so it's enforced in three places:

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

**Linking.** Type `[[Aeterna City]]` in any description to link another entry.
The link appears on that entry's page too, under *Linked mentions* — so opening
a god shows every organization dedicated to them without you maintaining a list.

**Secrets.** Each entry is Everyone / DM only / Revealed. Separately, the
**DM notes** field on any entry is never sent to a player, even when the entry
itself is public — that's where "the innkeeper is a doppelganger" goes.

**Dice.** `/tools/dice` takes full notation: `4d6kh3`, `1d20adv`, `3d6!`,
`6x4d6kh3`, `1d8+2d6-1`.

**Backups.** `/admin` downloads a complete JSON copy — every entry, secret, note,
link, and table. Worth doing before a big session.

---

## Tech

Next.js 15 (App Router) · TypeScript · Neon Postgres · Drizzle ORM ·
Tailwind CSS v4 · `jose` sessions

**Security:** scrypt password hashing, httpOnly `SameSite=Lax` JWT cookies,
DB-backed session revocation, rate-limited login (8 attempts / 15 min, with
hashed identifiers so no raw IPs are stored), constant-time password comparison
with a dummy hash for unknown users, Zod validation on every write, CSP and
security headers, and a Markdown renderer that escapes input before parsing so
stored HTML can't execute.

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

### Re-importing from Notion

If you keep editing in Notion and want to pull changes across, replace
`data/notion-export/` with a fresh export and run:

```bash
npm run import:notion && npm run db:seed
```

The seed matches on slug and **won't overwrite a description you've written in
the app** — it only fills one in where the entry's body is empty.
