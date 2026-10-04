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
| Herbalism entries (20 plants) and the d20 field-guide table | Player-supplied reference material; the data file's own provenance mark says **"external GM Binder page"** (`data/homebrew/flora.json`). GM Binder content is the author's copyright and is not openly licensed | `data/homebrew/flora.json`, `sourcePath: homebrew: herbalism reference` | **Needs your decision** (see below) |
| Metals and materials tables | Player-supplied reference table and lore (`data/homebrew/metals.json`); origin of the tables themselves is not recorded | `sourcePath: homebrew: metals & materials reference` | **Needs your decision**: confirm the supplier could share them |
| **Planar metals (24 entries)** | Imported "per user request" from the GM Binder *Fantasy Metals Compendium* (`data/homebrew/planar-metals.json`, named in `tests/homebrew-content.spec.ts`) | `sourcePath: homebrew: Fantasy Metals Compendium (external)` | **Needs your decision** (see below) |

**The decision (these three homebrew batches predate Q1).** They were imported earlier at your request, so this
is not a mistake to hide; it is a conflict with the rule you set for new content. Options per batch: (a) keep, if
you have the author's permission; (b) rewrite as original entries (the natural-world method) and archive the
originals; (c) archive now. Each is reversible with the batch tool, for example
`npm run codex:archive-batch -- "homebrew: Fantasy Metals Compendium" --apply` and `--restore --apply` to bring it
back. Nothing here is archived or changed without your answer.

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

## Not built, on purpose
An Open5e importer (OGL/CC documents) was listed as optional in PLAN.md Phase 4. It was not needed to reach the
promised counts and would add OGL Section 15 obligations. It can be added on request.
