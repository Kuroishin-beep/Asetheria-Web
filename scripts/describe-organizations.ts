/**
 * Writes descriptions for the organizations that had none.
 *
 * Every organization in the codex already names the god it is dedicated to, its
 * type, its allegiance and its empire. Each description is built from those:
 * the deity's actual historical cult supplies the character, the type supplies
 * the trade, the empire supplies the manners, and the situation five years
 * after the Treaty of Deiperdeum supplies the trouble.
 *
 * So the Aurum Pact is sworn to Febris, whom Rome propitiated to avert fever,
 * and is therefore a merchant compact obsessed with quarantine. The Scales of
 * Eternal Justice serve Nemesis, who punished excess rather than crime. The
 * Watchers of the Eternal Rest keep Senectus, the Roman personification of old
 * age, and run the continent's pensions.
 *
 * Only fills entries whose body is empty. Never overwrites.
 *
 * Run with:  npx tsx scripts/describe-organizations.ts          (dry run)
 *            npx tsx scripts/describe-organizations.ts --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, sql } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { entries } from "../src/db/schema";

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

/** [name, summary, real-world basis, body] */
type Row = [string, string, string, string];

const ORGS: Row[] = [
  [
    "Abyssal Tideguard",
    "Invictian marine order sworn to Neptune — harbour defence, salvage rights, and the only body permitted to bless a keel.",
    "Neptune as god of the sea, horses and earthquakes; Roman naval religion and the sacrifice before sailing.",
    `A military order of marines and salvage crews holding the Imperium's harbours, sworn to the god who governs both the sea and the ground beneath it.

The Tideguard's authority is narrower than its reputation. It defends anchorages, clears wrecks, and holds the sole right to consecrate a new hull — a monopoly worth more than the rest of its duties combined, since no Invictian captain will sail an unblessed keel and the fee is set by the order.

Neptune is not a kind god. The Tideguard's rites are propitiatory rather than grateful, and its officers are notably fatalistic. Since the Treaty the order has lost its war footing and kept its monopoly, and there is quiet argument in the Senate about whether that is the correct arrangement.`,
  ],
  [
    "Accord of Infinite Wisdom",
    "A philosophical circle sworn to Concordia — professional mediators who write the treaties nobody else can get signed.",
    "Concordia, the Roman personification of civic agreement, whose temple was raised to mark the end of internal strife.",
    `Concordia is not a goddess of peace. She is the goddess of *agreement*, which the Imperium learned to distinguish sharply during its own civil wars, and her temple was raised to mark a reconciliation rather than a victory.

The Accord trades on that distinction. Its members are arbitrators for hire — commercial disputes, inheritance, boundary quarrels, and increasingly the ugly business between Legates who cannot be seen to negotiate directly. They draft, they witness, they hold copies, and they do not take sides even when a side is obviously right.

Their reputation rests on a rule: the Accord never enforces. It records what was agreed and leaves the consequences to whoever cares. This is why all three empires still use them.`,
  ],
  [
    "Artisan's Forge of Wonders",
    "A magical society under Minerva, where enchantment is treated as a craft with a guild examination rather than a gift.",
    "Minerva as patron of craftsmen and the trade guilds, more artisan than warrior in Roman practice.",
    `Minerva in the Imperium is less the armoured strategist than the patron of every trade that requires a hand and a plan, and the Forge takes that literally: enchantment here is a craft, subject to apprenticeship, examination, and a guild mark.

Members are makers first and mages second. A candidate presents a piece — not a spell — and is judged on the object. The society's position, which annoys every other magical order on the continent, is that a wonder that cannot be repeated is not a wonder but an accident.

Their work is consequently unfashionable, expensive, and extremely reliable. Invictian officers buy here. So, discreetly, do Hellenorian ones.`,
  ],
  [
    "Aurum Pact",
    "A merchant compact sworn to Febris, the fever goddess — they hold the quarantine, and the quarantine is why they are rich.",
    "Febris, the Roman goddess of fever, propitiated not for favour but to be kept away; her temples stood near malarial ground.",
    `Rome did not worship Febris out of love. She was propitiated so that she would go elsewhere, and her shrines stood where the air was bad. The Aurum Pact keeps that entirely practical theology.

The Pact is a merchant compact that made its money on plague. Its members handle cargo nobody else will touch, maintain the isolation warehouses outside every major Invictian port, and certify a hold as clean — a certificate the harbour masters accept and the [[Mithril Reserve]] insures against.

They are not liked. Quarantine is enforced by refusing to move goods, which ruins people, and the Pact's rates during an outbreak are remembered for a generation. Its members consider this the cost of the only job that has to be done by somebody.`,
  ],
  [
    "Benevolent Hands",
    "An Acheaorian charity guild that feeds the satrapies the throne has stopped feeding — carefully, and without ever saying so.",
    "The endowed charitable foundation of the Persian and Near Eastern tradition, funded in perpetuity and administered by trustees.",
    `A charitable guild endowed by old Acheaorian families, running kitchens, wells and almshouses across the satrapies.

Its position is delicate to the point of absurdity. The empire's tribute system assumes the satrapies are provided for; the Hands exist because they visibly are not. Every kitchen they open is an accusation, so they open them quietly, name them after donors rather than causes, and are scrupulous about thanking the local satrap for a permission he did not grant.

The endowment structure protects them: the funds are tied in perpetuity and cannot be seized without an act that would frighten every noble house in the empire. Two satraps have tried. Both were persuaded that they had misread the paperwork.`,
  ],
  [
    "Bountiful Harvesters",
    "The farmers' guild of the Acheaorian irrigated belt — they hold the water shares, which makes them the real authority in the countryside.",
    "The irrigation communities of the Persian plateau, where water rights rather than land defined agricultural power.",
    `In country watered by [[The Qanat Network]], owning land means very little and owning a share of the channel means everything. The Harvesters hold the shares.

The guild's real business is the allocation timetable: which field takes water, for how long, in what order, in a system where the flow is fixed and the growing season is not. Their ledgers are older than the current dynasty and are treated as evidence in the satraps' courts.

They are conservative, litigious, and quietly powerful. A satrap who quarrels with the Harvesters finds his own estates scheduled last, entirely in accordance with the rota, and entirely disastrously.`,
  ],
  [
    "Caravan of the Gilded Horizon",
    "Mercury's own long-haul caravan company — they cross every border, carry anything legal, and are studiously curious about nothing.",
    "Mercury as god of commerce, boundaries, messengers and thieves — the patron of everyone who crosses a line for profit.",
    `Mercury governs merchants, messengers, travellers and thieves, on the sound reasoning that these are the same profession observed at different moments. The Gilded Horizon has never pretended otherwise.

It is the largest overland freight company on the continent, running Invictian roads, the Acheaorian caravan tracks, and the ferry links to the Hellenorian ports. Its contracts are famously strict: the Caravan will carry anything lawful in the jurisdiction it is crossing, will not ask what is in a sealed crate, and will not carry the same crate twice if it caused trouble the first time.

Since the Treaty their volume has trebled and their escorts have doubled, because the roads are full of demobilised legionaries with no land and no pension.`,
  ],
  [
    "Celestial Astromancers",
    "Sky-watchers under Caelus who sell calendars, eclipse warnings, and the omens the Imperium's generals refuse to admit they buy.",
    "Caelus, the Roman personification of the sky itself, and the political weight of Roman augury.",
    `Caelus is the sky as a thing rather than a person — older than the gods who live under it and correspondingly indifferent. The Astromancers approach him as surveyors approach a mountain.

Their public trade is the calendar: planting dates, sailing seasons, festival reckoning, and eclipse prediction, which they do well enough that an unannounced eclipse is now considered a professional scandal. Their private trade is augury, and their private trade is where the money is.

No Invictian commander will admit to consulting them. Every Invictian commander does. The Astromancers keep the appointments in a cipher and have survived four purges by being able to prove, convincingly, that they burned the book.`,
  ],
  [
    "Circle of the Eternal Grove",
    "The druidic circle that keeps the Foloicauria — Demeter's people, and the reason Hellenoria has never felled its last old-growth.",
    "Demeter and the Eleusinian Mysteries: agricultural cult with initiates, secrecy, and a sanction that stopped kings.",
    `Keepers of [[Foloicauria Forest]] and, through it, of an argument Hellenoria has lost three times.

The Circle serves Demeter, whose cult in the old world was agricultural, initiatory and secret, and whose displeasure was understood to be a famine rather than a lightning bolt. That is the Circle's entire leverage. They do not threaten the League. They observe that the grove is party to an agreement, and that agreements have terms.

Initiates are taken young and taught by degrees. What is at the centre of the teaching is not written and has never leaked, which after eight centuries is either extraordinary discipline or evidence that there is nothing to leak — a possibility the Circle finds funny.`,
  ],
  [
    "College of the Starlit Lute",
    "A bardic college under Pomona — orchard songs, harvest cycles, and the closest thing the Imperium has to a memory of its countryside.",
    "Pomona, the Roman goddess of fruit trees and orchards, who had a flamen of her own and no myth to speak of.",
    `Pomona is a strange patron for a college of musicians: a goddess purely of orchards, given one of Rome's oldest priesthoods and almost no stories at all.

The College made that absence its subject. Its repertoire is the agricultural year — planting songs, grafting songs, the long cyclical pieces sung at harvest that run for hours and change by district. It is the most complete record of rural Invictian life anyone holds, and it is held in performance rather than in writing.

The city finds them quaint. The countryside does not. When a village is destroyed the College sends someone to learn its variants before the survivors scatter, and since the war they have been doing a great deal of that.`,
  ],
  [
    "Crimson Warlords",
    "Mars's own — the Imperium's most decorated military order, now a fraternity of unemployed veterans with excellent contacts.",
    "Mars as Rome's central state god, and the veteran associations that outlived the campaigns that formed them.",
    `Mars is not a marginal god in the Imperium; he is close to the state itself, and the Crimson Warlords are his order. Their honours are genuine and their battle record is the best on the continent.

Peace has left them without a function and with a membership of several thousand men who know each other, trust each other, and have nothing to do. The order maintains its halls, its rites and its rolls, and its halls have quietly become the place where a Legate goes when he needs men who will not ask what the work is.

The Council of Legates is aware. Nobody has moved to dissolve them, because dissolving Mars's own order is not a thing an Invictian politician survives proposing.`,
  ],
  [
    "Cult of Whispering Roots",
    "An outlawed Acheaorian druidic cult that tends what grows over ruins, and holds that the empire is a temporary condition.",
    "The Persian tradition of the exile and the outlawed cult; also the very old association of ruins with returning wilderness.",
    `Dedicated to the Exiled, and outlawed across [[Acheaoria]] for a doctrine that is less blasphemous than insulting: that empires are a phase, that the plateau was here first, and that the vegetation reclaiming the abandoned northern towns is not decay but the correct outcome.

The cult tends ruins. That is the whole of its visible practice — clearing nothing, planting a little, and marking the year each wall falls. Its members are drawn heavily from the satrapies the throne has stopped supporting, which the Magi consider evidence of sedition and the cult considers evidence of the doctrine.

Suppression has been sporadic and ineffective. It is difficult to raid a congregation that meets in places nobody is willing to garrison.`,
  ],
  [
    "Cycle of the Eternal Bloom",
    "Proserpina's order — funerary rites, seasonal mysteries, and the burial contracts of half the Imperium's poor.",
    "Proserpina, queen of the underworld and goddess of the returning spring; the Roman burial club that guaranteed members a funeral.",
    `Proserpina is both the dead queen and the spring, and the Cycle refuses to separate the two. Its rites run the year as a single movement, and its funerals are performed as the first half of something rather than an ending.

Practically, the Cycle is a burial society. Members pay a small monthly due and are guaranteed a proper rite, a plot, and a name recorded — which for a poor Invictian is the difference between being buried and being disposed of. The order's registers are, incidentally, the best population records in the Imperium, and the treasury has twice tried to obtain them.

Both refusals were absolute. The Cycle regards its rolls as belonging to the dead.`,
  ],
  [
    "Emberforge Collective",
    "A smiths' guild under Hephaestus — Hellenorian technique, Invictian citizenship, and a long memory for being condescended to.",
    "Hephaestus, the Greek smith-god: lame, working, and treated by the other Olympians as a craftsman rather than a peer.",
    `The Collective works to Hephaestus rather than Vulcan, which in the Imperium is a statement. Hephaestus is the god who was thrown from the mountain, who works while others feast, and who makes the things the beautiful gods cannot make for themselves.

Its membership is largely Hellenorian-descended families holding Invictian citizenship, and its output is structural: bridge fittings, siege frames, aqueduct clamps, the unglamorous iron that holds the Imperium together. They are not armourers and are touchy about being mistaken for them.

Since the Treaty they have been repairing rather than building, including three spans of [[The Aqua Aeterna]], and they have been paid late for all of it.`,
  ],
  [
    "Everbloom Circle",
    "A magical society under Flora, working in growth, grafting, and the slow botanical magic that takes a decade to show.",
    "Flora, the Roman goddess of flowering and the Floralia — fertility, spring, and the moment before fruit.",
    `Flora governs the flowering rather than the fruit — the moment of promise, not the yield — and the Everbloom take that as a technical brief.

Their magic is horticultural and extremely slow. They graft, they cross, they coax, and they publish results a decade after starting them. The Circle has produced grain that ripens three weeks early on the Latium plains, a vine that survives Acheaorian frost, and an orchard blight cure that took thirty-one years.

Other magical societies regard them as barely magical at all. The Circle's response is that a spell that feeds a province for a century is worth several that impress a dinner party, and that they are content to be underestimated by people who will be hungry later.`,
  ],
  [
    "Forgeflame Artisans",
    "Hellenorian smiths working under Vulcan's Invictian name — an old compromise nobody involved enjoys discussing.",
    "Vulcan, the Roman fire-and-forge god whose festival guarded against destructive fire; the Vulcanalia.",
    `A Hellenorian guild dedicated to a god under his Invictian name, which is exactly the sort of arrangement the long war produced and nobody has felt able to undo.

Vulcan is a god of fire in both aspects — the forge and the conflagration — and the Artisans keep the fire-watch rites as seriously as the smithing ones. Their halls double as the fire stations of three League cities, and their members turn out for a blaze whether or not it threatens guild property.

The politics are awkward and permanent. Younger members periodically propose reverting to Hephaestus. The elders point out that the [[Emberforge Collective]] already holds that name, that the two guilds trade constantly, and that the argument has never once survived contact with an actual order book.`,
  ],
  [
    "Gallienain Cult",
    "A continental secret society pursuing forbidden alchemy — outlawed in all three empires, which has made it genuinely continental.",
    "The suppressed mystery cult of antiquity, and alchemy as a discipline pursued in cipher across hostile jurisdictions.",
    `Proscribed in [[Imperium Invicta]], [[Hellenoria]] and [[Acheaoria]] alike, and consequently the only organisation on the continent with a genuinely unified structure — persecution having done for it what no treaty managed for the empires.

The cult pursues transmutation. What it has actually achieved is disputed, because its results are published in cipher, in fragments, across three languages, and are meant to be assembled only by someone who already knows most of the answer.

Its cells do not know each other. A member knows his own cell and one contact, which has made the cult nearly impossible to roll up and nearly impossible to lead. There is no evidence that anyone is leading it, and some evidence that this has been true for a very long time.`,
  ],
  [
    "Geolith Artisan Covenant",
    "The masons who quarry the Oros and cut for every temple in the League — sworn to Terra, and unmoved by deadlines.",
    "Terra Mater, the Roman earth goddess, and the Greek quarry-and-temple building trades.",
    `The masons' covenant of [[Hellenoria]], holding the workings in [[Oros Mountain Range]] and the contracts for most sacred building in the League.

Terra is the earth as a mother rather than a resource, and the Covenant's rites are apologetic in structure: permission is asked before a face is opened, and a portion of every quarry's output is left uncut. This is not decorative. Crews refuse to work faces that were opened without the rite, and no amount of League money has ever changed that.

They are slow, expensive, and the best in the world. A temple built by the Covenant is understood to be a temple that will still be standing when the city around it is not — a claim the ruins tend to support.`,
  ],
  [
    "Gilded Vault",
    "An Acheaorian merchants' guild dealing in gems and portable wealth — the only fortune a satrapy in revolt cannot easily seize.",
    "The Near Eastern gem and bullion trade, and portable wealth as insurance against political collapse.",
    `A guild of gem merchants and bullion dealers, sworn to Jauhar, operating out of the Acheaorian caravan cities.

Their trade rests on a single insight that the empire's condition has made urgent: land can be confiscated, a house can be burned, and a debt can be repudiated, but a stone sewn into a coat travels. As the satrapies have grown restless, the Vault's business has grown enormously, and the character of it has changed — they now deal less with jewellers than with nobles quietly converting estates into something that fits in a saddlebag.

They are discreet to the point of obstruction and keep no ledger connecting a stone to a seller. The satraps understand precisely what this means and have not yet decided what to do about it.`,
  ],
  [
    "Golden Harvest Covenant",
    "Ceres's farmers — the guild that supplies the grain dole, and therefore the guild that can starve the capital.",
    "Ceres, Rome's grain goddess, and the plebeian politics that made the corn supply a permanent crisis.",
    `The great grain guild of the Invictian countryside, sworn to Ceres, and the principal supplier of [[The Annona]].

Ceres was always a plebeian goddess — the grain dole, the tribunes, and the common people's leverage over the city all sat under her — and the Covenant has never forgotten the political inheritance. Its officers speak of the dole as an obligation of the state to the people, which it is, and of themselves as the instrument of that obligation, which is a larger claim.

Since the Treaty they have been paid in debased coin and have said so publicly. The threat has not been made in words. It does not have to be: everyone in Aeterna can perform the arithmetic between a grain guild's displeasure and a bread riot.`,
  ],
  [
    "Harvestwrights' Guild",
    "Orchardists and fruit-growers under Pomona — smaller, richer and far more particular than the grain guilds.",
    "Pomona and Roman arboriculture: grafting, orchard management, and fruit as a luxury crop.",
    `Where the [[Golden Harvest Covenant]] does grain, the Harvestwrights do trees, and the difference in temperament is total. Grain is a staple and a political weapon. Fruit is a luxury, a decade of investment, and ruined by one bad frost.

The guild's expertise is grafting, and it is genuinely formidable — Invictian orchards run cultivars maintained by cutting for four hundred years, each with a name, a registry entry, and a documented parent tree. Membership requires presenting a graft that has survived three winters.

They are politically invisible and quietly wealthy, and they intend to stay both. Their standing advice to members during the current unrest is to sell to whoever is holding the road this month and to write nothing down.`,
  ],
  [
    "Ironclad Legion",
    "A military order sworn to Vis — raw force as a principle — hired by all three empires and trusted by none.",
    "Vis, the Latin for force or violence; and the condottieri problem of a standing company with no war.",
    `Vis is not a personality. It is force itself, and an order that takes force as its patron is making a statement about what it does and declining to make one about why.

The Legion is heavy infantry for hire, drilled to Invictian standard, and it has fought for all three empires, occasionally within the same year. It does not claim a cause and is contemptuous of companies that do. Its contracts are short, its rates are high, and its record of honouring both is the only reason anyone tolerates it.

Since the Treaty its recruitment has been effortless and its employment has not. Several thousand professional soldiers under arms, drawing no pay and owing no allegiance, is a problem every capital has noticed and none has addressed.`,
  ],
  [
    "Ivory Chorus",
    "A Hellenorian bardic college under Aphrodite — love songs, wedding contracts, and the most reliable gossip network in the League.",
    "Aphrodite as goddess of desire and civic concord, and the Greek symposium as a venue for politics.",
    `The Chorus performs at weddings, festivals and symposia, which sounds decorative until you consider where Hellenorian politics is actually conducted.

Aphrodite governs desire, and desire in a city-state is rarely private: marriages are alliances, and the Chorus is present at the negotiation of nearly every important one in the League. Its members compose the songs, witness the contracts, and hear everything said before, during, and after.

They do not sell what they hear, and their refusal is absolute enough to be a business model — a Chorus singer is safe to talk in front of, which is why they are always invited. What they do with the accumulated picture is unclear. That they have one is not in doubt.`,
  ],
  [
    "Lanterns of Justice",
    "Acheaorian roving magistrates who carry a light so their approach is visible — judgement that announces itself.",
    "The Persian royal inspectors and the ancient office of the itinerant judge riding circuit.",
    `Sworn to Hakiyah, the Lanterns ride circuit through the satrapies hearing cases the local courts will not touch — usually because the defendant owns the local court.

Their distinguishing custom is the lantern itself, carried lit at all hours on the road. The point is to be seen coming. A Lantern who arrives unannounced can catch a corrupt official; a Lantern whose approach is visible for an hour gives him time to release the prisoner, restore the property, or run. The order regards the second outcome as the better one, on the grounds that its purpose is remedy and not punishment.

Satraps find them intolerable and cannot easily touch them: a murdered Lantern is a lit lantern left in a road, and the empire has learned what that does to a province.`,
  ],
  [
    "Luminastra Alchemists",
    "Hellenorian apothecaries under Apollo — who sends plague as readily as he lifts it, a duality their whole practice is built on.",
    "Apollo as god of both healing and pestilence, whose arrows brought the plague in the Iliad.",
    `Apollo heals and Apollo infects, and the Luminastra consider any physician who forgets the second half to be dangerous. Their training begins with poisons.

The guild supplies most of the League's apothecaries and is unusually rigorous about it: preparations are standardised, batches are marked, and a member who cannot produce the record of a compound he sold is expelled. This is not ethics so much as liability, and it has made Luminastra product the only medicine Hellenorian courts accept as evidence of good faith.

They maintain, quietly, the other half of the inheritance. The guild holds the continent's most complete poison catalogue, will not sell from it, and has been approached about it by every intelligence service described in [[Information]].`,
  ],
  [
    "Luminous Arcanists",
    "A magical society under Phoebus, working in light, clarity, and the unfashionable business of making magic legible.",
    "Phoebus, Apollo in his aspect as the bright one — light, order, and prophecy made intelligible.",
    `Phoebus is Apollo as clarity: the god of the thing seen plainly. The Arcanists' whole programme follows from that, and it has made them the least mysterious mages on the continent.

Their work is notation. They believe magic is obscure mostly because practitioners profit from its obscurity, and they have spent two centuries building a written system in which a working can be recorded, checked and taught. The system is now good enough that an Arcanist can hand a colleague a page and expect the same result.

Every other society regards this as vandalism. The Arcanists regard the others as guildsmen protecting a monopoly, which is precisely what they are, and the argument has been conducted with great courtesy and total hostility since before the Treaty.`,
  ],
  [
    "Melodic Circle",
    "An Acheaorian bardic guild under Bala — court musicians who are also, by long custom, the only people permitted to criticise a satrap.",
    "The licensed court poet and the very old institution of the singer who may say what no courtier can.",
    `In the Acheaorian courts the musician occupies a peculiar legal space: what is sung is not what is said, and a Circle poet may put a satrap's failings into verse in his own hall and be applauded for it.

The licence is real, ancient, and narrow. It covers performance and nothing else. A Circle member who repeats the same criticism in conversation has committed sedition, and several have discovered the boundary the hard way.

The Circle guards the privilege ferociously, expels members who abuse it, and has become in practice the closest thing [[Acheaoria]] has to a press. What is sung in the satrapal halls this season is, by all accounts, unusually direct, and the Court of Vipers has begun asking for transcripts — which, being sung, do not exist.`,
  ],
  [
    "Oathbound Sanctum",
    "Juno's order of oath-keepers — they witness, record, and hold the continent's contracts, and they do not forget.",
    "Juno as goddess of marriage, oaths and the Roman state; and Juno Moneta, whose temple held the mint.",
    `Juno governs the binding of one party to another — marriage first, but by extension every oath the Imperium takes seriously. The Sanctum is her order, and its business is the keeping of promises.

It witnesses. A contract sworn before the Sanctum is entered in a register that is copied, sealed and stored in three cities, and the order will produce it decades later against anyone, including the state. This has made them indispensable and periodically endangered.

They have a formal relationship with the [[Temple of Juno]], whose priests keep the coinage standard for the same goddess and by the same logic: a coin is a promise about weight. Since the debasement began, the two priesthoods have been in constant and increasingly unhappy correspondence.`,
  ],
  [
    "Obsidian Veins",
    "A Hellenorian magical society under Dionysus — ecstatic practice, no written records, and results nobody can replicate.",
    "Dionysus and the maenads: ecstatic possession, wine, theatre, and the deliberate dissolution of the self.",
    `The doctrinal opposite of the [[Luminous Arcanists]], and openly pleased about it.

Dionysus dissolves the boundary that the Arcanists spend their lives drawing. The Veins work in altered states — wine, exhaustion, rhythm, and worse — on the principle that the self is the obstacle and that a working performed by someone who is not quite present is a working without a flinch in it.

Their results are real, occasionally spectacular, and almost never repeatable, which the society considers a category error rather than a failure. They keep no records because a record implies the working could be done again by someone else, and in their view it could not.

The League tolerates them. The League also does not let them near anything structural.`,
  ],
  [
    "Opus Dei Orientis",
    "A continental secret society pursuing spiritual enlightenment through methods all three priesthoods have condemned.",
    "The syncretic mystery religions of late antiquity, which crossed imperial borders and drew official suspicion for exactly that reason.",
    `A syncretic order, drawing from Invictian, Hellenorian and Acheaorian practice at once, on the doctrine that the three pantheons are three descriptions of one thing.

Every established priesthood on the continent finds this intolerable, and for once they agree about something. The Magi consider it foreign corruption, the Invictian colleges consider it a denial of the compact between the state and its gods, and the Hellenorians object less to the theology than to the secrecy.

The order initiates by degree, and what is taught at the higher degrees is unknown outside them. What is visible is that its membership is wealthy, cross-border, and drawn disproportionately from people who have had to deal with all three empires professionally — bankers, envoys, and the couriers of [[Information]].`,
  ],
  [
    "Order of the Silver Flame",
    "Concordia's fighting order — knights who intervene between factions rather than for one, and are resented by everybody.",
    "Concordia again, but militant: the Roman ideal of civic reconciliation enforced rather than negotiated.",
    `Where the [[Accord of Infinite Wisdom]] mediates, the Silver Flame intervenes. Same goddess, opposite method, and the two orders have a relationship best described as strained.

The Order's rule is to place itself physically between parties in conflict and to refuse to move. It does not choose a side, which means it is routinely attacked by both, and its casualty rates in the long war were appalling for an order that never once mounted an offensive.

Since the Treaty its work has been internal to the Imperium — standing between Legates' retinues, between veterans and the [[The Vigiles]], between grain convoys and the people who want them. It is the only body in Aeterna that both sides of any given quarrel will grudgingly let stand there.`,
  ],
  [
    "Predator's Guild",
    "Acheaorian hunters under Kiga, holding the culling rights that keep the plateau's herds and the satrapies' larders in balance.",
    "The Persian royal hunt and the game-management function of the enclosed park.",
    `A hunters' guild holding licensed culling rights across the Acheaorian plateau, including within several of the royal enclosures.

Their function is unglamorous and essential: the hunting parks described in [[The Paradise of Persemenid]] are stocked far beyond what the land supports, and without culling the herds sicken and the surrounding farmland is destroyed. The Guild does the killing that the ceremonial hunt is not designed to accomplish.

They are paid in meat and hides rather than coin, which has insulated them from the empire's currency troubles and made them unexpectedly comfortable. The Guild's masters have begun buying water shares from the [[Bountiful Harvesters]], which is the sort of quiet accumulation that ends up mattering.`,
  ],
  [
    "Radiant Heartwardens",
    "Asclepius's healers — the physicians who staff the Imperium's hospitals and refuse, as a matter of oath, to serve a siege.",
    "Asclepius, god of medicine, and the Hippocratic refusal to give a deadly drug.",
    `The great healing order of the [[Imperium Invicta]], staffing the military hospitals and the public infirmaries of every major city.

Their oath is specific and has caused the state considerable inconvenience. A Heartwarden may treat soldiers, and may not assist in the reduction of a city — no poisoning of wells, no advice on where disease will spread fastest, no service with a besieging force beyond the care of its own wounded. Three times in the long war the order withdrew entirely from a campaign, and three times the campaign proceeded worse for it.

They maintain a working correspondence with the [[Healer’s Sanctuary]] and take its dream-archive seriously, which their Hellenorian counterparts find embarrassing and the Heartwardens find obviously sensible.`,
  ],
  [
    "Scales of Eternal Justice",
    "Nemesis's circle — they pursue not crime but excess, and their targets are usually people who have broken no law at all.",
    "Nemesis, who punished hubris and undeserved good fortune rather than wrongdoing.",
    `Nemesis does not punish the guilty. She corrects the disproportionate — the man who has too much, too easily, for too long — and the Scales have inherited that unsettling brief in full.

They are a philosophical circle in name and an audit in practice. Their members compile: holdings, honours, fortunes, and the rate at which these accumulate. When a case is judged ripe, the Scales publish. They do not prosecute, sabotage or threaten; they simply place the arithmetic of someone's rise in front of people who had not assembled it themselves.

It works appallingly well, which is why the circle has powerful enemies and no formal opponents. Since the Treaty they have been compiling on the Council of Legates, and everyone concerned knows it.`,
  ],
  [
    "Scribes of the Infinite Ledger",
    "Acheaorian accountants sworn to Zann — they audit the tribute, and their figures are the only ones the throne half-believes.",
    "The Achaemenid tribute administration and its Aramaic-writing scribal bureaucracy.",
    `A merchant-scribal order maintaining the account books of the Acheaorian tribute system, sworn to the god of records.

Their independence is structural: Scribes are paid by the guild and not by the satrapy they audit, are rotated before they can form attachments, and may not hold land in a province they have worked. It is the single best-designed institution in [[Acheaoria]] and it is failing anyway, because a satrap who declines to open his books cannot presently be compelled to.

The Scribes' response has been to record the refusals. Their ledgers now contain a growing column of provinces whose figures are marked *not presented*, and the length of that column is the most accurate available measure of how much of the empire still functions.`,
  ],
  [
    "Seekers of Eternal Truth",
    "Veritas's circle — philosophers who investigate claims and publish findings, currently investigating the coinage.",
    "Veritas, the Roman personification of truth, said to hide at the bottom of a well.",
    `Veritas is famously hard to find — the old line has her hiding at the bottom of a well — and the Seekers have built a discipline out of taking that as a practical warning rather than a joke.

They investigate claims. Any claim: a miracle, a boundary, a genealogy, a battle report. Their method is documentary and tediously slow, and their findings are published whether or not anyone wanted the question asked.

They are currently examining the silver content of Invictian coinage against the assay records kept at the [[Temple of Juno]], and have made no secret of it. The treasury has offered them a subsidy. They published the offer.`,
  ],
  [
    "Silent Stalkers of the Glade",
    "Faunus's hunters — Invictian woodsmen who take game, guide armies, and read a forest better than any map office.",
    "Faunus, the Roman god of wild country, herds and prophetic voices heard in the woods.",
    `Faunus is the countryside as something that watches back: a god of herds and woodland who speaks, in the old accounts, through sounds heard by people who are alone.

The Stalkers are hunters and, more valuably, guides. Invictian columns moving through wooded country hire them, and the difference between a guided column and an unguided one has decided at least two campaigns. They are paid well, treated poorly, and are entirely aware of both.

Their traditions include a prohibition on hunting in a place where the god has been heard — which the Legions treat as superstition until the third or fourth time a Stalker refuses to enter a wood and the wood turns out to be held.`,
  ],
  [
    "Stormlord Vanguard",
    "Jupiter's military order — the Imperium's oath-keepers under arms, who swore to the Treaty and now guard a peace they distrust.",
    "Jupiter Optimus Maximus as guarantor of oaths and treaties, in whose name Rome's foedera were sworn.",
    `Jupiter is the god in whose name the Imperium's treaties are sworn, and the Vanguard is the order that swore this one. Their officers stood witness at Deiperdeum, and the oath they took there binds them to the peace itself rather than to the state that made it.

This is a more awkward position than it sounded five years ago. The Vanguard is now the one Invictian body formally obliged to oppose an Invictian war of aggression, and the Council of Legates has begun testing the edges of that — provincial actions, punitive expeditions, matters framed as policing.

The order has so far accepted every framing. Its own members are not unanimous that it should have, and the argument inside its halls is reportedly bitter.`,
  ],
];

async function main() {
  const rows = await db
    .select({
      id: entries.id,
      name: entries.name,
      body: entries.body,
      summary: entries.summary,
      dmNotes: entries.dmNotes,
    })
    .from(entries)
    .where(sql`${entries.archivedAt} is null`);

  const byName = new Map(rows.map((r) => [r.name.trim().toLowerCase(), r]));

  const plan: { id: string; name: string; body: string; summary?: string; dmNotes?: string }[] = [];
  const missing: string[] = [];

  for (const [name, summary, basis, body] of ORGS) {
    const hit = byName.get(name.trim().toLowerCase());
    if (!hit) {
      missing.push(name);
      continue;
    }
    if (hit.body.trim()) continue; // only ever fill a gap
    const emptySummary = !hit.summary?.trim() || /^untitled$/i.test(hit.summary.trim());
    plan.push({
      id: hit.id,
      name: hit.name,
      body: body.trim(),
      summary: emptySummary ? summary : undefined,
      dmNotes: hit.dmNotes?.trim() ? undefined : `Adapted from: ${basis}`,
    });
  }

  console.log(`\n  described : ${ORGS.length}`);
  console.log(`  not found : ${missing.length}${missing.length ? " -> " + missing.join(", ") : ""}`);
  console.log(`  to write  : ${plan.length}\n`);
  for (const p of plan) console.log(`    ${p.name.slice(0, 34).padEnd(36)} body ${p.body.length}`);

  if (!APPLY) {
    console.log("\n  Dry run. Re-run with --apply to write these descriptions.\n");
    return;
  }

  for (const p of plan) {
    const set: Record<string, unknown> = { body: p.body, updatedAt: new Date() };
    if (p.summary) set.summary = p.summary;
    if (p.dmNotes) set.dmNotes = p.dmNotes;
    await db.update(entries).set(set).where(eq(entries.id, p.id));
  }
  console.log(`\n  Wrote ${plan.length} descriptions.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
