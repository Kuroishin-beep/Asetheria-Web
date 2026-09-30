/**
 * Adds named creatures unique to Asetheria — the counterpart to the generic
 * SRD 5.1 reprints, which by design carry no narrative flavour and exclude
 * every creature Wizards of the Coast treats as brand-specific (beholders,
 * mind flayers, displacer beasts, and so on).
 *
 * Every creature here is grounded in real, ancient, public-domain mythology —
 * Persian, Greek, and Roman, matching the three empires' own basis — rather
 * than reproduced from any modern book or homebrew publication. A specific
 * creator's homebrew monsters are that creator's copyrighted creative work
 * regardless of how freely they are shared for reading, which is why none are
 * used as a source here; classical mythology, by contrast, predates any
 * copyright by millennia.
 *
 * Checked against the SRD import before writing: Lamia, Cockatrice, Gorgon,
 * Medusa, Manticore, Griffon, Basilisk, Chimera, Harpy, Roc, and Hydra are
 * already in the Bestiary as generic SRD reprints, so none of those are
 * duplicated here.
 *
 * Unlike the SRD imports, these carry full narrative bodies — that is the
 * entire point of a "named creature" layer — and are tied by wikilink into
 * locations, organisations, and deities the codex already has.
 *
 * Only creates entries whose name doesn't already exist.
 *
 * Run with:  npx tsx scripts/add-named-creatures.ts          (dry run)
 *            npx tsx scripts/add-named-creatures.ts --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { entries, links } from "../src/db/schema";
import { slugify } from "../src/lib/links";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");

for (const file of [".env.local", ".env"]) {
  const p = path.join(REPO, file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["'](.*)["']$/s, "$1");
    }
  }
}

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!url) {
  console.error("\n  DATABASE_URL is not set.\n");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const db = drizzle(neon(url), { schema });

type Creature = {
  name: string;
  summary: string;
  basis: string;
  cr: string;
  type: string;
  statblock: string;
  body: string;
  tags: string[];
};

const CREATURES: Creature[] = [
  {
    name: "The Simurgh of Vael'Tharan",
    summary:
      "An ancient bird the size of a war galley, feathered in bronze and copper, that has watched the plateau since before the Titans were put down. It answers questions. It rarely enjoys the answers.",
    basis:
      "The Simurgh of Persian mythology — an immense, ancient, benevolent bird of great wisdom, said to have lived long enough to have seen the world destroyed three times.",
    cr: "14",
    type: "Gargantuan celestial, lawful neutral",
    statblock: `**Armor Class** 19 (natural)
**Hit Points** 262 (21d20 + 42)
**Speed** 20 ft., fly 150 ft.

STR 24 (+7)   DEX 16 (+3)   CON 19 (+4)   INT 22 (+6)   WIS 24 (+7)   CHA 20 (+5)

**Saving Throws** WIS +13, CHA +11
**Skills** Arcana +12, History +18, Insight +13, Perception +13
**Damage Resistances** radiant; bludgeoning, piercing, and slashing from nonmagical attacks
**Condition Immunities** frightened
**Senses** truesight 120 ft., passive Perception 23
**Languages** all, telepathy 120 ft.
**Challenge** 14 (11,500 XP)

### Traits

**Legendary Resistance (3/Day).** If the Simurgh fails a saving throw, it can choose to succeed instead.

**Ancient Memory.** The Simurgh has witnessed the fall of the old kingdoms firsthand. It can recall, with perfect clarity, any event it has personally observed, however long ago.

**Feather of Healing.** Once per long rest, the Simurgh can pluck a feather and grant it to a creature it has judged worthy. The feather, when burned, casts *heal* on the burner, then crumbles to nothing.

### Actions

**Multiattack.** The Simurgh makes two talon attacks.

**Talon.** Melee Weapon Attack: +13 to hit, reach 15 ft., one target. Hit: 28 (4d10 + 7) slashing damage.

**Wingstorm (Recharge 5–6).** The Simurgh beats its wings, creating a hurricane in a 60-foot cone. Each creature in that area must succeed on a DC 20 Strength saving throw or take 33 (6d10) bludgeoning damage and be flung 30 feet away and knocked prone.

### Legendary Actions

**Detect.** The Simurgh makes a Wisdom (Perception) check.

**Judge.** The Simurgh forces one creature it can see within 60 feet to make a DC 18 Wisdom saving throw. On a failure, the creature is wracked with the memory of its worst deed and has disadvantage on attack rolls until the end of its next turn.

**Wingbeat (Costs 2 Actions).** The Simurgh makes one talon attack.`,
    body: `Persian tradition holds that the Simurgh has lived long enough to see the world end and remake itself three times over, and that it is old enough to have raised the first phoenix from an egg. Asetheria has only one, and it has not moved from [[Vael’Tharan Mountain]] in longer than any living record.

It is not hostile. It is also not interested in most of what mortals want from it. Petitioners who climb the mountain and wait — sometimes for weeks — are occasionally granted a single answer to a single question, delivered without warmth and without repetition. The Magi of [[Acheaoria]] maintain that every major shift in the empire's fortune was foretold by someone who climbed that mountain and did not like what they heard.

The scholars of [[The Sage's Archive]] have petitioned three times for an audience. The Simurgh has granted exactly one, and refuses to say what was asked.`,
    tags: ["Unique Creature", "Acheaorian", "Celestial", "Persian basis"],
  },
  {
    name: "The Div of Kharveth",
    summary:
      "A hulking, horned shape that the muqanni will not dig near and the satraps have stopped sending surveyors to find. Whatever lives in the mountain, it does not want company.",
    basis:
      "The div (daeva) of Persian and Zoroastrian-adjacent folklore — a malevolent spirit or demon of considerable size and strength, opposed to order and cultivation.",
    cr: "8",
    type: "Large fiend, chaotic evil",
    statblock: `**Armor Class** 16 (natural)
**Hit Points** 152 (16d10 + 64)
**Speed** 40 ft.

STR 22 (+6)   DEX 12 (+1)   CON 19 (+4)   INT 9 (-1)   WIS 14 (+2)   CHA 15 (+2)

**Saving Throws** STR +10, CON +8
**Damage Resistances** cold, fire; bludgeoning, piercing, and slashing from nonmagical attacks
**Damage Immunities** poison
**Condition Immunities** poisoned
**Senses** darkvision 120 ft., passive Perception 12
**Languages** Abyssal, understands Acheaorian but won't speak it
**Challenge** 8 (3,900 XP)

### Traits

**Water-Hater.** The div takes 1d6 extra damage of the same type whenever it is struck by an attack while standing in flowing water, and will not willingly enter a maintained qanat channel.

**Stone Sense.** The Div can pinpoint the location of any creature moving through solid rock within 60 feet of it, including through worked tunnels.

### Actions

**Multiattack.** The Div makes two claw attacks.

**Claw.** Melee Weapon Attack: +10 to hit, reach 5 ft., one target. Hit: 18 (2d10 + 6) slashing damage.

**Rockspeak Roar (Recharge 6).** The Div roars a word no mortal throat can properly shape. Each creature within 30 feet that can hear it must succeed on a DC 16 Wisdom saving throw or be frightened for 1 minute, repeating the save at the end of each of its turns.`,
    body: `Nothing has ever been officially confirmed to live inside [[Mountain of Kharveth]]. Nothing has ever been officially confirmed *not* to, either — which is precisely the problem the *muqanni* have with the place.

The pattern is consistent enough to take seriously. Shafts sunk near the mountain fail in ways that do not match the rock. Surveyors sent by three separate satraps returned with excellent measurements and no explanation for why the mountain's meltwater does not reach anywhere downhill of it in the quantity the snowfall should produce. [[The Qanat Network]]'s oldest hands have a phrase for the place that translates roughly to "the water there is already spoken for," and decline to elaborate further than that, in exactly the tone of people who know precisely what they mean and would rather not say it aloud.`,
    tags: ["Unique Creature", "Acheaorian", "Fiend", "Persian basis", "Mountain of Kharveth"],
  },
  {
    name: "The Peri of Persevalis",
    summary:
      "A slender, luminous figure glimpsed only after dark, moving between the terraces of the night gardens. Gardeners leave the gates open on the one night a year they know she will come.",
    basis:
      "The peri of Persian folklore — a beautiful, supernatural being, originally cast out of paradise, generally benevolent toward mortals and associated with beauty, gardens, and guidance.",
    cr: "3",
    type: "Medium fey, chaotic good",
    statblock: `**Armor Class** 15
**Hit Points** 66 (12d8 + 12)
**Speed** 30 ft., fly 60 ft.

STR 10 (+0)   DEX 20 (+5)   CON 13 (+1)   INT 15 (+2)   WIS 17 (+3)   CHA 19 (+4)

**Skills** Perception +5, Persuasion +8, Stealth +9
**Senses** darkvision 60 ft., passive Perception 15
**Languages** Common, Sylvan, telepathy 30 ft.
**Challenge** 3 (700 XP)

### Traits

**Innate Spellcasting.** The peri's spellcasting ability is Charisma (spell save DC 16). She can innately cast the following spells, requiring no material components:
At will: *dancing lights, minor illusion*
3/day each: *charm person, sleep*
1/day: *invisibility* (self only)

**Garden-Bound.** The peri cannot willingly travel more than one mile from cultivated, tended ground.

### Actions

**Beguiling Touch.** Melee Spell Attack: +8 to hit, reach 5 ft., one creature. Hit: 13 (3d8) psychic damage, and the target must succeed on a DC 16 Wisdom saving throw or be charmed for 1 minute.`,
    body: `The gardeners of [[Persevalis City]] do not discuss her with outsiders, but every terrace family knows to leave one gate unlatched during the Night Gardens festival, and knows better than to ask why the lamps in that particular garden burn low and blue rather than warm and gold.

She is not dangerous, by every account passed down. She has led lost children back to the terraces, warned a gardener off a collapsing wall moments before it fell, and once — the story is old enough that no one can name the family it happened to — spent a night teaching a dying woman's grief-numbed hands how to graft again. What she wants in return has never been fully agreed upon. The families who claim to have hosted her insist she asked for nothing. The families who claim someone they knew hosted her are less certain.`,
    tags: ["Unique Creature", "Acheaorian", "Fey", "Persian basis", "Persevalis City"],
  },
  {
    name: "The Eclipsed Empousa",
    summary:
      "A beautiful stranger with one leg of bronze and one of a donkey, who feeds on travellers too charmed to notice what is wrong until it is far too late.",
    basis:
      "The empousa of Greek mythology — a shape-shifting female spirit in Hecate's retinue, appearing as a beautiful woman to lure and feed on travellers, with a bronze leg and a donkey's leg as the one telltale flaw in her disguise.",
    cr: "6",
    type: "Medium fiend (shapechanger), neutral evil",
    statblock: `**Armor Class** 15 (natural)
**Hit Points** 97 (13d8 + 39)
**Speed** 30 ft.

STR 14 (+2)   DEX 17 (+3)   CON 17 (+3)   INT 13 (+1)   WIS 14 (+2)   CHA 20 (+5)

**Skills** Deception +9, Insight +6, Perception +6, Persuasion +9
**Damage Resistances** cold, fire
**Senses** darkvision 60 ft., passive Perception 16
**Languages** Common, Infernal
**Challenge** 6 (2,300 XP)

### Traits

**Shapechanger.** The empousa can use her action to polymorph into a beautiful Medium or Small humanoid, or back into her true form. Her statistics are the same in each form, except her legs — one bronze, one that of a donkey — never change, and a successful DC 16 Wisdom (Perception) check reveals them beneath a disguise, hem, or shadow.

**Charm Gaze.** When a creature that can see the empousa's true face starts its turn within 30 feet of her, she can force it to make a DC 16 Wisdom saving throw if she isn't incapacitated and can see it. On a failure, the creature is charmed until the empousa dies or until it is on a different plane of existence.

### Actions

**Multiattack.** The empousa makes two claw attacks, or one claw attack and one bite attack against a charmed creature.

**Claw.** Melee Weapon Attack: +6 to hit, reach 5 ft., one target. Hit: 11 (2d6 + 4) slashing damage.

**Bite (Charmed Target Only).** Melee Weapon Attack: +6 to hit, reach 5 ft., one charmed creature. Hit: 16 (3d8 + 3) piercing damage, and the empousa regains hit points equal to half the damage dealt.`,
    body: `The [[The Eclipsed Mirror]] denies knowing what an empousa actually is, in precisely the way an organisation denies something it has looked into rather closely. Its members work at the threshold — doorways, crossings, the moment one state becomes another — and an empousa's disguise is exactly that kind of threshold worn as a face.

She serves [[Hecate, The Mistress of the Arcane]] and hunts on the roads between one city and the next, favouring travellers alone and travellers in love, and the one reliable warning is the oldest one: look at her feet. A companion who will not let you see below the hem is a companion worth a second look, in daylight, before the road gets any darker.`,
    tags: ["Unique Creature", "Hellenorian", "Fiend", "Greek basis", "The Eclipsed Mirror"],
  },
  {
    name: "The Cerynitian Hind",
    summary:
      "A deer with antlers of gold and hooves of bronze, said to outrun any arrow ever loosed at it. It has been sighted and never once caught.",
    basis:
      "The Cerynitian Hind of Greek myth — a sacred deer of Artemis with golden antlers, famed for its speed, which Heracles was tasked to capture (not kill) alive as one of his labours.",
    cr: "1",
    type: "Large fey, unaligned",
    statblock: `**Armor Class** 15
**Hit Points** 45 (6d10 + 12)
**Speed** 90 ft.

STR 14 (+2)   DEX 20 (+5)   CON 15 (+2)   INT 4 (-3)   WIS 15 (+2)   CHA 12 (+1)

**Skills** Perception +6, Stealth +9
**Senses** passive Perception 16
**Languages** —
**Challenge** 1 (200 XP)

### Traits

**Sacred.** A creature that kills the Hind — rather than merely subduing it — is cursed: it has disadvantage on all Wisdom (Survival) checks made to track or hunt any creature for one year and one day.

**Impossible Turn of Speed.** The Hind's speed cannot be reduced below its base value by any effect, and it automatically succeeds on any saving throw against being restrained or grappled by a spell or magical trap.

**Keen Hearing.** The Hind has advantage on Wisdom (Perception) checks that rely on hearing.

### Actions

**Antlers.** Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 7 (1d6 + 2) piercing damage.

### Reactions

**Bolt.** When the Hind takes damage, it can immediately move up to its speed without provoking opportunity attacks.`,
    body: `The [[Verdant Sentinel Order]] does not hunt her, has never hunted her, and takes it as a point of professional pride that no warden ever will. She belongs to [[Diana, The Guardian fo the Grove]] and is understood by every wood on the continent to be the goddess's own proof that speed, correctly applied, is a better defence than any wall.

She has been sighted in half a dozen provinces, always alone, always at a dead run, and always — this is the detail every witness agrees on independently — glancing back at whoever is watching, as if checking whether the chase is actually going to start. So far, across every century anyone has bothered to record, it never has.`,
    tags: ["Unique Creature", "Invictian", "Fey", "Greek basis", "Verdant Sentinel Order"],
  },
  {
    name: "The Ophiotaurus",
    summary:
      "A creature with the forequarters of a black bull and the hindquarters of a serpent, that the Titans are said to have wanted killed above all other things. It has never been found.",
    basis:
      "The Ophiotaurus of Greek myth (recorded by Ovid) — a bull-serpent whose entrails, if burned as sacrifice, were prophesied to grant the power to overthrow the gods.",
    cr: "4",
    type: "Huge monstrosity, unaligned",
    statblock: `**Armor Class** 14 (natural)
**Hit Points** 68 (8d12 + 16)
**Speed** 30 ft., swim 40 ft.

STR 19 (+4)   DEX 10 (+0)   CON 15 (+2)   INT 3 (-4)   WIS 12 (+1)   CHA 6 (-2)

**Skills** Perception +3, Stealth +4
**Senses** darkvision 60 ft., passive Perception 13
**Languages** —
**Challenge** 4 (1,100 XP)

### Traits

**Amphibious.** The Ophiotaurus can breathe air and water.

**Prophetic Entrails.** A creature that kills the Ophiotaurus and burns its entrails within one hour gains the effect of a *wish* spell, once, immediately — but the offer is known to every fiend, celestial, and Titan-touched being within a hundred miles, all of whom will move to stop the ritual by any means available.

### Actions

**Multiattack.** The Ophiotaurus makes one gore attack and one tail attack.

**Gore.** Melee Weapon Attack: +7 to hit, reach 5 ft., one target. Hit: 14 (2d8 + 5) piercing damage.

**Tail.** Melee Weapon Attack: +7 to hit, reach 10 ft., one target. Hit: 11 (2d6 + 4) bludgeoning damage, and the target is grappled (escape DC 15).`,
    body: `The pantheons agree on very little about the Titans, but they agree entirely on this: somewhere on the continent, in a lake or a marsh or a sea cave no one has found, there is a creature whose death would let a mortal hand undo whatever was done to put the Titans down.

Nothing has ever confirmed it exists here rather than merely in the old stories carried over from before the pantheons settled. That has not stopped every Titan-descended cult, every ambitious mage, and at least one Acheaorian satrap from funding an expedition to look. None has come back with anything but the story of a black shape seen once, at a distance, in water too deep to follow it into.`,
    tags: ["Unique Creature", "Continental", "Monstrosity", "Greek basis", "Titans"],
  },
  {
    name: "Talos of Duneforged",
    summary:
      "A guardian of bronze taller than the citadel gate, that has walked the walls of Duneforged three times a day for longer than any family now living has kept records.",
    basis:
      "Talos of Greek mythology — a giant bronze automaton, forged by Hephaestus, that circled the island of Crete three times daily to guard it, animated by a single vital fluid sealed with a bronze nail at its ankle.",
    cr: "15",
    type: "Gargantuan construct, lawful neutral",
    statblock: `**Armor Class** 20 (natural)
**Hit Points** 230 (20d20 + 20)
**Speed** 40 ft.

STR 26 (+8)   DEX 9 (-1)   CON 20 (+5)   INT 6 (-2)   WIS 12 (+1)   CHA 3 (-4)

**Damage Immunities** poison, psychic; bludgeoning, piercing, and slashing from nonmagical attacks that aren't adamantine
**Condition Immunities** charmed, exhaustion, frightened, paralyzed, petrified, poisoned
**Senses** darkvision 120 ft., passive Perception 11
**Languages** understands Invictian but can't speak
**Challenge** 15 (13,000 XP)

### Traits

**Immutable Form.** Talos is immune to any spell or effect that would alter its form.

**Magic Resistance.** Talos has advantage on saving throws against spells and other magical effects.

**The Ankle Seal.** Talos's single vital point is a bronze nail at its ankle. A creature that can see the nail and succeeds on a DC 20 Wisdom (Perception) check to identify it may, as an action, attempt a DC 22 Dexterity check with thieves' tools to draw it; success reduces Talos to 0 hit points immediately, with no saving throw.

### Actions

**Multiattack.** Talos makes two slam attacks.

**Slam.** Melee Weapon Attack: +13 to hit, reach 10 ft., one target. Hit: 30 (4d12 + 8) bludgeoning damage.

**Molten Grasp (Recharge 5–6).** Talos's body glows white-hot for one round. Any creature grappled by it or that hits it with a melee attack while it glows takes 22 (4d10) fire damage.`,
    body: `The founding charters of the [[Duneforged Citadel]] describe a guardian raised at the citadel's founding and never once switched off, though no living smith admits to knowing how to switch it on again if it ever were. It walks the outer wall on a fixed circuit, three times between dawn and dusk, and has not deviated from that pattern within any record the [[The Sage's Archive]] holds.

The [[Forge of Vulcan]]'s priesthood maintains that Talos was raised by the god's own hand at the citadel's founding and is, in the strictest sense, older than the Caesar house that now rules there. Whether that is devotional colour or literal history, the guardian has never once needed repair, and the smiths have quietly agreed among themselves never to test what would happen if someone found the nail.`,
    tags: ["Unique Creature", "Invictian", "Construct", "Greek basis", "Duneforged Citadel"],
  },
  {
    name: "Charybdis of the Reach",
    summary:
      "A whirlpool that should not exist where it exists, three times a day, on no schedule the tide can explain. Ships that enter it do not come back to describe what is at the bottom.",
    basis:
      "Charybdis of Greek mythology — a monstrous whirlpool, opposite the equally lethal Scylla, said to swallow and disgorge the sea three times a day.",
    cr: "17",
    type: "Gargantuan monstrosity (titan), chaotic evil",
    statblock: `**Armor Class** 17 (natural)
**Hit Points** 297 (17d20 + 119)
**Speed** 0 ft., swim 40 ft.

STR 27 (+8)   DEX 12 (+1)   CON 25 (+7)   INT 5 (-3)   WIS 14 (+2)   CHA 9 (-1)

**Saving Throws** CON +14
**Damage Resistances** bludgeoning, piercing, and slashing from nonmagical attacks
**Damage Immunities** cold
**Senses** blindsight 120 ft. (blind beyond this radius), passive Perception 12
**Languages** —
**Challenge** 17 (18,000 XP)

### Traits

**The Reach's Own.** Charybdis cannot move from the strait she inhabits and does not exist outside the hours she draws the sea down; she can only be encountered during the three tidal surges she creates each day.

**Amphibious.** Charybdis can breathe air and water.

### Actions

**Multiattack.** Charybdis makes one bite attack and uses Swallow the Sea.

**Bite.** Melee Weapon Attack: +15 to hit, reach 20 ft., one target. Hit: 32 (5d10 + 8) piercing damage.

**Swallow the Sea (Recharge 5–6).** Charybdis draws the water inward. Each creature and vessel within 120 feet must succeed on a DC 22 Strength saving throw or be pulled 60 feet toward her and, if it ends this movement within 20 feet of her, be swallowed. A swallowed creature is restrained, has total cover against attacks from outside, and takes 21 (6d6) bludgeoning damage at the start of each of Charybdis's turns. She can hold up to two Large creatures, or their equivalent, swallowed at a time.`,
    body: `Pilots of [[Aeolus Reach]] keep a chart of Charybdis's surges as carefully as they keep the wind chart, and the two are related in ways no natural philosopher of [[Hellenoria]] has ever managed to explain to anyone's satisfaction. She draws the strait down to bare rock, holds it for the length of a held breath, and then gives it back all at once.

Whether Charybdis is a beast, a Titan gone unrecorded in the pantheon's own ledgers, or simply what the sea does in a place too old to argue with, no scholar has settled — and the *Amphictyony* has, on two occasions, quietly declined a petition to fund an expedition to find out, on the grounds that the strait has never yet failed to give ships fair warning, and no one is anxious to test whether it would keep doing so if provoked.`,
    tags: ["Unique Creature", "Hellenorian", "Monstrosity", "Greek basis", "Aeolus Reach"],
  },
  {
    name: "The Strix",
    summary:
      "An owl too large, too silent, and too interested in the sound of a sleeping household. Farmers leave iron nails over the threshold and do not ask why the custom works.",
    basis:
      "The strix (plural striges) of Roman folklore — a bird of ill omen, sometimes held to be a transformed witch, that fed on the blood or entrails of sleeping infants at night.",
    cr: "2",
    type: "Medium monstrosity, neutral evil",
    statblock: `**Armor Class** 14
**Hit Points** 39 (6d8 + 12)
**Speed** 10 ft., fly 60 ft.

STR 10 (+0)   DEX 18 (+4)   CON 15 (+2)   INT 11 (+0)   WIS 15 (+2)   CHA 13 (+1)

**Skills** Perception +6, Stealth +8
**Senses** darkvision 120 ft., passive Perception 16
**Languages** understands Invictian but can't speak
**Challenge** 2 (450 XP)

### Traits

**Flyby.** The strix doesn't provoke opportunity attacks when it flies out of an enemy's reach.

**Silent Wings.** The strix's flight is utterly silent; it has advantage on Dexterity (Stealth) checks made while flying.

**Iron-Warded.** The strix cannot approach within 5 feet of cold iron placed with intent, such as a nail driven over a threshold.

### Actions

**Talons.** Melee Weapon Attack: +6 to hit, reach 5 ft., one creature. Hit: 7 (1d6 + 4) slashing damage, and the strix latches on; on subsequent turns it automatically deals this damage again without a new attack roll unless removed (DC 13 Strength check as an action).`,
    body: `Rural [[Imperium Invicta]] takes the strix seriously in a way the capital finds embarrassing to discuss and quietly does anyway — every farmhouse nailed shutter and every iron-studded threshold on the Latium Plains owes something to it.

The old distinction, kept mostly by grandmothers, is that a strix is not born a strix. It is a woman who did something unforgivable, or had something unforgivable done to her, and stopped being entirely human afterward. Whether that is true of any specific bird troubling any specific farm has never once been confirmed, because no one has ever caught one to ask.`,
    tags: ["Unique Creature", "Invictian", "Monstrosity", "Roman basis"],
  },
  {
    name: "The Sanctum Sphinx",
    summary:
      "A guardian with a lion's body, a woman's face, and wings kept perfectly still until spoken to. It has one question for every visitor, and a fixed policy about the ones who cannot answer.",
    basis:
      "The Greek Sphinx — a riddling guardian, part lion and part woman, that killed those who failed to answer its riddle, most famously outside Thebes.",
    cr: "11",
    type: "Large monstrosity, lawful neutral",
    statblock: `**Armor Class** 17 (natural)
**Hit Points** 199 (19d10 + 95)
**Speed** 40 ft., fly 60 ft.

STR 22 (+6)   DEX 15 (+2)   CON 20 (+5)   INT 20 (+5)   WIS 18 (+4)   CHA 20 (+5)

**Saving Throws** INT +10, WIS +9, CHA +10
**Skills** Arcana +10, History +15, Perception +9, Religion +10
**Damage Immunities** psychic; bludgeoning, piercing, and slashing from nonmagical attacks
**Senses** truesight 120 ft., passive Perception 19
**Languages** all
**Challenge** 11 (7,200 XP)

### Traits

**Inscrutable.** The Sphinx is immune to any effect that would sense its emotions or read its thoughts, as well as to *divination* spells.

**Ask One Question.** Any creature that speaks to the Sphinx and is answered honestly may ask exactly one question in return, which the Sphinx must answer truthfully to the best of its knowledge.

**Magic Resistance.** The Sphinx has advantage on saving throws against spells and other magical effects.

### Actions

**Multiattack.** The Sphinx makes two claw attacks.

**Claw.** Melee Weapon Attack: +11 to hit, reach 5 ft., one target. Hit: 16 (2d10 + 6) slashing damage.

**Roar of Judgment (1/Day).** The Sphinx unleashes a roar audible for a mile. Every creature within 60 feet that has knowingly lied to the Sphinx within the last hour must succeed on a DC 18 Wisdom saving throw or be paralyzed with dread for 1 minute.`,
    body: `The [[Alexandria Sanctum]] keeps a permanent guardian for the deep-shelved copies, and the librarians have made their peace with the fact that it is not, strictly, theirs. It arrived — nobody now serving remembers exactly when — and it has never once been asked to leave, because no one has found a way to ask that it would agree to.

Its arrangement with the Sanctum is simple and has never been renegotiated: it may put one question to anyone who wishes to enter the deep stacks, and a wrong answer means the stacks stay closed to that visitor forever, not merely that day. What counts as a wrong answer is entirely at its discretion. The librarians have learned not to argue the ruling, mostly because the one recorded argument ended with the questioner correctly identified as having lied about something else entirely, three questions earlier.`,
    tags: ["Unique Creature", "Continental", "Monstrosity", "Greek basis", "Alexandria Sanctum"],
  },
  {
    name: "The Ash Phoenix",
    summary:
      "A bird of flame-coloured plumage that dies, without fail, once in a very long lifetime — and is reborn from its own ashes within the day, smaller and brighter than before.",
    basis:
      "The phoenix of Greek (and more broadly Mediterranean and Egyptian) mythology — a bird that dies in fire or of old age and is reborn from its own ashes, a cycle repeated across an immense lifespan.",
    cr: "8",
    type: "Large celestial, neutral good",
    statblock: `**Armor Class** 18 (natural)
**Hit Points** 135 (18d10 + 36)
**Speed** 20 ft., fly 90 ft.

STR 16 (+3)   DEX 18 (+4)   CON 15 (+2)   INT 10 (+0)   WIS 17 (+3)   CHA 17 (+3)

**Damage Resistances** necrotic, radiant
**Damage Immunities** fire
**Senses** truesight 120 ft., passive Perception 13
**Languages** understands Invictian, Hellenorian, and Acheaorian but can't speak
**Challenge** 8 (3,900 XP)

### Traits

**Rebirth.** If the phoenix dies, its body turns to ash. At the start of its next long rest cycle — or after 24 hours, whichever the DM judges appropriate to the story — a new, identical phoenix egg forms in the ashes and hatches within a day, at full hit points.

**Fire Aura.** At the start of each of the phoenix's turns, each creature within 5 feet of it takes 7 (2d6) fire damage.

### Actions

**Multiattack.** The phoenix makes two talon attacks.

**Talon.** Melee Weapon Attack: +7 to hit, reach 5 ft., one target. Hit: 10 (2d6 + 3) slashing damage plus 7 (2d6) fire damage.

**Sunburst (Recharge 5–6).** The phoenix's plumage flares blindingly. Each creature within 30 feet that can see it must succeed on a DC 15 Constitution saving throw or be blinded for 1 minute, and takes 18 (4d8) radiant damage on a failed save, or half as much on a success.`,
    body: `[[Helionyx City]] claims the phoenix as its own emblem for the plainest possible reason: something that dies in fire and comes back brighter has never needed to explain itself to a city built entirely around the sun.

Sightings are rare enough that each one is recorded formally by the solar precinct, and the record shows a curious pattern — every confirmed death coincides, within a day, with an unusually significant event somewhere on the continent. Whether the phoenix is reacting to the world or the world is reacting to the phoenix is a question the precinct has stopped trying to resolve and started simply logging.`,
    tags: ["Unique Creature", "Hellenorian", "Celestial", "Greek basis", "Helionyx City"],
  },
  {
    name: "The Lemures",
    summary:
      "Restless, formless dead who were never properly laid to rest, driven from a household one bean at a time on the one night a year the rite still matters.",
    basis:
      "The lemures of Roman religion — malevolent, wandering spirits of the improperly buried or unremembered dead, ritually placated and expelled during the real Roman festival of Lemuria.",
    cr: "1/2",
    type: "Medium undead, chaotic evil",
    statblock: `**Armor Class** 12
**Hit Points** 22 (4d8 + 4)
**Speed** 30 ft., fly 30 ft. (hover)

STR 6 (-2)   DEX 14 (+2)   CON 13 (+1)   INT 6 (-2)   WIS 10 (+0)   CHA 12 (+1)

**Damage Resistances** acid, cold, fire, lightning, thunder; bludgeoning, piercing, and slashing from nonmagical attacks
**Damage Immunities** necrotic, poison
**Condition Immunities** charmed, exhaustion, frightened, grappled, paralyzed, petrified, poisoned, prone, restrained
**Senses** darkvision 60 ft., passive Perception 10
**Languages** understands the languages it knew in life but can't speak
**Damage** —
**Challenge** 1/2 (100 XP)

### Traits

**Incorporeal Movement.** The lemures can move through other creatures and objects as if they were difficult terrain. It takes 5 (1d10) force damage if it ends its turn inside an object.

**Bean-Warded.** A handful of black beans, thrown behind oneself while walking away from the lemures and not looking back, forces it to spend its next turn gathering them instead of acting.

### Actions

**Withering Touch.** Melee Spell Attack: +4 to hit, reach 5 ft., one creature. Hit: 9 (2d8) necrotic damage.`,
    body: `Any household in [[Imperium Invicta]] that has lost someone without a proper rite, or lost someone whose name has simply been forgotten by everyone left, risks one of these. They do not attack so much as linger — cold spots, spoiled food, a sense of being watched in an empty room — and grow more insistent the longer they are ignored.

The remedy is old and specifically the same one kept for two thousand years: at midnight, walk through the house barefoot, throw black beans over your shoulder without looking back, and repeat the words *nine times*. Whether the words matter or the beans do is a question no household has ever tested by leaving one out, on the grounds that it costs nothing to do both.`,
    tags: ["Unique Creature", "Invictian", "Undead", "Roman basis"],
  },
];

async function main() {
  const rows = await db
    .select({ id: entries.id, name: entries.name })
    .from(entries)
    .where(sql`${entries.archivedAt} is null`);
  const byName = new Map(rows.map((r) => [r.name.trim().toLowerCase(), r]));

  type Plan = {
    slug: string;
    name: string;
    summary: string;
    body: string;
    fields: Record<string, string>;
    tags: string[];
  };
  const plan: Plan[] = [];
  const skipped: string[] = [];

  for (const c of CREATURES) {
    if (byName.has(c.name.trim().toLowerCase())) {
      skipped.push(c.name);
      continue;
    }
    plan.push({
      slug: slugify(c.name),
      name: c.name,
      summary: c.summary,
      body: c.body,
      fields: { cr: c.cr, type: c.type, statblock: c.statblock },
      tags: c.tags,
    });
  }

  console.log(`\n  defined  : ${CREATURES.length}`);
  console.log(`  existing : ${skipped.length}${skipped.length ? " -> " + skipped.join(", ") : ""}`);
  console.log(`  to create: ${plan.length}\n`);
  for (const p of plan) console.log(`    ${p.name.slice(0, 34).padEnd(36)} CR ${p.fields.cr.padEnd(4)} ${p.tags.join(", ")}`);

  if (!APPLY) {
    console.log("\n  Dry run. Re-run with --apply to create these entries.\n");
    return;
  }

  const created: { id: string; name: string; body: string }[] = [];
  for (const p of plan) {
    const [row] = await db
      .insert(entries)
      .values({
        slug: p.slug,
        kind: "creature",
        name: p.name,
        summary: p.summary,
        body: p.body,
        fields: p.fields,
        tags: p.tags,
        visibility: "public",
      })
      .returning({ id: entries.id, name: entries.name, body: entries.body });
    created.push(row);
  }

  // Resolve [[Wikilinks]] in the new bodies.
  const all = await db.select({ id: entries.id, name: entries.name }).from(entries);
  const allByName = new Map(all.map((e) => [e.name.trim().toLowerCase(), e.id]));
  let linked = 0;
  const missing: string[] = [];
  for (const row of created) {
    for (const name of new Set([...row.body.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].trim()))) {
      const targetId = allByName.get(name.toLowerCase());
      if (!targetId) {
        missing.push(`${row.name} -> [[${name}]]`);
        continue;
      }
      await db.insert(links).values({ sourceId: row.id, targetId, relation: "mentions" }).onConflictDoNothing();
      linked++;
    }
  }

  console.log(`\n  Created ${created.length} named creatures, ${linked} links resolved.`);
  if (missing.length) console.log(`  unresolved: ${missing.join(", ")}`);
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
