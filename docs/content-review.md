# Continent review — what your source material actually contains

A pass over all 1,102 Notion pages and 44 databases, to establish what could be
populated from your own writing without inventing anything.

## The short version

Your prose is concentrated in about **95 pages**. The other **365 entries are
property-only rows** — a deity with Alignment / Domains / Race and nothing else,
a city with a single `Tags: Invictian City`. That's how they exist in Notion;
the import didn't lose them.

Of those 365 stubs, only **56 are named anywhere in your prose**. The remaining
**309 have no description in your material at all** — there is nothing to
extract for them, only something to write.

## Where the writing is

| Page | Words |
| --- | --- |
| Imperium Invicta | ~17,100 chars |
| Hellenoria | ~15,500 |
| Quests | ~15,400 |
| Books | ~15,000 |
| Acheaoria | ~13,200 |
| Varathros Lake | ~11,200 |
| Higher/Complicated (casino games) | ~10,600 |
| Economic (systems) | ~9,900 |
| Latium Plains | ~9,000 |
| Political (systems) | ~8,200 |
| Mithril Reserve | ~7,600 |
| Dasht-a Khaliq | ~6,600 |
| Phenomenon | ~5,900 |
| The Ju Colliseum | ~5,200 |

The three empire pages are narrative essays — an introduction, a history, a
"today" section, and DM handouts. They are *not* structured per-city, so there
are no per-location sections to split out and attach to city entries.

## What was extracted

Everything that existed. The importer's integrity check verifies that every
source page containing prose appears in the database, and it passes.

Beyond the prose itself:

- **Properties** — Alignment, Domains, Race, Symbol, Type, Subcategory,
  Dedicated To, and ~20 more, mapped onto typed fields per entry kind.
- **Pantheon** — derived for every deity from its folder and tags, a field that
  didn't exist as a column in Notion.
- **Hierarchy** — 18 parent/child relationships recovered from the export's
  folder nesting.
- **Secrets** — 46 entries flagged DM-only, detected from `The Truth` /
  `Forbidden Zone` paths and `Category: UNKNOWN`.

## What was added on this pass

Three changes, all grounded strictly in your existing text:

1. **Quoted backlinks.** Each link now stores the sentence where the mention
   occurs. Opening a stub entry like *Aeterna City* shows the actual lines from
   the Imperium Invicta history that mention it — so a page with no description
   of its own still tells you what your notes say about it.

2. **Properties are searchable.** The search index now includes field values, so
   `satyr`, `revelry`, or `chaotic neutral` finds the right deities. Previously
   only names, summaries, tags, and bodies were indexed — which meant most of
   your deity data was invisible to search.

3. **Better link recall, less noise.** Short forms now resolve (`Bacchus` →
   *Bacchus, The Bountiful Spirit*), and generic page names (`Introduction`,
   `Notable`, `Military`) are excluded from auto-linking so they stop matching
   every page.

## Generated descriptions

Entries with no prose now get a description built from the properties they
already carry. **329 of the 365 empty entries** were filled this way:

| Kind | Described | Left alone |
| --- | --- | --- |
| Deities | 186 | 0 |
| Organizations | 75 | 1 |
| Locations | 68 | 22 |
| Families | 0 | 8 |
| Lore / ore / session / system | 0 | 5 |

### The rule

Every clause traces back to a real field value. Nothing invents history,
geography, motive, or appearance. Where an entry has nothing to work from, it is
left empty — **a stub is better than a fabrication.**

That's why 36 entries were skipped. The eight "families" are people (Duke
Roderick Caesar, Duchess Kivia Elea Caesar, Gavin Caesar…) whose only recorded
property is a Notion timestamp. Twenty-two locations carry no type tag, so their
nature is genuinely unknown. Writing anything for them would be making it up.

### What it reads like

> **Anytus, Titan of Order** — Known as Titan of Order, Anytus is counted among
> the ancient titans of the Aetherian pantheon. They hold sway over nature and
> order. Anytus keeps to order for its own sake — lawful neutral in alignment.

> **Abyssal Tideguard** — The Abyssal Tideguard is a military order of the
> Imperium Invicta, dedicated to Neptune. It stands with the Impartial, taking
> no side between virtue and shadow. Its existence is openly acknowledged.

> **Aeterna City** — Aeterna City is a city of the Imperium Invicta, and serves
> as its capital.

Phrasing varies between entries but is deterministic per entry, so re-running
the generator never churns the database.

### Staying in control

- Every generated entry is marked `body_source = 'generated'` and carries a
  visible banner on its page.
- **Editing one by hand clears the flag** — it becomes your writing.
- One command removes all of them and restores empty entries:
  `npm run describe -- --revert`
- Your own prose is never touched; the generator only ever writes to entries
  with an empty body.

## New entries written from your world

Your prose names dozens of people, places and institutions that never got a page.
**38 new entries** were written for them, plus **8 that fill an imported stub**
— taking the codex from 482 to **520 entries**.

Every one carries a `sourceNote` recording the page it was drawn from, and all
**117 wiki-links between them resolve** to real entries, so the new pages are
wired into the world rather than floating beside it.

| | |
| --- | --- |
| **People (15)** | Iovianus Sandarion · Quintus Arminius · Senator Aurelius Varric · Inquisitor Marcellus Falco · "R." the Rebel Historian · Selenarion of Helarchon · Pellion Meraquas · Astraphael · Elira · Kaelen Caerthain the Stormwall · Vaelis Caerthain · Deyric Caerthain · Commander Daud · Meagan Foster · Overseer Tarnak |
| **Places (17)** | Velothis · Eronis · Palace of Eronis · Irelas · Praetor's Fall · Cloudspine Ridge · Lake Serathal · Skyward Bastions · The Vaulted Court · Citadel Cathedral · its five temples · Healer's Sanctuary · The Dune Mines |
| **Organizations (6)** | The Immortals · The Argentar · The Serathian Fleet · The Council of Eronis · The Scholars · The Adamantine Line |
| **Lore (5)** | The Continental War · The Pact · Bound / Shifting / Anchored Rifts |
| **Items (3)** | Runes of Trust · Ledgerlocks · The Sovereign Star |

A few notes on what these were built from:

- **The Imperium's chronicle has four voices** — Varric wrote it, Falco annotated
  it, "R." rebutted him in the margins, and Arminius filed the result. Each is
  now a person with a page, and the disagreement between them is intact.
- **House Caerthain** turned out to be the richest seam: three named ancestors,
  a sacred lake with a secret, an airship fleet, a moveable fortress line, and a
  treaty signed in water. Lake Serathal and The Sovereign Star are marked DM-only.
- **Citadel Cathedral existed only as a database heading** with no page of its
  own — its five temples were orphans. It now has a page, and they hang off it.
- **The Adamantine Line** gained its two named officers, and the Dune Mines
  gained the foreman whose shafts have gone quiet.

### The 20 left empty

Deliberately. Most are near-duplicates that want merging rather than describing:

| Bare name | Almost certainly the same as |
| --- | --- |
| Aeterna | Aeterna City |
| Anticasta | Anticata |
| Atarabad | Atarabad City |
| Carianaea | Carianea |
| Delphara | Delphara City |
| Helarchon | Hellarchon City |
| Mithratal | Mithratal City |
| Persemenid | Persemenid City |
| Persevalis | Persevalis City |
| Qa'zshahr'in | Qa'zshahrv'in |
| Thebeseieas City | Thebesieas City |
| Xerastir | Xerastri City |
| Thessalonikan | Thessalonika City |

The bare-name versions came from the "The 3 Empires" folder, which is a plain
list; the fuller ones came from the Asetherian Database with tags. Merging them
is a judgement call about your world, so nothing was written into either.

The rest are `Introduction`, `Notable`, `Triggers`, `Information` (generic Notion
sub-page titles), `Anchoring Gems` (an ore with no recorded properties), a
session-log line, and your own note **"after this to delete for players"**.

## Data notes

Two things worth a look when you're next in the app:

- One organization's `Type` reads **"Magical Sociery"** (typo for Society). The
  generated text reproduces it faithfully rather than silently correcting your
  data.
- Several near-duplicate location names exist — *Thebeseieas City* /
  *Thebesieas City*, *Qa'zshahrv'in* / *Qa'zshahr'in*, *Carianaea* /
  *Carianea*, *Delphara* / *Delphara City*. These came through as separate
  entries because they're spelled differently; merge them if they're the same
  place.
