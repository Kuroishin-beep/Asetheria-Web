> **Note:** This is the earlier README rewrite in the world owner's voice, preserved
> when the restored README on `main` took its place. Kept for the prose and the
> migration story; the live document is [`README.md`](../README.md).

# The Continent of Asetheria

This is my D&D world, and this is the app I run it from.

Everything I've written about Asetheria used to live in Notion, which was fine
for writing and miserable at the table — too slow to search, too easy to spoil
myself, and no way to hand my players a version with the secrets stripped out.
So I moved the whole thing here: my own codex, on my own database, that I can
add to and edit from my phone mid-session or from a laptop while I prep.

My original Notion export is kept in
[`data/notion-export/`](data/notion-export) and never modified. If I ever break
something, that folder is the world, untouched.

---

## What's in it

520 entries, built from 1,102 Notion pages and 44 databases:

| | | | | |
| --- | --- | --- | --- | --- |
| Deities | 186 | | Ores & Materials | 9 |
| Locations | 116 | | Pantheons | 7 |
| Organizations | 112 | | Empires | 6 |
| NPCs | 17 | | Systems | 6 |
| Lore | 16 | | Items | 5 |
| Families | 14 | | House Rules | 5 |
| Quests | 10 | | Factions | 4 |
| | | | Flora, Notes, Sessions | 7 |

Locations don't sit in one flat list — they're split by tier, so the nav and the
front page go **Capitals → Major Cities → Towns → Villages → City Districts →
Sites → The Wilds**. A settlement's tier lives in its `tier` property, derived on
import and correctable by hand.

The import threw away exactly two things: 478 blank placeholder rows (empty rows
in my Notion databases, which export as untitled pages with nothing in them) and
213 duplicate pages, because the Godatabase is a roll-up that re-exports every
god already sitting in its pantheon folder. Those got merged, not dropped.

The importer finishes with an integrity check that fails the run if any page of
mine with actual prose in it didn't make it across. It passes.

---

## Setting it up again

Notes to myself, for when I'm on a new machine or rebuilding.

### 1. Database

Vercel dashboard → **Storage → Create Database → Neon**. That injects
`DATABASE_URL` into the project on its own. For local work I copy the connection
string out of the Neon dashboard.

### 2. Config

```bash
cp .env.example .env.local
```

Then fill in:

- `DATABASE_URL` — from Neon
- `AUTH_SECRET` — generate with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

- `DM_PASSWORD` and `PLAYER_PASSWORD` — **change both before deploying**

### 3. Schema and content

```bash
npm install
npm run db:setup
```

Pushes the schema, installs the search extensions, creates my two accounts,
loads every entry, and builds the link graph.

### 4. Go

```bash
npm run dev
```

http://localhost:3000, sign in as the DM.

### Deploying

```bash
vercel
```

Then **Project → Settings → Environment Variables** → add `AUTH_SECRET`
(`DATABASE_URL` is already there from the Neon integration) and redeploy. I seed
production once from my own machine by pointing `.env.local` at the production
connection string and running `npm run db:setup`.

---

## Me and my players

| | Me (DM) | Players |
| --- | --- | --- |
| Read public entries | ✅ | ✅ |
| Read secret entries | ✅ | ❌ |
| See my DM notes | ✅ | ❌ *(never, on any entry)* |
| Create / edit / archive | ✅ | ❌ |
| Backup and import | ✅ | ❌ |

The redaction happens in the data layer (`src/lib/entries.ts`), not in the
templates — a player's query is filtered in SQL before any row leaves the
database, so I can't leak a secret by forgetting a check in a component.

New player account:

```bash
npm run user:add -- --username alice --password "a long passphrase" --role player
```

Running it again on an existing name resets that password and kicks the account
out of every session it had open.

---

## Nothing gets deleted

This was the whole reason I stopped trusting my old setup, so it's enforced in
three places:

1. **Archive instead of delete.** The Archive button just sets a timestamp. The
   row stays in the table and I can restore it from `/archive` whenever.
2. **Full history.** Every edit snapshots the previous version first. I can roll
   any entry back from its edit page.
3. **Permanent deletion is gated.** The one code path that actually removes a
   row refuses if the entry has a body, summary, DM note, tag, or any property.
   Only genuinely empty entries can go, and only from the archive.

Restoring a backup can't delete anything either — entries in the file get
updated or added, and anything not in the file is left alone.

---

## How I actually use it

**The front page** leads with the three standing empires, then continental lore,
then settlements by tier — capitals first, then major cities, then towns. It's
the order I actually think in when I'm prepping.

**Finding things.** `Ctrl/⌘ K` or `/` from anywhere. Arrows and Enter to jump.
Enter with no result runs a full-text search across everything, including
properties — so `satyr` or `chaotic neutral` finds the right gods.

**Linking.** `[[Aeterna City]]` in any description links it. The link shows up on
*that* entry's page too, under Linked mentions, so opening a god shows me every
organization dedicated to them without my ever maintaining a list.

Mentions quote the sentence they came from, which matters because a lot of my
entries have no description of their own. Opening *Persemenid* shows me what my
own notes say about it:

> "At the heart of this empire lies Persemenid, a magnificent city born from the
> discovery of a sprawling oasis by the first leaders." — Acheaoria

**Filled-in descriptions.** 345 entries that I'd never written prose for now have
a description built from their own properties — pantheon, domains, alignment,
race for a god; type, patron, allegiance for an order. There are also 38 new
entries for people and places my writing names but never gave a page: the four
voices arguing in the margins of the Imperium chronicle, House Caerthain's
ancestors and the lake they won't talk about, the ruined cities on Velothis, the
Scholars' three kinds of rift.

All of it is labelled as generated, becomes mine the moment I edit it, and
`npm run describe -- --revert` wipes it if I decide I'd rather write my own.
[`docs/content-review.md`](docs/content-review.md) has the full inventory,
including 13 near-duplicate locations I should probably merge.

**Secrets.** Every entry is Everyone / DM only / Revealed. Separately, the
**DM notes** field is never sent to a player even on a public entry — that's
where "the innkeeper is a doppelganger" goes.

**Dice.** `/tools/dice` takes real notation: `4d6kh3`, `1d20adv`, `3d6!`,
`6x4d6kh3`, `1d8+2d6-1`.

**Backups.** `/admin` gives me a complete JSON copy — every entry, secret, note,
link and table. Worth grabbing before a big session.

---

## Under the hood

Next.js 15 (App Router) · TypeScript · Neon Postgres · Drizzle ORM ·
Tailwind CSS v4 · `jose` sessions.

Security, since this is on the public internet with my players' spoilers in it:
scrypt password hashing, httpOnly `SameSite=Lax` JWT cookies, DB-backed session
revocation, login throttling (8 attempts / 15 min, identifiers hashed so no raw
IPs are stored), constant-time password comparison against a dummy hash for
unknown users, Zod validation on every write, CSP and security headers, and a
Markdown renderer that escapes input before parsing so nothing stored in an
entry can execute.

### Commands

| | |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run db:setup` | Schema + extensions + seed (first-time setup) |
| `npm run db:seed` | Re-seed; updates entries, never deletes |
| `npm run db:studio` | Poke at the database directly |
| `npm run import:notion` | Re-run the Notion import into `data/world-seed.json` |
| `npm run describe` | Fill empty entries from their properties |
| `npm run describe -- --preview` | Show what that would write, change nothing |
| `npm run describe -- --revert` | Remove every generated description |
| `npm run verify:links` | Preview the link graph and quoted mentions, no DB needed |
| `npm run verify:expansion` | Check my authored entries and that every link resolves |
| `npm run user:add` | Add or reset an account |
| `npm run typecheck` | Type check |

### Pulling changes back from Notion

If I keep writing in Notion and want it here, I drop a fresh export into
`data/notion-export/` and run:

```bash
npm run import:notion && npm run db:seed
```

The seed matches on slug and **won't overwrite anything I've written in the
app** — it only fills in a description where the entry's body is still empty.
