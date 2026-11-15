# Content licence ledger

Every batch of text in the codex, where it came from, and on what terms it is here. Decision Q1 of PLAN.md:
**new content comes only from licence-safe sources**; nothing is scraped from Wikidot, Reddit or GM Binder, whose
content belongs to its authors or to the publisher and carries no open licence.

## Sources currently in the codex

| Content | Source and terms | Where | Status |
|---|---|---|---|
| Asetheria setting: empires, deities, places, NPCs, organizations, lore, quests | The DM's own world, exported from Notion and Foundry (`data/world-seed.json`, `expansion.json`, `foundry-world.json`, `lore-population.json`, `city-locations.json`) | most entries | Owner's own work |
| **Natural world batches**: 40 ores, 60 plants, 60 animals | **Original writing for Asetheria**, grounded in public-domain facts (classical natural history, mineralogy, real species). The grounding is stated per entry in its DM notes under `Basis:`. No third-party text is reproduced. | `data/natural-world/*.json`, `sourcePath: original: natural-world/<batch>` | Cleared; guarded by `npm run verify:natural-world` and `tests/natural-world-import.spec.ts` |
| **New places and structures (100)**: mines, quarries, groves, habitats, forges, markets, shrines | **Original writing for Asetheria**; the setting is invented, the real-world grounding is the specimens they host. Each carries a DM-only `Hook:` note | `data/natural-world/places-*.json`, `sourcePath: original: natural-world/places-<n>` | Cleared; guarded by `npm run verify:natural-world` (parent whitelist, denylist, shape) |
| Earlier original fauna, flora and ores | Original, same method (`scripts/add-flora-fauna-ores.ts`, `add-named-creatures.ts`) | `scripts/` | Cleared |
| Bestiary base layer | System Reference Document 5.1, Wizards of the Coast, **CC BY 4.0**. Each entry carries an attribution line and links to the attribution note | `scripts/import-srd-monsters.ts`, `add-srd-attribution-note.ts` | Cleared (attribution in app) |
| Herbalism entries (20 plants) and the d20 field-guide table | Player-supplied reference material; the data file's own provenance mark says **"external GM Binder page"** (`data/homebrew/flora.json`). GM Binder content is the author's copyright and is not openly licensed | `data/homebrew/flora.json`, `sourcePath: homebrew: herbalism reference` | **Kept by the owner's decision** (2026-10-04, see below) |
| Metals and materials tables | Player-supplied reference table and lore (`data/homebrew/metals.json`); origin of the tables themselves is not recorded | `sourcePath: homebrew: metals & materials reference` | **Kept by the owner's decision** (2026-10-04); the supplier's right to share is the owner's call |
| **Planar metals (24 entries)** | Imported "per user request" from the GM Binder *Fantasy Metals Compendium* (`data/homebrew/planar-metals.json`, named in `tests/homebrew-content.spec.ts`) | `sourcePath: homebrew: Fantasy Metals Compendium (external)` | **Kept by the owner's decision** (2026-10-04, see below) |

**Decision recorded (2026-10-04): the owner chose to KEEP these three homebrew batches** (planar metals, the
herbalism plants and field-guide table, and the metals tables). They predate rule Q1 (licence-safe sources only
for *new* ingestion) and were imported earlier at the owner's request. Keeping them is the owner's call, made
knowing that the GM Binder pages they came from are not openly licensed; the site is private to the campaign and
the owner is responsible for having the right to use them. They are loaded into production with everything else.
Nothing here is changed or archived. The batch tool still works if that ever changes:
`npm run codex:archive-batch -- "homebrew: Fantasy Metals Compendium" --apply` and `--restore --apply` to undo.

## Excluded on purpose (never imported)
D&D Beyond packs, Beneos, Tom Cartos modules, DMDave's *Empusa's Underbelly*, *Bitesized Book of Spectacular Shops*,
Forgotten Adventures tokens (see `scripts/extract-foundry-world.ts` for the allowlist), and any text from Wikidot,
Reddit or GM Binder written after decision Q1.

## Real-world sources used as grounding (facts, not text)
Pliny the Elder, *Natural History*; Dioscorides, *De materia medica*; Theophrastus; Herodotus; Plutarch;
Vitruvius; Suetonius. These are public-domain and are cited only for facts (what a stone is, where it was mined,
what a plant does). Entries restate them in new words for the setting. Where a belief is folklore rather than fact,
the DM notes say so.

## Rules for adding content
1. Original writing, or a source whose licence permits reuse and redistribution (CC BY, CC0, public domain).
   Attribution travels with the entry: a visible line and a link to an attribution note.
2. Record the source in the entry's `sourcePath` and in this table.
3. Run `npm run verify:natural-world` (denylist and structure) before importing a data file.
4. A whole batch can be taken out again without deleting anything:
   `npm run codex:archive-batch -- "original: natural-world/ores-1" --apply` (and `--restore --apply` to bring it back).

## Landing page art (original text, public-domain paintings)
The public landing page (`/welcome`) is original text and layout written for this project
(`src/components/landing/`). Its remaining vector art (the ribbons, the three empires' banners) is original. The
text evokes a mood only: no name, place, character, image or line from any published work is used.
`tests/landing.spec.ts` scans the rendered page and the art's source for a list of protected titles and names and
fails if any appear.

Since the redesign of 2026-11-16 (chosen by the owner) the hero and the chapter cards use landscape paintings that
are in the **public domain** (their painters died well over a century ago; each file is tagged public domain on
Wikimedia Commons). They were downloaded from Commons, resized and re-encoded to WebP. Each is credited on the page
where it appears.

| File | Painting | Source |
|---|---|---|
| `public/landing/sierra.webp` | Albert Bierstadt, *Among the Sierra Nevada, California*, 1868 | Smithsonian American Art Museum, via Wikimedia Commons (Google Art Project scan), public domain |
| `public/landing/road.webp` | Thomas Moran, *Cliffs of the Upper Colorado River, Wyoming Territory*, 1882 | Smithsonian American Art Museum, via Wikimedia Commons, public domain |
| `public/landing/hearth.webp` | Thomas Cole, *Home in the Woods*, 1847 | Reynolda House Museum of American Art, via Wikimedia Commons, public domain |
| `public/landing/harbour.webp` | Claude Lorrain, *Seaport with the Embarkation of the Queen of Sheba*, 1648 | National Gallery, London, via Wikimedia Commons (Web Gallery of Art scan), public domain |

The landing's map, `public/landing/parchment-atlas.webp`, is the Dungeon Master's own parchment map of the continent
(`WIP Map.png`), finished on 2026-11-16 at the owner's request: every name, settlement and landmark from the owner's
colour map (`Aetheria.jpg`) was carried onto the parchment's geography, and forests, plains, hills, desert, sea
ripples, icons, frame, compass rose and legend were added in ink. All additions are original drawings made for this
project (no third-party map assets; the style references the owner shared were used for manner only). It is used for
the empire card crops and the "Your road is not drawn yet" chapter. The third-party city map of Helarchon in the repo
root (signed by another artist) is deliberately not used anywhere public.

## Not built, on purpose
An Open5e importer (OGL/CC documents) was listed as optional in PLAN.md Phase 4. It was not needed to reach the
promised counts and would add OGL Section 15 obligations. It can be added on request.
