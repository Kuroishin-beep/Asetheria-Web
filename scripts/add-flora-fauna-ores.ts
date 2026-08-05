/**
 * Adds original fauna, flora, and ores/minerals.
 *
 * Flora & Fauna had three entries, all fungi, and zero actual animals. Ores
 * had nine. Both are expanded here the same way as every other original batch
 * this session: a real animal, plant, or mineral supplies the grounding fact,
 * and the entry is written into Asetheria from there. The Geese of Juno are a
 * real, specific, well-documented event (Livy's account of 390 BC); Silphium
 * is a real plant that really did go extinct from overharvesting in
 * antiquity; electrum coinage and the Almadén-style cinnabar mines are real
 * economic history, not invented.
 *
 * Matches the existing field convention for these two kinds exactly: `body`
 * stays empty, `summary` and `fields.description` carry the same text, and
 * `fields.properties` / `fields.effects` use the source data's "• " bulleted
 * style rather than markdown lists, since these fields render as plain text,
 * not through the Markdown pipeline.
 *
 * Only creates entries whose name doesn't already exist.
 *
 * Run with:  npx tsx scripts/add-flora-fauna-ores.ts          (dry run)
 *            npx tsx scripts/add-flora-fauna-ores.ts --apply
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

type Flora = {
  name: string;
  scientificName: string;
  description: string;
  effects: string;
  lore: string;
  basis: string;
  tags: string[];
};

type Ore = {
  name: string;
  description: string;
  location: string;
  properties: string;
  uses: string;
  lore: string;
  basis: string;
  tags: string[];
};

const FAUNA: Flora[] = [
  {
    name: "Aeolian Petrel",
    scientificName: "Procellaria aeolis",
    description:
      "A slate-grey seabird, smaller than a gull, that skims so close to the water its wingtips seem to walk on the waves. It is almost never seen resting — sailors of Aeolus Reach say it has not landed in living memory.",
    effects:
      "• Appears in numbers ahead of a genuine storm system, reliably enough that coastal watch-posts log sightings as a warning.\n• A feather kept dry aboard ship is held to calm seasickness; there is no evidence this is more than custom.\n• Nests only on cliff faces no boat can approach, so eggs and chicks have never been examined.",
    lore:
      "Named for [[Aeolus Reach]], where it is thickest. Pilots say the petrel is let out of the strait along with the wind, and that a ship overtaken by petrels flying inland rather than out to sea should turn back immediately — the wind due is not one on the chart.",
    basis:
      "Real storm-petrels (family Hydrobatidae), long called 'Mother Carey's chickens' by sailors and treated as a genuine, still-used weather sign.",
    tags: ["Fauna", "Hellenorian", "Aeolus Reach"],
  },
  {
    name: "The Geese of Juno",
    scientificName: "Anser sacer",
    description:
      "White geese kept within the precinct of every temple to Juno, fed at public expense and never eaten, never sold, never allowed to leave consecrated ground.",
    effects:
      "• Notoriously alert: geese kept this way wake and clamour at the first sign of an intruder, more reliably than a dog, which does not bark at what it cannot smell over consecrated incense.\n• A temple's geese are counted every morning by the priesthood; a missing goose is treated as an omen worth investigating before it is treated as a loss.",
    lore:
      "The custom is kept because it once worked. When a raiding force scaled the Capitoline wall of [[Aeterna City]] by night, the watchdogs slept through it and the garrison's own sentries missed it — the geese did not, and their noise woke the defenders in time. The Imperium has fed Juno's geese at public expense ever since, and no temple has let its flock lapse in nine centuries, war or no war.",
    basis:
      "A real, specifically dated event: the sacred geese of Juno on Rome's Capitoline Hill are credited by Livy with waking the garrison during a Gallic night assault in 390 BC, after the guard dogs failed to.",
    tags: ["Fauna", "Invictian", "Imperium Invicta"],
  },
  {
    name: "Qanat Newt",
    scientificName: "Proteus subterraneus",
    description:
      "Pale, nearly translucent, and blind — its eyes never developed past two dark specks under the skin. Found only in the still pools of maintained qanat channels, and nowhere its water has ever seen the sun.",
    effects:
      "• Extremely sensitive to water quality; a channel where the newts have died off or vanished is checked for contamination before anything else.\n• Slow-growing and long-lived — a *muqanni* family will recognise the same newt in the same pool across a working lifetime.\n• Harmless to handle. Eating one is considered ill luck rather than dangerous, though no one seems to have tested the belief.",
    lore:
      "Found wherever [[The Qanat Network]] runs, and taken as a sign the channel is sound. The *muqanni* consider a pool with no newts in it a pool that has stopped truly being alive, whatever the water tests say.",
    basis:
      "Modelled directly on the olm (Proteus anguinus), the real blind cave salamander of the Balkans, which lives its whole life in permanent darkness and is famously sensitive as a water-quality indicator.",
    tags: ["Fauna", "Acheaorian", "The Qanat Network"],
  },
  {
    name: "Malaunian Saiga",
    scientificName: "Antilope malaunia",
    description:
      "A steppe antelope with an oddly swollen, drooping snout, built to warm the freezing winter air before it reaches the lungs and filter the dust of a summer stampede. Herds move in their thousands across the open grass.",
    effects:
      "• The horns are ground for use in cooling fever remedies across all three empires — one of the very few goods every apothecary tradition agrees on.\n• Herds migrate in enormous, unpredictable numbers; a column that meets one crossing its path can lose a day waiting it out.\n• The nose is not decorative: in a dust storm, saiga herds are the only large animals on the steppe that keep moving at speed.",
    lore:
      "The [[Malaunian Steppe]] horse clans will not hunt a herd mid-migration, holding that a saiga taken from a moving herd carries the herd's ill luck home with it. Taken at rest, it carries none.",
    basis:
      "The real saiga antelope (Saiga tatarica) of the Central Asian steppe, whose distinctive swollen nose genuinely functions as a warming and filtering organ, and whose horn is used across real traditional medicine.",
    tags: ["Fauna", "Continental", "Malaunian Steppe"],
  },
  {
    name: "Tabrishi'ir Silkmoth",
    scientificName: "Bombyx tabrishi",
    description:
      "A heavy-bodied, flightless moth, cream-white, kept entirely in captivity — it has not survived in the wild for as long as anyone can document. Its caterpillar spins a single unbroken thread of fine, strong filament to build its cocoon.",
    effects:
      "• One cocoon yields several hundred paces of thread if unwound whole rather than cut.\n• The moth cannot fly and barely walks; every stage of its life happens on the tray it is fed on.\n• Caterpillars are fussy feeders, thriving on one tree's leaves and sickening on any other — the plantations at [[Tabrishi'ir]] are planted for the moth, not the other way around.",
    lore:
      "The families of [[Tabrishi'ir]] guard their breeding stock as jealously as their pattern-books, and for the same reason: a rival who obtained healthy eggs could grow the thread anywhere. So far, none has.",
    basis:
      "The real domestic silk moth (Bombyx mori), which genuinely cannot fly, cannot survive outside cultivation, and produces cocoons of unbroken filament several hundred metres long — the basis of the entire real silk trade.",
    tags: ["Fauna", "Acheaorian", "Tabrishi'ir"],
  },
  {
    name: "The Numbfish",
    scientificName: "Torpedo hellenorae",
    description:
      "A flat, round-bodied fish that lies half-buried in harbour sand, easy to miss until a bare foot finds it — at which point it delivers a jolt strong enough to drop a grown man.",
    effects:
      "• A live specimen, held against the temple or the joints, is prescribed by physicians of [[Hellenoria]] for headache and for the ache of old wounds. The shock is unpleasant and the relief, by most accounts, is real.\n• Dies quickly out of water and loses its charge within the hour, so the treatment must be given fresh, harbourside.\n• Fishermen who catch one by hook report the jolt travelling up wet line.",
    lore:
      "Physicians who use it can name the exact strength needed for a headache and the exact strength for gout, and disagree with each other constantly about both.",
    basis:
      "The real electric ray (Torpedo torpedo), medically documented as early as the 1st century AD — the Roman physician Scribonius Largus prescribed standing on a live torpedo ray to treat headaches and gout, a genuine ancient use of what was, in effect, electrotherapy.",
    tags: ["Fauna", "Hellenorian", "Radiant Heartwardens"],
  },
  {
    name: "Acheaorian Hunting Cheetah",
    scientificName: "Acinonyx acheaoris",
    description:
      "Slender, small-headed, and built for speed rather than strength — a cat trained rather than tamed, hooded like a hawk and carried to the hunt on a horse's flank until the moment it is released.",
    effects:
      "• Runs down game no horse can catch over a short distance, then tires within a minute — the hunt depends entirely on the release being timed correctly.\n• Almost never breeds successfully in captivity, so every hunting cheetah is caught wild and trained from adolescence.\n• A trained cheetah recognises its handler specifically and can be dangerously indifferent to anyone else's commands.",
    lore:
      "Kept at [[The Paradise of Persemenid]] and at the private grounds of any satrap who can afford the training. A satrap's standing is measured, unofficially, by how many cheetahs his kennel can field for the King of Kings' hunt.",
    basis:
      "Historically documented: cheetahs were trained and hooded for coursing game across the ancient and medieval Near East and Persia, and famously do not breed reliably in captivity, meaning every working cheetah was traditionally taken from the wild.",
    tags: ["Fauna", "Acheaorian", "The Paradise of Persemenid"],
  },
  {
    name: "The Watching Ibis",
    scientificName: "Threskiornis augurum",
    description:
      "A white wading bird with a long, black, downward-curving bill, unbothered by crowds, that stalks the shallows and rooftops of river cities picking over what the water and the market leave behind.",
    effects:
      "• Extremely regular in its habits — the same birds return to the same rooftops at the same hour, which is precisely why augurs use it.\n• Will not feed near standing water it judges unsafe, days before human testing would catch the same contamination.\n• Bold enough to steal from an unattended stall, which every market in the Imperium has simply learned to accept.",
    lore:
      "Invictian augurs read the ibis's flight and feeding pattern as readily as they read entrails, holding that a bird this unbothered by mortal business notices what mortals do not.",
    basis:
      "Modelled on the real sacred ibis (Threskiornis aethiopicus), venerated and used in augury and religious practice across the ancient Mediterranean, and a real, documented urban scavenger wherever it is found today.",
    tags: ["Fauna", "Invictian", "Imperium Invicta"],
  },
];

const FLORA: Flora[] = [
  {
    name: "Silphium",
    scientificName: "Silphium laserpicium",
    description:
      "A tall, resinous plant with a stout root and heart-shaped seeds, grown in one narrow coastal strip and nowhere else that has ever been made to work. Every part of it is used; none of it is currently for sale.",
    effects:
      "• The sap is a remedy for fever, cough, and a dozen lesser ailments, and is also relied on for preventing pregnancy — the reason demand for it never once slackened.\n• Resists cultivation entirely: every attempt to grow it outside its native strip has failed within a generation.\n• The seed, heart-shaped, was stamped onto the coinage of the one city that controlled the trade.",
    lore:
      "Harvested past sustainability for six centuries, silphium has not been found growing wild in living memory. What remains in circulation is old stock, hoarded, and priced accordingly — the last confirmed stalk was reportedly presented to a King of Kings as a curiosity, and eaten.",
    basis:
      "A real plant. Silphium was one of the ancient Mediterranean's most valuable exports — used medicinally, as a seasoning, and as a contraceptive — resisted all attempts at cultivation elsewhere, and was driven to genuine extinction by overharvesting within antiquity. Its heart-shaped seed is credited by some historians as the origin of the modern heart symbol.",
    tags: ["Flora", "Continental", "Extinct"],
  },
  {
    name: "Mandrake",
    scientificName: "Mandragora imperialis",
    description:
      "A low plant with dark, foul-smelling leaves, valued entirely for its thick, forked root — which, cleaned of soil, unnervingly resembles a small human figure.",
    effects:
      "• Prepared correctly, the root is the strongest sleeping draught and surgical anaesthetic known — enough to let a physician set a bone the patient will not remember.\n• Prepared incorrectly, or in too great a dose, it kills as quietly as it sedates.\n• Traditionally harvested at night, by tying the root to a dog and having the dog pull it free from a distance — the harvester claims the plant screams when it is torn from the ground, and that hearing the sound directly is unwise.",
    lore:
      "Whether the scream is real is a question the [[Radiant Heartwardens]] and the [[Everbloom Circle]] have never resolved, mostly because neither will pull one up personally to check.",
    basis:
      "Real historical plant and folklore: mandrake root, humanoid in shape, was genuinely used as a surgical anaesthetic and soporific in antiquity and the medieval world, and the belief that it screamed fatally when uprooted — with the dog-harvesting method to avoid hearing it — is authentic period folklore, not invented for this world.",
    tags: ["Flora", "Continental", "Radiant Heartwardens"],
  },
  {
    name: "Saffron Crocus",
    scientificName: "Crocus tinctorius",
    description:
      "A small purple autumn flower, each bloom holding exactly three brilliant orange-red threads at its centre — the only part of the plant anyone bothers to pick.",
    effects:
      "• Used as a dye, a medicine, and above all a seasoning so potent a few threads colour and flavour an entire dish.\n• Harvested entirely by hand, by picking the threads from the open flower before the day's heat wilts them — there is no faster method that does not ruin the crop.\n• A single measure of dried thread represents an extraordinary number of flowers, which is the whole reason it is priced by the thread rather than the pound.",
    lore:
      "Fields are traditionally worked by the women of a household at dawn, a custom old enough in [[Acheaoria]] that the harvest itself is treated as a rite rather than simple labour.",
    basis:
      "Real crop and real economics: saffron is genuinely harvested by hand-picking the three stigma threads from each crocus flower, and it takes roughly 150 flowers to produce a single gram of dried saffron — the actual reason it remains one of the world's most expensive spices by weight.",
    tags: ["Flora", "Acheaorian", "Persian basis"],
  },
  {
    name: "Bitterwort",
    scientificName: "Artemisia amara",
    description:
      "A silver-leaved, sharply aromatic shrub that grows on the driest, most neglected ground and thrives on being ignored — cut it back and it returns thicker the following season.",
    effects:
      "• The dried leaf, steeped, settles the stomach and expels intestinal worms — one of the most reliably effective plain remedies any household keeps.\n• Steeped too long, or too strong, it is reported to bring on vivid, unpleasant dreams.\n• Traditionally added to cheap wine to mask spoilage, which is how most people first encounter the taste.",
    lore:
      "Named for the goddess whose hunting grounds it grows wildest in, and gathered by the [[Verdant Sentinel Order]]'s wardens as a matter of habit rather than doctrine.",
    basis:
      "Modelled on real wormwood (Artemisia absinthium), whose genus is literally named for Artemis, which was genuinely used in antiquity as a digestive bitter, a vermifuge, and a flavouring for cheap wine — the real ancestor of the drink later called absinthe.",
    tags: ["Flora", "Invictian", "Verdant Sentinel Order"],
  },
  {
    name: "Victor's Laurel",
    scientificName: "Laurus triumphalis",
    description:
      "A dense, glossy-leaved evergreen that keeps its colour through every season, cut for wreaths so consistently that groves of it are planted expressly for the purpose and never for their wood.",
    effects:
      "• The leaf, crushed, releases a sharp, clean scent used in cooking and, in larger doses, in fumigation to clear a sickroom.\n• Burns readily and is said to crackle unusually loudly on a sacrificial fire — considered a favourable sign when it does.\n• A wreath cut fresh wilts within days; a properly dried one can be kept for a lifetime, which is why victors' wreaths are always dried and displayed rather than worn twice.",
    lore:
      "Sacred to the Radiant One, who is said to have turned the first laurel from a nymph who fled him rather than be caught. Every triumph, every games, every victor's crown in [[Hellenoria]] is cut from groves tended for exactly that purpose.",
    basis:
      "The real bay laurel (Laurus nobilis), sacred to Apollo in genuine Greek myth via the story of Daphne, and the actual source of both victors' laurel wreaths and the culinary bay leaf.",
    tags: ["Flora", "Hellenorian", "Greek basis"],
  },
  {
    name: "Persian Damask",
    scientificName: "Rosa acheaora",
    description:
      "A many-petalled, deeply fragrant pink rose, cultivated in walled gardens for its scent rather than its appearance — the blooms are picked before they are ever allowed to look their best.",
    effects:
      "• Distilled, the petals yield a fragrant water used in cooking, medicine, and every perfumer's stock — the single most valuable garden crop [[Acheaoria]] produces that is not food.\n• Must be picked at dawn, before the heat of the day burns off the oils that give it its scent.\n• The distillation process is slow and closely guarded; a garden's exact method is treated as inherited property.",
    lore:
      "Grown extensively in the terraces of [[Persevalis City]], where the night gardens' one lasting scent, long after the lamps are put out, is damask rose.",
    basis:
      "Real flower and real industry: the damask rose was cultivated in ancient Persia specifically for rosewater distillation, picked at dawn for oil content, and remains the historical basis of the entire rosewater and rose-oil trade.",
    tags: ["Flora", "Acheaorian", "Persevalis City"],
  },
  {
    name: "Mourning Cypress",
    scientificName: "Cupressus lugubris",
    description:
      "A tall, narrow, dark-needled tree, its shape so distinctive it is planted for that shape alone — a single dark spire visible from a distance, marking ground meant to be found again.",
    effects:
      "• The wood resists rot for an extraordinarily long time and does not warp, which is why it is used for objects meant to outlast their maker.\n• The resin is burned as incense at funerals across all three empires, one of the very few rites Invictian, Hellenorian, and Acheaorian practice agree on.\n• Grows slowly and lives long — a cypress planted at a burial is expected to still be standing when the grave is forgotten by name.",
    lore:
      "Planted at the boundary of every burial ground the [[Cycle of the Eternal Bloom]] tends, so that a graveyard can be found from a road away by its cypresses alone, long after the stones themselves have gone unreadable.",
    basis:
      "The real Mediterranean cypress (Cupressus sempervirens), genuinely associated with mourning and the underworld across both Greco-Roman and Persian tradition, planted in graveyards in real practice for both its symbolism and its rot-resistant timber.",
    tags: ["Flora", "Continental", "Cycle of the Eternal Bloom"],
  },
  {
    name: "Caravan Resin Tree",
    scientificName: "Boswellia viae",
    description:
      "A gnarled, unimpressive-looking tree that grows where almost nothing else will, its bark cut in strips to bleed a sticky sap that hardens into fragrant amber tears.",
    effects:
      "• The dried resin is burned as incense, used in medicine, and traded in sealed measures precise enough that a merchant can tell a short weight by hand.\n• Cutting the bark too deeply kills the tree; the best resin comes from trees tapped patiently, a little at a time, over decades.\n• A stand of resin trees is generational property, passed down rather than bought, since a newly planted stand will not produce well within a single lifetime.",
    lore:
      "The caravan routes through [[Acheaoria]] were built, in part, to move this resin before anything else — the [[Wheelwalkers]] still rank a resin contract among the most prestigious cargo a family can carry.",
    basis:
      "Modelled on real frankincense and myrrh trees (Boswellia and Commiphora species), whose resin was one of the ancient world's great luxury trade goods, harvested by careful, repeated bark-tapping over a tree's long working life.",
    tags: ["Flora", "Acheaorian", "Wheelwalkers"],
  },
];

const ORES: Ore[] = [
  {
    name: "Cinnabar",
    description:
      "A heavy, brick-red ore, soft enough to scratch with a fingernail, that stains the hands of anyone careless enough to grind it without protection.",
    location:
      "Found in shallow veins near old volcanic ground and hot springs, often close enough to the surface to be worked without deep shafts — which is exactly why the mines are so heavily worked and so poorly ventilated.",
    properties:
      "• Yields, when processed, both a brilliant red pigment and a liquid silver metal — the two most useful and most dangerous things the ore can become.\n• The dust is toxic with prolonged exposure; miners who work a cinnabar seam for years show a particular, recognisable trembling.\n• Heated in a sealed vessel, it gives up its silver metal entirely, leaving nothing behind — a transformation alchemists have never stopped finding suggestive.",
    uses:
      "The pigment is reserved for the most important seals, manuscripts, and temple paintings across all three empires — vermilion is the one red no dye can properly match. The silver drawn from it is prized by alchemists above the ore itself, despite being far harder to handle safely.",
    lore:
      "Mines are traditionally worked by condemned men, a practice the Imperium has never formally ended, on the reasoning that a sentence already handed down need not also come with a warning label.",
    basis:
      "Real mineral (mercury sulfide). Historically mined at sites like Almadén in Spain under Roman control, condemned criminals and slaves really were used for cinnabar mining due to its toxicity, and heating cinnabar genuinely yields elemental mercury — a real transformation central to historical alchemy.",
    tags: ["Ore", "Continental", "Alchemy"],
  },
  {
    name: "Electrum",
    description:
      "A pale, greenish-gold alloy, found naturally rather than made — panned from certain rivers in grains too small to work alone, and pressed together only once enough has been gathered.",
    location:
      "Washed down from mountain streams in the old kingdoms, in quantities too small to matter individually but, over a season of panning, enough to matter a great deal.",
    properties:
      "• Naturally variable in colour and purity from one river to the next, which made early standardisation a serious problem for anyone trying to use it as coin.\n• Harder and more resistant to wear than pure gold, which is part of why it was chosen for currency rather than melted down and separated.\n• Cannot easily be separated back into its component metals without specialised technique, which for centuries made its exact gold content a matter of trust rather than certainty.",
    uses:
      "The very first coinage on the continent was struck in electrum, stamped by the old river-kingdoms before Invicta, Hellenoria, or Acheaoria existed as powers. The [[Mithril Reserve]] still keeps a sealed set of the oldest electrum coins as a reference standard, not for their value but for what they represent.",
    lore:
      "Every banker's guild traces its practice back to the same origin point: someone, somewhere upriver, needed a way to prove that a handful of pale gold grains was worth what he said it was.",
    basis:
      "Real alloy and real numismatic history: electrum is a naturally occurring gold-silver alloy, and the earliest coins in recorded history were electrum coins struck in ancient Lydia (in Anatolia, within the historical Persian sphere) around the 7th century BC.",
    tags: ["Ore", "Continental", "Mithril Reserve"],
  },
  {
    name: "Lapis",
    description:
      "A deep, intense blue stone flecked with fine gold — genuine gold, not merely gold in colour — mined in a handful of mountain sites and nowhere else on the continent.",
    location:
      "Found only in a narrow band of the highland mines beyond [[Zi'rzamin Dar'a]], worked by tunnels old enough that no living family can say who first opened them.",
    properties:
      "• The gold flecks are pyrite, not true gold, though the confusion has made more than one buyer overpay across the centuries.\n• Ground fine, it produces the single most vivid blue pigment known, prized above nearly every other material a painter can buy.\n• Extremely difficult to carve without shattering along hidden fracture lines, which makes a finished lapis seal or amulet a genuine mark of skill.",
    uses:
      "Used for the seals of the wealthiest merchant houses, for temple statuary eyes, and — ground — for the blue in every important mural in [[Acheaoria]]. A caravan carrying raw lapis is guarded as closely as one carrying coin.",
    lore:
      "The mines are old enough that no empire has ever fully controlled them; whichever power currently claims the region has always found the miners' own families already running the tunnels, on terms that predate the claim.",
    basis:
      "Real mineral and real history. Lapis lazuli has been mined almost exclusively in the mountains of Badakhshan (in modern Afghanistan) since deep antiquity, was traded across the entire ancient Near East and Mediterranean, and its natural pyrite inclusions genuinely resemble flecks of gold.",
    tags: ["Ore", "Acheaorian", "Zi'rzamin Dar'a"],
  },
  {
    name: "Black Pitch",
    description:
      "A thick, dark, sticky substance that seeps naturally from cracks in certain dry hillsides, pooling in shallow pits that never quite run dry.",
    location:
      "Bubbles up unbidden from a scatter of sites across the Acheaorian plateau, most of them known and worked for generations, a few discovered freshly every so often after an earth tremor opens new ground.",
    properties:
      "• Waterproofs anything it is spread on — baskets, hulls, brickwork — and hardens without becoming brittle.\n• Burns extremely readily and extremely hot, producing thick black smoke that carries for miles.\n• Left in open pits, it has on rare occasion trapped and preserved whatever wandered in, down to fine detail — a fact excavators find useful and unsettling in roughly equal measure.",
    uses:
      "The standard waterproofing for boats, roofs, and irrigation channels across [[Acheaoria]]. Soaked into cloth and set alight, it is also the basis of the fire-arrows and fire-pots every garrison keeps in reserve, [[Xerastri City]]'s stores foremost among them.",
    lore:
      "A pit that has recently opened is treated with real caution — the same fires that make it valuable in a siege make it dangerous to camp anywhere near.",
    basis:
      "Real material: natural bitumen and naphtha seeps were genuinely present and exploited across ancient Mesopotamia and Persia, used historically for waterproofing construction and as the real precursor to early incendiary weapons, with occasional genuine tar-pit preservation of trapped organisms.",
    tags: ["Ore", "Acheaorian", "Xerastri City"],
  },
  {
    name: "Alum",
    description:
      "A colourless, crystalline salt that forms in crusts on certain weathered rock faces, tasteless to smell but sharply puckering on the tongue — no one forgets tasting it by accident once.",
    location:
      "Scraped and leached from weathered volcanic rock in a handful of known outcrops, then boiled down through several stages before it is pure enough to sell.",
    properties:
      "• Fixes dye to cloth so it does not wash or fade out — without it, most of the continent's finest dyework would not survive a single laundering.\n• Also used to clarify murky water and to stop minor bleeding, which is why every physician's satchel and every dyer's workshop both keep a supply.\n• The refining process takes real skill; poorly refined alum ruins a dye-batch rather than fixing it.",
    uses:
      "Bought in bulk by every dyeing guild on the continent, the [[Emberforge Collective]] and [[Forgeflame Artisans]] included for their own trades, and treated as important enough a commodity that its price is tracked as closely as grain.",
    lore:
      "A city that controls a good alum source controls, in practice, the quality of every dyed cloth downstream of it — a fact more than one merchant house has built a fortune on quietly.",
    basis:
      "Real mineral salt with real major economic history: alum was one of the ancient and medieval world's most important trade commodities, essential as a mordant for fixing dye to textile fibre, and control of alum sources was genuinely a matter of serious economic and political importance.",
    tags: ["Ore", "Continental", "Economy"],
  },
  {
    name: "Orichalcum",
    description:
      "A warm, golden-bronze metal, brighter than copper and harder than bronze, that some swear was never truly common even in the ages when it was still being struck into coin.",
    location:
      "No living mine produces it in quantity; what circulates is recovered from old hoards, older coinage, and the fittings of buildings raised by kingdoms that no longer stand.",
    properties:
      "• Takes a shine that does not dull the way bronze does, and holds an edge respectably for a metal this workable.\n• Every scholar who has tried to smelt new orichalcum from raw ore has produced, at best, a very good brass — never quite the genuine thing.\n• Old orichalcum coin is worth considerably more melted into new work than spent as currency, which has quietly removed most of it from circulation.",
    uses:
      "Reserved by tradition for ceremonial coin, temple fittings, and the fine grille-work of the oldest vaults still standing — including, reputedly, a fitting or two in the deepest chambers of the [[Mithril Reserve]] itself.",
    lore:
      "Whether true orichalcum was ever really distinct from very fine brass, or whether age and legend have simply improved on ordinary metal, is a debate scholars of [[The Sage's Archive]] have never settled and rather enjoy not settling.",
    basis:
      "Real dual history: orichalcum appears in Plato's Atlantis dialogues as a legendary precious metal, while a real metal by the same root name (aurichalcum) — a brass-like copper-zinc alloy — was genuinely used for Roman coinage, giving this entry both a mythic and a documented metallurgical basis.",
    tags: ["Ore", "Continental", "Mithril Reserve"],
  },
  {
    name: "Devil's Gold",
    description:
      "A brilliant, deep orange-red mineral that looks, at a careless glance, enough like a precious ore to have fooled prospectors for as long as prospecting has existed.",
    location:
      "Found near hot springs and old volcanic vents, frequently in the same ground as [[Cinnabar]], which has led more than one inexperienced miner to hope for one and find only the other.",
    properties:
      "• Genuinely beautiful when ground — the pigment made from it is a true, vivid orange found almost nowhere else in nature.\n• Toxic to breathe as dust, and mildly toxic even to handle for long stretches without washing.\n• Degrades under strong light over years, which means old paintings using it slowly shift in colour — a fact restorers learn to watch for.",
    uses:
      "Ground for pigment used in the finest illuminated manuscripts and temple murals, and occasionally, by those willing to risk the handling, worked into a slow poison that leaves no obvious trace.",
    lore:
      "Called Devil's Gold because it has salted more than one prospector's hopes and nothing else — it carries no useful metal at all, only the pigment, and looks its most convincing exactly when a miner most wants it to be something else.",
    basis:
      "Real mineral: realgar and its close relative orpiment are genuine arsenic sulfide minerals, historically prized as brilliant orange and yellow pigments despite real toxicity, and both are known to degrade or discolour with prolonged light exposure — a documented real conservation problem in old paintings.",
    tags: ["Ore", "Continental", "Alchemy"],
  },
];

async function main() {
  const rows = await db.select({ name: entries.name }).from(entries);
  const existingNames = new Set(rows.map((r) => r.name.trim().toLowerCase()));

  type Plan = {
    slug: string;
    name: string;
    kind: "flora" | "ore";
    summary: string;
    fields: Record<string, string>;
    tags: string[];
  };
  const plan: Plan[] = [];
  const skipped: string[] = [];

  for (const f of FAUNA.concat(FLORA as Flora[])) {
    if (existingNames.has(f.name.trim().toLowerCase())) {
      skipped.push(f.name);
      continue;
    }
    plan.push({
      slug: slugify(f.name),
      name: f.name,
      kind: "flora",
      summary: f.description,
      fields: {
        scientificName: f.scientificName,
        effects: f.effects,
        lore: f.lore,
        description: f.description,
      },
      tags: f.tags,
    });
  }

  for (const o of ORES) {
    if (existingNames.has(o.name.trim().toLowerCase())) {
      skipped.push(o.name);
      continue;
    }
    plan.push({
      slug: slugify(o.name),
      name: o.name,
      kind: "ore",
      summary: o.description,
      fields: {
        location: o.location,
        properties: o.properties,
        uses: o.uses,
        lore: o.lore,
        description: o.description,
      },
      tags: o.tags,
    });
  }

  console.log(`\n  fauna defined  : ${FAUNA.length}`);
  console.log(`  flora defined  : ${FLORA.length}`);
  console.log(`  ores defined   : ${ORES.length}`);
  console.log(`  already exist  : ${skipped.length}${skipped.length ? " -> " + skipped.join(", ") : ""}`);
  console.log(`  to create      : ${plan.length}\n`);
  for (const p of plan) console.log(`    ${p.name.slice(0, 30).padEnd(32)} ${p.kind.padEnd(6)} ${p.tags.join(", ")}`);

  if (!APPLY) {
    console.log("\n  Dry run. Re-run with --apply to create these entries.\n");
    return;
  }

  const created: { id: string; name: string; fields: Record<string, string> }[] = [];
  for (const p of plan) {
    const [row] = await db
      .insert(entries)
      .values({
        slug: p.slug,
        kind: p.kind,
        name: p.name,
        summary: p.summary,
        body: "",
        fields: p.fields,
        tags: p.tags,
        visibility: "public",
      })
      .returning({ id: entries.id, name: entries.name, fields: entries.fields });
    created.push(row as never);
  }

  // Resolve [[Wikilinks]] embedded in the lore/uses fields into the link graph.
  const all = await db.select({ id: entries.id, name: entries.name }).from(entries);
  const byName = new Map(all.map((e) => [e.name.trim().toLowerCase(), e.id]));
  let linked = 0;
  const missing: string[] = [];
  for (const row of created) {
    const text = Object.values(row.fields ?? {}).join(" ");
    for (const name of new Set([...text.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].trim()))) {
      const targetId = byName.get(name.toLowerCase());
      if (!targetId) {
        missing.push(`${row.name} -> [[${name}]]`);
        continue;
      }
      await db.insert(links).values({ sourceId: row.id, targetId, relation: "mentions" }).onConflictDoNothing();
      linked++;
    }
  }

  console.log(`\n  Created ${created.length} entries, ${linked} links resolved.`);
  if (missing.length) console.log(`  unresolved: ${missing.join(", ")}`);
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
