/**
 * Second settlement pass: the towns, the villages, and the districts inside the
 * Duneforged Citadel.
 *
 * Towns get the same five-part treatment as the cities. Villages and city
 * districts get a lighter one — a place of two hundred people does not have a
 * military policy, and pretending otherwise would pad the codex rather than
 * fill it.
 *
 * Each place is written from what its own tag already says it is: "Invictian
 * Town", "Hellenorian Town", "Acheaorian Underground Town", "Island Village",
 * "Swamp Village", "Araucaria Village", "Lower City", "Middle City".
 *
 * Only fills entries whose body is empty. Never overwrites.
 *
 * Run with:  npx tsx scripts/describe-settlements-2.ts          (dry run)
 *            npx tsx scripts/describe-settlements-2.ts --apply
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

/** Full form, for towns. */
type Town = {
  name: string;
  summary: string;
  basis: string;
  look: string;
  economy: string;
  military: string;
  life: string;
  festivals: string;
};

/** Lighter form, for villages and city districts. */
type Small = {
  name: string;
  summary: string;
  basis: string;
  look: string;
  living: string;
  festival: string;
};

const TOWNS: Town[] = [
  {
    name: "Anticata",
    summary: "An Invictian road town on the northern highway — mansio, market and remount station, and used to being passed through.",
    basis: "The Roman mansio: an official waystation on the imperial road network.",
    look: `A single long street that is the highway, with the town attached to both sides of it. Anticata exists because a day's march ends here, and everything in it faces the road.`,
    economy: `Stabling, lodging, farriers and food. The town holds an official waystation of the *Cursus Legionis*, which means fresh horses, a register, and a guaranteed clientele.\n\nFarmland behind is decent and goes to [[The Annona]] like everything else in the province. The inns take the rest of the money.`,
    military: `None of its own. A road town's defence is that the road is patrolled, and the road is patrolled less than it was.\n\nDemobilised legionaries drift through constantly. The town has hired its own watch for the first time in its history, which the older residents regard as an admission of something.`,
    life: `Transient. Half the people in Anticata on any night do not live there, and the permanent population has organised itself entirely around that fact — every trade here serves travellers.\n\nGossip arrives before news does, which makes the town unusually well informed and unusually unreliable about it.`,
    festivals: `- **The Milestone** — the road's markers either side of town are cleaned and repainted, with a procession to each.\n- **The Long Table** — midsummer, a single table down the middle of the highway and the road closed for a day. The only day of the year Anticata makes travellers wait.`,
  },
  {
    name: "Falecosa",
    summary: "An Invictian hill town of terraced vineyards — small, old, and producing wine the capital pays absurdly for.",
    basis: "The Roman hill-town wine estate and the named vintages of Italian antiquity.",
    look: `Stone houses stacked up a south-facing slope, vines below on terraces held by dry walls that have needed rebuilding every generation for eight hundred years.`,
    economy: `Wine, and very little else. Falecosa's slope produces a vintage that is named, aged, and sold to [[Aeterna City]] at prices the growers themselves find funny.\n\nThe estates are owned largely from the capital now, worked by tenants whose families have been on the same terraces far longer than the owners' families have owned them.`,
    military: `A wall in poor repair and no garrison. The town's protection is its irrelevance — there is nothing here to take but wine, and wine is easier to buy.\n\nThe vineyards themselves are the vulnerability. A season's vandalism would ruin the town for a decade, which local landlords mention whenever a tenant dispute grows sharp.`,
    life: `Slow, hierarchical and intensely local. Everyone is related, everyone knows which terrace belongs to whom, and boundary disputes run for generations.\n\nThe [[College of the Starlit Lute]] collects here often; Falecosa's harvest songs are among the oldest attested and vary by terrace.`,
    festivals: `- **The Treading** — the harvest. The whole town works and the whole town drinks, in that order, over about nine days.\n- **The Naming** — the previous year's vintage is opened, judged and named. A bad name is remembered for decades.\n- **The Walling** — early spring, the dry walls are repaired collectively. Attendance is not optional in any sense that matters.`,
  },
  {
    name: "Fucostia",
    summary: "An Invictian river port at the mouth of the Tiberius — grain wharves, warehouses, and the bottleneck the capital cannot afford to lose.",
    basis: "Ostia: Rome's port, where the sea-going grain fleet transferred to river barges.",
    look: `Warehouses, and more warehouses. Fucostia is where sea-going hulls stop and river barges start, so the whole town is a transfer point: wharves, cranes, granaries, and a permanent smell of grain dust and tar.`,
    economy: `The grain of [[The Annona]] passes through here — all of it. Fucostia's warehousemen, lightermen and porters handle the capital's food and are entirely aware of what that means.\n\nThe [[Aurum Pact]] runs the isolation warehouses outside the town, and their certificate is what lets a suspect cargo up the [[River Tiberius]] at all.`,
    military: `A harbour watch and the fleet's anchorage. Fucostia is not fortified against a serious enemy because a serious enemy at Fucostia means the war is already lost.\n\nIts real security problem is internal. A strike on these wharves empties Aeterna's granaries in about three weeks, and the porters' guilds have begun saying so out loud since the coin went bad.`,
    life: `Rough, wet and organised by guild. The work is seasonal and brutal, and the town swells and shrinks with the shipping.\n\nEveryone here understands the arithmetic of the dole better than anyone in the capital does, because they count it. The mood on the wharves is the best available forecast of trouble in [[Aeterna City]].`,
    festivals: `- **The First Hull** — the season's first sea-going grain ship is met, blessed and unloaded free of charge by the guilds.\n- **The Weighing** — the year's throughput is tallied publicly against the previous year's. It has fallen three years running and the reading has become tense.\n- **The Lantern Tide** — lamps floated downriver for men lost on the wharves.`,
  },
  {
    name: "Napplesia",
    summary: "A southern Invictian bay town — hot springs, retired officers, and a leisure economy the capital pretends to disapprove of.",
    basis: "Neapolis and the Bay of Naples: the Roman resort coast of villas, springs and cultivated idleness.",
    look: `A curved bay, a warm sea, and villas along the shore built by people who could afford to build somewhere better and chose here. The town proper is behind them, older and considerably less pretty.`,
    economy: `Leisure. Napplesia sells sea air, hot springs, fish and rented villas, chiefly to wealthy Invictians and increasingly to retired officers taking their discharge in a warm place.\n\nThe springs are the anchor: mineral baths that the [[Radiant Heartwardens]] send patients to and that the town has been charging admission to for six centuries.`,
    military: `Nothing serious, and an unusual number of veterans. Napplesia is full of retired officers with pensions, opinions and time.\n\nThat concentration has begun to matter. When the [[Watchers of the Eternal Rest]] publish arrears figures, Napplesia is where the loudest response comes from — and the men making it commanded cohorts.`,
    life: `Indulgent and slightly disreputable. The capital's moralists have been condemning Napplesia for eight hundred years and holidaying here throughout.\n\nSocial life is villa-based, evening-heavy and famously indiscreet. More Invictian politics is settled at Napplesian dinner tables than anyone would admit, and [[Information]] treats the town as a listening post.`,
    festivals: `- **The Opening of the Baths** — the springs reopen after their winter cleaning, first entry by lot rather than rank. Genuinely popular.
- **The Sea Table** — a night of open-air feasting along the shore, each villa feeding whoever arrives.
- **The Discharge** — the year's newly retired officers are formally welcomed by those already here. It has grown very large in five years.`,
  },
  {
    name: "Nemibano",
    summary: "An Invictian grove town under the Verdant Sentinels — the sacred wood is the town, and the wardenship is held by combat.",
    basis: "Nemi: the sacred grove of Diana whose priest held office until killed by his successor.",
    look: `A lake in a wooded crater, and a town on its rim that exists to serve the grove below. The trees are old, the path down is stepped, and nobody goes below the treeline after dark without a reason.`,
    economy: `Pilgrimage and timber that is never cut. Nemibano lives on visitors to the grove — offerings, lodging, guides — and on the surrounding farmland, which is worked under restrictions the [[Verdant Sentinel Order]] enforces.\n\nIt is not a rich town and has refused, repeatedly, to become one.`,
    military: `The Sentinels, and one man. The Order garrisons the grove lightly, but the wardenship itself is held under the old custom: the warden holds the post until another takes it from him, in single combat, at the grove.\n\nThe current warden has held it nineteen years. The capital has tried four times to abolish the arrangement and the town has declined four times.`,
    life: `Watchful. Nemibano is the only Invictian town where the local rite outranks the imperial one, and the townspeople are quietly certain that the arrangement below the treeline is not symbolic.\n\nStrangers are treated courteously and observed closely, particularly strangers who are fit, armed and asking about the custom.`,
    festivals: `- **The Torchlight** — the lake is ringed with torches and the grove is walked in procession. Women lead; the warden does not attend.\n- **The Asking** — petitions are left at the treeline. What is left is gone by morning and no one claims to remove it.\n- **The Challenge Day** — the one day a challenge may lawfully be made. Most years it passes quietly.`,
  },
  {
    name: "Araavyna",
    summary: "A Hellenorian hill town of potters — the League's everyday tableware comes from here, and so does its best painted ware.",
    basis: "The Greek pottery quarter: clay beds, workshops, and painted ware as both trade good and art.",
    look: `Kilns. Araavyna is built above good clay beds and the hillside is terraced with workshops, drying yards and firing kilns whose smoke sits over the town most of the year.`,
    economy: `Pottery, at both ends of the market. The bulk trade is amphorae and plain ware shipped through [[Corinth City]]; the prestige trade is painted work signed by named hands and collected across three empires.\n\nThe clay is the whole basis and the beds are held communally, which has kept any one family from dominating and kept the town argumentative.`,
    military: `A wall and a militia that drills without enthusiasm. Araavyna's defence has historically been that it is inland, poor in coin, and awkward to reach.\n\nIt supplies neither ships nor cavalry to the League and is periodically criticised for it, which the potters answer by pointing out who makes the storage jars an army marches on.`,
    life: `Workshop-centred and openly competitive. Status is craft status, and a painter who develops a recognisable hand becomes a public figure.\n\nWorkshops take apprentices young and guard techniques jealously — glaze recipes are family property and lawsuits over them are the town's chief entertainment.`,
    festivals: `- **The Firing** — the year's great communal kiln, loaded by every workshop and opened publicly. Losses are borne collectively.\n- **The Signing** — new painters are permitted to sign their work for the first time. A career begins or does not.\n- **The Breaking** — flawed prestige pieces are smashed publicly rather than sold. The pile is enormous and the practice is fiercely defended.`,
  },
  {
    name: "Argotiko",
    summary: "A Hellenorian horse town on the inland plain — the League's cavalry comes from here, and it never lets the sailors forget it.",
    basis: "Argos and the horse-breeding plains of the Greek interior.",
    look: `Low, spread out, and surrounded by paddocks. Argotiko has more stabling than housing and the streets are wide enough to ride four abreast, because they are ridden that way.`,
    economy: `Horses. Breeding, training and sale, with a bloodline registry the town has kept for four centuries and treats as sacred.\n\nBuyers come from all three empires, which makes Argotiko unusually cosmopolitan for an inland town and unusually rich for one with no port.`,
    military: `The League's only serious cavalry, raised here and hired out by the town's leading families. Argotiko fields squadrons rather than an army.\n\nIts relationship with [[Thebesieas City]] is close and slightly resentful — Thebesieas has the infantry, Argotiko has the horse, and neither will serve under the other.`,
    life: `Equestrian to the point of obsession. Standing is measured in bloodlines, disputes are settled by racing, and a child is put on a horse before it can properly walk.\n\nThe town's contempt for the maritime cities is open and cheerfully returned. Argotiko's standing position is that a fleet cannot hold ground.`,
    festivals: `- **The Running** — the year's races over three days. The registry is updated from the results and the results are contested for months.\n- **The Judging of Foals** — the season's foals are graded publicly. A poor grade can end a bloodline's reputation.\n- **The Riding of the Bounds** — the town's grazing boundaries ridden and re-marked, which is also a display.`,
  },
  {
    name: "Atticenea",
    summary: "A Hellenorian olive town on thin soil — poor in everything but oil, and exporting philosophers because it cannot feed them.",
    basis: "Attica: thin soil, olives, and an export economy in oil and educated men.",
    look: `Grey-green terraces of olive on stony ground, and a small white town at the top of them. The soil is visibly bad and the trees are visibly ancient.`,
    economy: `Oil, and nothing else that grows. Atticenea's ground will not carry grain, so the town has specialised absolutely: olives, presses, and amphorae bought from [[Araavyna]].\n\nThe oil is excellent and pays for the grain the town cannot grow, an arrangement that works until shipping is interrupted, at which point Atticenea is in immediate trouble.`,
    military: `Negligible. The town musters a few dozen men and relies on the League, which it has always found humiliating and has never been able to remedy.\n\nIts leverage is instead reputational: an unusual number of the League's magistrates, teachers and envoys were born here, and Atticenea calls in favours shamelessly.`,
    life: `Argumentative, literate and poor. Atticenea produces more educated men than it can employ, and the surplus leave — for [[Thessalonika City]], for the academies, for anywhere.\n\nThose who stay teach, press oil and argue. The town's schools are excellent and its buildings are falling down.`,
    festivals: `- **The Pressing** — the first press of the season, tasted publicly and graded. The grade sets the year's prices.\n- **The Leaving** — late summer, when the year's students depart. The whole town walks them to the road.\n- **The Old Tree** — the town's oldest olive is tended in ceremony. It is genuinely ancient and has its own guardian family.`,
  },
  {
    name: "Carianea",
    summary: "A Hellenorian coastal town of sponge divers and shipwrights — hard work, short lives, and the best small hulls in the League.",
    basis: "The Carian coast: seafaring, sponge diving, and boatbuilding communities.",
    look: `A working harbour too small for anything large, boat sheds along the shore, and drying racks of sponges that give the whole town a particular smell.`,
    economy: `Diving and boatbuilding. Carianean sponges are the League's finest, and the divers who take them are the reason the town's men are old at forty.\n\nThe yards build small — fishing hulls, coasters, and the fast light craft the [[Sunward Valiants]] favour. Nothing here can build a trireme and the town has never wanted to.`,
    military: `Sailors rather than soldiers. Carianea supplies crews to the League fleet and has for centuries, which is its entire contribution and its entire claim.\n\nThe town resents that the ships are berthed at [[Hellarchon City]] and the crews are drawn from places like this, a grievance shared by half the smaller ports and increasingly organised.`,
    life: `Maritime, superstitious and close. Diving families intermarry, and the loss rate means the town's social structure is built around widows and their households, who hold more property here than anywhere else in the League.\n\nThe [[Nereid’s Veil]] is a day's sail west and Carianean pilots are among the few who will enter it.`,
    festivals: `- **The First Descent** — the diving season opens with a rite at the harbour mouth; the first sponge of the year is dedicated, not sold.\n- **The Counting** — the season's end. Divers who came back are counted aloud, and so are those who did not.\n- **The Launching** — every hull finished that year is put in the water on the same morning.`,
  },
  {
    name: "Kirimitsana",
    summary: "A Hellenorian mountain town of beekeepers and herbalists — remote, medicinal, and the source of half the League's remedies.",
    basis: "The Greek mountain villages of honey, wild herbs and folk pharmacology.",
    look: `High, cold and scattered — Kirimitsana is less a town than a dozen hamlets on the same mountain, connected by paths and counted together for tax.`,
    economy: `Honey and herbs. The mountain's flowers give a honey that is dark, medicinal and expensive, and the same slopes supply the wild ingredients the [[Luminastra Alchemists]] buy in bulk.\n\nCollection is seasonal, dangerous and done by families who guard their gathering grounds as property, though nothing is written down.`,
    military: `None, and none needed. The paths are the defence. An armed party can reach Kirimitsana, but not quickly and not without being watched the entire way.\n\nThe town has never been taxed to its full assessment in its history and considers this a tradition rather than an offence.`,
    life: `Isolated and self-sufficient in a way that makes lowland Hellenorians uneasy. The dialect is difficult, the rites are older than the League's, and outsiders are received politely and not encouraged.\n\nThe herbal knowledge is genuinely deep and genuinely unwritten, passed within families, and the Luminastra have spent two centuries failing to buy it.`,
    festivals: `- **The Smoking** — the hives are worked collectively over a week, and the year's honey is graded on the spot.\n- **The Gathering Days** — fixed days on which the high slopes may be worked, set by the oldest women of each hamlet and obeyed absolutely.\n- **The Winter Door** — the night the paths are declared shut. Nothing enters or leaves until spring.`,
  },
  {
    name: "Loutrokleion",
    summary: "A Hellenorian spa town built on hot springs — a place of cures, consultations, and conversations that could not be had at home.",
    basis: "Greek loutro, 'bath': the healing spring resort of antiquity, part sanctuary and part sanatorium.",
    look: `Colonnaded bath-houses over natural hot springs, steam standing above the roofs in cold weather, and a town of lodgings arranged around them in strict order of price.`,
    economy: `Cures. Loutrokleion sells baths, treatment, lodging and diet to the sick and the merely wealthy, and it has been doing so long enough to have a specialist trade in every complaint.\n\nThe [[Radiant Heartwardens]] and the [[Healer’s Sanctuary]] both send patients here, and the town's physicians are good, expensive and unusually well documented.`,
    military: `A watch, and a convention. Loutrokleion has been treated as neutral ground for centuries — the sick of every city come here — and even during the war it was not attacked.\n\nThat convention is unwritten and has never been tested by a tyrant.`,
    life: `Slow, comfortable and discreet. Patients stay for weeks, which makes the town's social life unlike anywhere else in [[Hellenoria]]: leisured, mixed by origin, and organised around the bathing schedule.\n\nIt is consequently a superb place to meet someone quietly, and [[Information]] notes that a great deal of League business is done in the middle pools.`,
    festivals: `- **The Clearing of the Springs** — the pools are drained, scoured and refilled, and the town is briefly and unpleasantly ordinary.\n- **The Physicians' Assembly** — an annual gathering at which cases are presented and argued. Reputations are made and destroyed.\n- **The Grateful** — dedications from the cured are hung in the colonnade. There are thousands and they are read.`,
  },
  {
    name: "Qa'zshahrv'in",
    summary: "An Acheaorian caravan town at a qanat head — walled, watered, and the last certain water for four days in any direction.",
    basis: "The Persian caravan town sited on a qanat, whose existence is entirely a function of engineered water.",
    look: `A walled square of mud-brick around a pool, with the caravanserai taking up a third of the interior and the town crowded into the rest. Outside, nothing.`,
    economy: `Water, and charging for it. Qa'zshahrv'in sits at the outfall of a major channel of [[The Qanat Network]] and is the last reliable water on a four-day stretch of the caravan road.\n\nThe town charges per head and per beast, and has done for eight hundred years. Everything else it sells — fodder, repairs, lodging — follows from that.`,
    military: `A wall, a gate and about forty men. The town does not need more, because destroying Qa'zshahrv'in would close the road for everyone including the destroyer.\n\nThe genuine threat is the channel. The *muqanni* who maintain it are the town's most protected residents, and their families are effectively hostages to the town's survival.`,
    life: `Transactional, multilingual and tightly controlled. Water is rationed by household under a rota older than the current dynasty, and theft of water is the one crime the town punishes without mercy.\n\nThe caravanserai is a separate world within the walls, and townspeople and travellers mix commercially and almost not at all otherwise.`,
    festivals: `- **The Clearing** — the annual descent into the channel by the *muqanni*, who are feasted before going down and feasted again if they come up.\n- **The Measuring** — the pool's level is marked publicly on the same day each year. The marks are the town's history and the recent ones are lower.\n- **The Gate Night** — one night a year the gate stays open and the town and the caravanserai eat together.`,
  },
  {
    name: "R’eyshar",
    summary: "An old Acheaorian town outlived by its own ruins — the living quarter is a fraction of what the walls enclose.",
    basis: "Rhagae/Rey: an ancient Persian city repeatedly destroyed and rebuilt smaller than its own footprint.",
    look: `Walls enclosing far more ground than is occupied. R'eyshar's living town is a knot of streets in one corner; the rest inside the circuit is orchard, rubble, and the outlines of streets nobody has walked in centuries.`,
    economy: `Fruit, tiles and salvage. The orchards inside the walls are excellent, watered by channels that predate the current town and are maintained by families with hereditary rights.\n\nSalvage is the quiet trade: dressed stone, brick and worked metal recovered from the old quarters and sold on. Officially this is forbidden. Actually it is the town's second income.`,
    military: `The walls are too long to hold and the town knows it. R'eyshar's defence plan, written down and rehearsed, is to abandon the circuit and hold the inner quarter.\n\nIt has done so four times in recorded history and has never been taken in the inner quarter.`,
    life: `Long-memoried and a little haunted. R'eyshar's people know which dynasty built which quarter and will tell you at length, and the town's sense of itself is of something in a late chapter.\n\nThe [[Cult of Whispering Roots]] recruits here successfully, which the satrap's officers find irritating and have not managed to stop.`,
    festivals: `- **The Walking of the Circuit** — the full wall is walked once a year, through the empty quarters, and the condition of each stretch is called out.\n- **The Naming of the Streets** — the old streets' names are read aloud from the archive, including those with nothing left on them.\n- **The Grafting** — the orchard families exchange cuttings, a rite that doubles as the town's marriage market.`,
  },
  {
    name: "Shir'abad D'ar",
    summary: "An Acheaorian frontier town under a lion-carved gate — a satrap's seat, a garrison, and the collection point for tribute nobody wants to forward.",
    basis: "Persian shir (lion) and abad (settlement): the provincial seat with royal iconography at the gate.",
    look: `A double gate cut with facing lions, and behind it a town that is mostly administration: the satrap's residence, the treasury, barracks, and the walled yard where tribute is assembled.`,
    economy: `Tribute, and the skimming of it. Shir'abad D'ar collects from a wide district and forwards a portion to [[Persemenid City]] — a portion that has been shrinking for five years while the collection has not.\n\nThe difference funds the satrap's household, his expanded cavalry, and a building programme that the [[Scribes of the Infinite Ledger]] have recorded in unhelpful detail.`,
    military: `A real garrison, and squadrons of the [[The Lion's Mane Vanguard]] raised locally and paid locally. This is precisely the arrangement the throne has cause to worry about.\n\nA chapter of [[The Ironclad Oath]] is also stationed here, sworn directly to the throne, and relations between the two forces are correct and cold.`,
    life: `Formal, watchful and factional. Everyone of consequence is attached to the satrap's household or to the garrison, and the two do not mix socially.\n\nOrdinary townspeople keep clear of both. The [[Lanterns of Justice]] ride through twice a year and their approach is visible for an hour, which is generally long enough for everything to be in order.`,
    festivals: `- **The Assembling** — the tribute is laid out in the yard before dispatch, publicly. What is laid out and what departs are both counted, by different people.\n- **The Lion Gate Rite** — the carvings are washed and re-cut on the satrap's accession day.\n- **The Riding Out** — the local squadrons parade. It has grown noticeably larger for three years running.`,
  },
  {
    name: "Tabrishi'ir",
    summary: "An Acheaorian weaving town — carpets knotted over years, sold across three empires, and the only Acheaorian export the Imperium admits admiring.",
    basis: "Tabriz: the Persian carpet-weaving city whose workshops produced court-grade work over years.",
    look: `Courtyard workshops with looms standing full height, and dyed wool drying on every flat roof in the town, which from above makes Tabrishi'ir a grid of colour.`,
    economy: `Carpets, and the dye trade beneath them. A court-grade piece takes years, involves a dozen hands, and sells for what a farm costs; the town also turns out ordinary work in quantity.\n\nDesigns are family property, recorded in coded pattern-books, and stealing one is the town's most serious offence. The [[Wheelwalkers]] carry most of the output.`,
    military: `A watch and a wall of no great height. Tabrishi'ir's protection is commercial: its product is wanted by everyone, including everyone who might take it.\n\nThe pattern-books are the thing genuinely guarded. Each family's is kept in the town's strongroom and may only be withdrawn by two members together.`,
    life: `Patient to a degree outsiders find hard to credit. Work measured in years produces a particular temperament, and Tabrishi'iri are famously unhurried and famously exact.\n\nThe workshops are family-based and largely worked by women, who consequently hold the designs, the strongroom keys and a great deal of the town's actual authority.`,
    festivals: `- **The Cutting** — a finished court piece is cut from the loom in public, which is the first time it is seen whole, including by the weavers.\n- **The Dye Days** — the vats are opened and the season's colours fixed. The smell is dreadful and the results decide the year's work.\n- **The Reading of the Books** — apprentices are taught to read the coded patterns. The ceremony marks the point at which a girl becomes a weaver.`,
  },
  {
    name: "De'rakhtak Bon",
    summary: "An Acheaorian underground town cut around a taproot — houses in the rock, and a tree above whose roots are the town's calendar.",
    basis: "Persian derakht (tree) and bon (root); the rock-cut underground settlements of the Iranian plateau.",
    look: `From outside: a single enormous tree on an otherwise bare rise, and a few chimneys. Everything else is below — chambers cut into soft rock on several levels, with the tree's taproot running down through the heart of them, dressed and left exposed.`,
    economy: `Cool storage, and being paid for it. The chambers hold a steady temperature year-round, which makes De'rakhtak Bon the region's warehouse for anything that spoils — fruit, oil, medicine, and the seed stock of a dozen villages.\n\nThe [[Bountiful Harvesters]] keep their reserve here. So, quietly, does the local satrapy.`,
    military: `Effectively unassailable and completely indefensible above ground. Attackers take the surface in an afternoon; nobody has ever taken the lower levels, which are narrow, dark and known.\n\nThe town's plan has not changed in centuries: give up the top, hold the third level down, wait.`,
    life: `Lamplit and quiet. Sound carries oddly, so the town speaks softly by habit, and outsiders find the hush unnerving before they find it restful.\n\nThe root is the town's clock and its shrine. Its condition — sap, colour, the wet on it — is read for the season, and the reading has been recorded on the chamber wall for six hundred years.`,
    festivals: `- **The Reading of the Root** — four times a year, the taproot is examined and the season declared. Planting above ground follows it.\n- **The Descent** — new households are formally shown the lowest levels, which are otherwise not entered.\n- **The Cool Night** — high summer, when the whole district comes down to sleep in the chambers and the town is briefly full.`,
  },
  {
    name: "Zi'rzamin Dar'a",
    summary: "An Acheaorian underground town in a dry valley — dug rather than built, and invisible until you are inside it.",
    basis: "Persian zirzamin (underground) and dara (valley); the multi-level rock-cut towns dug for shelter and concealment.",
    look: `A dry valley with nothing in it. Zi'rzamin Dar'a is entirely below the floor of it — eight levels of chambers, stairs and ventilation shafts, entered through doorways cut in the valley sides that are not visible until you are close enough to touch them.`,
    economy: `Refuge, and the fee for it. The town has for centuries taken in people who needed to not be found — during the war, whole villages — and it charges, fairly and without comment.\n\nOtherwise it lives on goat herding above and on the storage trade it shares with [[De'rakhtak Bon]]. Nothing is grown in the valley, which would give the place away.`,
    military: `The design is the defence. Passages narrow at each level, doors are round stones rolled across from the inside, and the ventilation is deliberately confusing.\n\nNo force has ever cleared Zi'rzamin Dar'a. Two have tried, both lost men in the dark, and the town's account of both is notably matter-of-fact.`,
    life: `Ordered, communal and strict about air. Every household has a duty on the shaft rota, and neglect is treated as attempted murder because it is.\n\nThe town keeps no written records of who shelters there, ever, which is the whole basis of its trade. Satraps have demanded the lists repeatedly and been told, politely, that there are none.`,
    festivals: `- **The Opening of the Shafts** — the ventilation is cleared and tested, level by level, with the whole town counting off.\n- **The Sealing** — an annual drill in which the stone doors are rolled shut and the town lives closed for a day and a night.\n- **The Guest Table** — those sheltering are fed at the town's table once, before terms are discussed. The order matters.`,
  },
];

const SMALL: Small[] = [
  // ----------------------------------------------------------- VILLAGES --
  {
    name: "Alderpool",
    summary: "An Araucarian forest village around a black pool — charcoal, timber and a strict rule about which trees may be cut.",
    basis: "The charcoal-burning forest settlements of temperate Europe.",
    look: `Timber houses on stilts around a still, dark pool, under conifer that closes over the paths. The charcoal stacks smoke at the edge of the clearing most of the year.`,
    living: `Charcoal and coppice timber, sold down to the ironworks at [[Mavelon City]]. The village cuts on a rotation the [[Circle of the Eternal Grove]] agreed with it generations ago and has never broken.\n\nThe pool is not used. It is not explained why, and Alderpool is unforthcoming about it to outsiders.`,
    festival: `**The Kindling** — the year's first stack is lit by the youngest burner, and the fire is not allowed out until the last stack of the season is drawn.`,
  },
  {
    name: "Nemorus Village",
    summary: "An Araucarian grove village of woodcarvers — small, devout, and supplying temple fittings across the Imperium.",
    basis: "Latin nemus, 'sacred grove': the woodland settlement under religious protection.",
    look: `A clearing with a shrine at its centre and houses around it, every doorpost, lintel and shutter carved by the household that lives behind it.`,
    living: `Carving. Nemorus supplies temple doors, screens and altar fittings to Invictian sanctuaries, and its work is recognised at a glance across the province.\n\nThe grove itself may not be cut. Timber comes from managed woodland an hour's walk out, which the villagers consider an important and obvious distinction.`,
    festival: `**The Setting of the Door** — each year one household's carved door is taken to a temple that commissioned it, escorted by the whole village to the road.`,
  },
  {
    name: "Silva Caminia",
    summary: "An Araucarian forest village on the old road — a waystation in deep woodland where travellers pay for a roof and a guide.",
    basis: "Latin silva, 'forest': the forest-road settlement living on passage and guiding.",
    look: `A clearing straddling a paved road that the forest is slowly taking back, with a long low inn on one side and the village on the other.`,
    living: `Guiding, lodging and forage. The road beyond the village is unreliable and the villagers know where it is passable, which is the whole of their trade.\n\nThe [[Silent Stalkers of the Glade]] recruit here, and the village's guides are the reason Invictian columns moving through this country arrive where they intended.`,
    festival: `**The Clearing of the Road** — a week's communal work cutting back the year's growth, ending with the last stretch walked in torchlight.`,
  },
  {
    name: "Azadeh Atoll",
    summary: "An island village of free divers and fishers — a ring of coral with a lagoon inside and no lord over it.",
    basis: "Persian azadeh, 'free': the self-governing island community outside mainland authority.",
    look: `A low ring of sand and palm around a pale lagoon, with the village on the sheltered side and boats drawn up on the beach in front of every house.`,
    living: `Fish, pearls and salt. The lagoon is farmed rather than merely fished — the villagers move stock between pens and have done for generations.\n\nAzadeh pays no tribute to any satrapy and never has. The arrangement rests on being far out, poor-looking, and difficult to reach in the season when anyone might bother.`,
    festival: `**The Free Day** — the anniversary of the last attempt to tax the atoll. The tax-collector's boat is re-enacted, badly, and sunk.`,
  },
  {
    name: "Bahrami Rock",
    summary: "An island village on a bare stack — a lighthouse, a fishing fleet, and forty families who have not left in four generations.",
    basis: "The Persian name Bahram; the isolated rock-island fishing and light-keeping community.",
    look: `A stone stack rising out of open water with houses cut into its landward face and a light at the top, reached by a stair that is genuinely frightening in weather.`,
    living: `Fishing and the light. The keepers are paid by the League and by Acheaorian shipping alike, one of very few arrangements both sides simply continued through the war without discussing.\n\nEverything not caught is landed from the mainland, and in a bad winter the Rock is on its own for weeks.`,
    festival: `**The Lighting** — the first night of the season the light is relit, and every household sends someone up the stair regardless of age or weather.`,
  },
  {
    name: "Parvaz Cay",
    summary: "An island village on the migration path — bird-catchers, feather traders, and a calendar set entirely by what is overhead.",
    basis: "Persian parvaz, 'flight': the island settlement living on seasonal bird migration.",
    look: `A flat sandy cay with nets on tall poles standing over the whole of it, and a village of low houses beneath, which from the water looks like a wood of bare masts.`,
    living: `Birds. Two passages a year bring enormous flocks over the cay, and the village takes, salts and sells — meat, down and the long feathers that Acheaorian courts pay foolishly for.\n\nBetween passages there is very little to do, and the village fishes, mends nets and is famously idle.`,
    festival: `**The First Flight** — the season's first flock is watched and counted and none of it is taken. The count is recorded, and the recent counts are smaller.`,
  },
  {
    name: "Zandar Isle",
    summary: "An island village of boatwrights and smugglers — officially a fishing station, actually the quiet route between three empires.",
    basis: "The island entrepôt whose position between jurisdictions is its entire economy.",
    look: `A wooded island with a hidden anchorage on the lee side, a handful of houses, and considerably more boat sheds than the population needs.`,
    living: `Fishing, boatbuilding, and moving things that would be taxed elsewhere. Zandar sits where three jurisdictions almost meet and none quite reaches.\n\nThe [[Veilborn Syndicate]] uses the anchorage, carefully and within its ceiling. The [[Aurum Pact]] certifies cargo here that would fail certification anywhere else.`,
    festival: `**The Counting of Hulls** — every boat on the island is drawn up and counted on the same day, an old custom that has become a joke, since the count is always exactly what was declared.`,
  },
  {
    name: "Marshroot Grove",
    summary: "A swamp village on stilts in the Maeotis — reed-cutters who pay tribute to whoever asks and change nothing.",
    basis: "The reed-cutting marsh communities of the great river deltas.",
    look: `Platforms and walkways on piles above black water, roofed in reed, with the village shifting slightly every year as the channels move under it.`,
    living: `Reed, fish and fowl. Marshroot cuts, bundles and sells reed for roofing and matting across the region, and moves its walkways when the water decides.\n\nIt has paid tribute to three empires, sometimes concurrently, and regards this as the cost of being left alone. As [[Maeotis Helos]] records, no army has ever profitably come further in.`,
    festival: `**The Moving** — when a walkway must be shifted, the whole village does it in a day, and the old piles are left standing as a record of where the village used to be.`,
  },
  {
    name: "Willowheart Enclave",
    summary: "A swamp village around a single vast willow — herbalists and midwives whose reputation reaches well beyond the marsh.",
    basis: "The marsh herbalist community and the very old association of willow with pain relief.",
    look: `One enormous willow standing out of the water, with the village built into and around it on platforms among the roots, so that the tree is structure and shelter at once.`,
    living: `Medicine. Willowheart's bark preparations for pain and fever are the best in the region, and its midwives are sent for from towns three days away.\n\nThe [[Luminastra Alchemists]] buy here and have never persuaded the enclave to sell the preparation method, only the preparation.`,
    festival: `**The Stripping** — bark is taken from allotted sections of the great willow under supervision so strict it is effectively a rite. Taking unallotted bark is the one offence that gets a person expelled.`,
  },

  // ------------------------------------------- DUNEFORGED CITY DISTRICTS --
  {
    name: "The Marketplace",
    summary: "The Duneforged Citadel's middle-city market — covered, policed, and the only place in the citadel where every class meets.",
    basis: "The covered bazaar of the Near Eastern city: roofed lanes, guild quarters, fixed stalls.",
    look: `Roofed lanes running four ways from a central well, each lane belonging to a trade, the whole thing dim, cool and permanently crowded. Light comes down in shafts from vents in the vaulting.`,
    living: `Everything the [[Duneforged Citadel]] eats, wears or builds with passes through here. Stalls are heritable property and change hands for sums that scandalise outsiders.\n\nThe [[Gilded Vault]] and the [[Mithril Reserve]] both keep counters at the market end, which is the practical reason the citadel's commerce works.`,
    festival: `**The Sweeping** — one morning a year the entire market is cleared, swept and rewhitened by the stallholders before dawn, and trade resumes at first light.`,
  },
  {
    name: "The Quarrymen District",
    summary: "The stoneworkers' quarter of the Duneforged Citadel — dust, hoists, and the crews who cut the city out of its own mountain.",
    basis: "The quarry-workers' quarter of an ancient stone-built city.",
    look: `Terraced housing on the cut face itself, with hoists and sledways running past the doors. Everything here is grey with dust, including the people.`,
    living: `Cutting and hauling. The district supplies the citadel's building stone and provides the crews for the deep galleries of [[The Dune Mines]].\n\nWork is by gang, gangs are family-based, and a gang's reputation for a clean face is its livelihood. Pay is good and lives are short.`,
    festival: `**The Last Block** — the year's final cut block is dressed, carved with the year, and set into the district's own wall, which is now a calendar four centuries long.`,
  },
  {
    name: "The Rockpools",
    summary: "The Duneforged Citadel's lower-city water quarter — cisterns, bath-houses, and the district that decides whether the citadel drinks.",
    basis: "The cistern quarter of a rock-cut desert city, where water storage is civic infrastructure.",
    look: `Stepped cisterns cut down into the rock, some open, some vaulted, with walkways between them and the sound of water everywhere — the only district in the citadel that is never dry or quiet.`,
    living: `Water. The pools take the flow from the mountain channels, settle it, and distribute it upward through the city, which means the Rockpools' keepers control the supply to every district above them.\n\nThe work is unglamorous and the keepers are lower-city people, a mismatch of status and power that the citadel has never resolved.`,
    festival: `**The Measuring of the Pools** — the level of every cistern is read publicly at the year's turn and posted. In a poor year the posting is read as an omen and behaves like one.`,
  },
  {
    name: "Terraces Farms",
    summary: "The Duneforged Citadel's cultivated terraces — the only farmland inside the walls, and the difference between a siege and a surrender.",
    basis: "The intramural cultivation that let ancient fortified cities outlast a blockade.",
    look: `Stepped fields cut into the inner slope, watered from the [[The Rockpools]] above, growing in a place that has no business growing anything.`,
    living: `Vegetables, fruit and fodder — not enough to feed the citadel, but enough to matter. The terraces are allotted by household and worked in addition to whatever else people do.\n\nDuring the war the terraces were the reason two sieges failed, a fact the citadel repeats often and the terrace families repeat more often.`,
    festival: `**The Allotment** — plots are redistributed by lot every seventh year. It is fiercely watched, occasionally violent, and has never been abolished.`,
  },
  {
    name: "The Parched Ox",
    summary: "A lower-city drinking hall that functions as the Duneforged Citadel's unofficial labour exchange and courthouse.",
    basis: "The tavern as civic institution: hiring hall, arbitration venue, and news exchange.",
    look: `A long vaulted room off a lower-city street, with a stone counter, benches worn to a shine, and a slate by the door where work and grievances are chalked up.`,
    living: `Beer, hiring and arbitration. Gang masters come here to take on crews, and disputes that neither party wants before the Duke's officers are settled at the back table by whoever the room agrees is impartial.\n\nRulings have no legal force and are obeyed anyway, because a man who ignores one does not get hired.`,
    festival: `**The Wiping of the Slate** — at midwinter every outstanding grievance chalked on the slate is either settled or formally abandoned, and the slate is washed clean.`,
  },
  {
    name: "Drakkur’s Expenditionary",
    summary: "A middle-city outfitter supplying anyone going into the deep desert or the deep galleries — and keeping a list of who came back.",
    basis: "The expedition outfitter of the frontier town, whose ledger is a record of the missing.",
    look: `A deep shop of racks and hooks — rope, lamps, water skins, dust masks, rock hammers — with a ledger on a stand by the door that is larger than any of the stock.`,
    living: `Kit, hire and advice. Drakkur's supplies prospectors, mine crews, caravan guards and the occasional expedition to the ruins out past [[Zaruk'thal Spine]].\n\nThe ledger is the real institution. Every party signs out, and signs back in, and the entries that were never closed are left open on the page.`,
    festival: `**The Reading of the Open Lines** — once a year the unclosed entries are read aloud, name and date and where they were going. It takes about an hour and the shop does no trade that day.`,
  },
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

  const push = (name: string, summary: string, basis: string, body: string) => {
    const hit = byName.get(name.trim().toLowerCase());
    if (!hit) {
      missing.push(name);
      return;
    }
    if (hit.body.trim()) return;
    const emptySummary = !hit.summary?.trim() || /^untitled$/i.test(hit.summary.trim());
    plan.push({
      id: hit.id,
      name: hit.name,
      body,
      summary: emptySummary ? summary : undefined,
      dmNotes: hit.dmNotes?.trim() ? undefined : `Adapted from: ${basis}`,
    });
  };

  for (const t of TOWNS) {
    const body = [
      t.look.trim(),
      "",
      "## Economy",
      "",
      t.economy.trim(),
      "",
      "## Military",
      "",
      t.military.trim(),
      "",
      "## Way of life",
      "",
      t.life.trim(),
      "",
      "## Festivals",
      "",
      t.festivals.trim(),
    ].join("\n");
    push(t.name, t.summary, t.basis, body);
  }

  for (const s of SMALL) {
    const body = [
      s.look.trim(),
      "",
      "## Living",
      "",
      s.living.trim(),
      "",
      "## Festival",
      "",
      s.festival.trim(),
    ].join("\n");
    push(s.name, s.summary, s.basis, body);
  }

  console.log(`\n  described : ${TOWNS.length + SMALL.length}`);
  console.log(`  not found : ${missing.length}${missing.length ? " -> " + missing.join(", ") : ""}`);
  console.log(`  to write  : ${plan.length}\n`);
  for (const p of plan) console.log(`    ${p.name.slice(0, 30).padEnd(32)} body ${p.body.length}`);

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
