/**
 * Describes the settlements — capitals and major cities in this pass.
 *
 * Every entry follows the same shape so the codex can be read at the table:
 * what the place looks like, what it lives on, what it can put in the field,
 * how its people actually live, and what it celebrates. The roots are the ones
 * the names already carry — Aeterna is Rome as the Eternal City, Persemenid is
 * Persepolis, Delphara is Delphi, Corinth is Corinth — and the situation is the
 * one the codex establishes: five years after the Treaty of Deiperdeum.
 *
 * Only fills entries whose body is empty. Never overwrites.
 *
 * Run with:  npx tsx scripts/describe-settlements.ts          (dry run)
 *            npx tsx scripts/describe-settlements.ts --apply
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

type Settlement = {
  name: string;
  summary: string;
  basis: string;
  /** Opening paragraph: what you see arriving. */
  look: string;
  economy: string;
  military: string;
  life: string;
  festivals: string;
  /** Optional extra properties, only set where the entry has none. */
  fields?: Record<string, string>;
};

function render(s: Settlement): string {
  return [
    s.look.trim(),
    "",
    "## Economy",
    "",
    s.economy.trim(),
    "",
    "## Military",
    "",
    s.military.trim(),
    "",
    "## Way of life",
    "",
    s.life.trim(),
    "",
    "## Festivals",
    "",
    s.festivals.trim(),
  ].join("\n");
}

const SETTLEMENTS: Settlement[] = [
  // ------------------------------------------------------------- CAPITALS --
  {
    name: "Aeterna City",
    summary:
      "Capital of the Imperium Invicta — a million people on seven hills, fed by aqueduct and grain dole, and the only city on the continent no army may enter under arms.",
    basis: "Rome as the Eternal City: seven hills, aqueducts, insulae, the pomerium, and the grain dole.",
    fields: { ruler: "The Dominus Militum, Valerius Maximus", population: "c. 1,000,000", region: "Latium Plains" },
    look: `Seven hills and the valleys between them, and no view from any of them that is not building. Aeterna is brick-faced concrete six and seven storeys high, streets narrow enough that two carts stop each other, and above it all the double tier of [[The Aqua Aeterna]] coming in over the roofs.

The public city is marble and the private city is not. Temples, basilicas and bath-houses are faced in stone from [[Oros Mountain Range]]; the tenements behind them are plastered brick with the plaster coming off, and they burn regularly enough that [[The Vigiles]] are the busiest institution in the Imperium.

The boundary matters more than the walls. Inside the sacred line no soldier may bear arms, which is why the legions camp outside it and why the [[The Obsidian Phalanx]] has been quartered beyond it for eight hundred years.`,
    economy: `Aeterna produces almost nothing and consumes everything. It is a capital city in the exact sense: wealth arrives as tribute, rent and provincial revenue, and leaves as construction, luxury and pay.

The grain is the whole story. [[The Annona]] feeds the registered citizenry from provincial levies, the [[Golden Harvest Covenant]] supplies it, and the arithmetic has stopped working — levies are short because the Legates who govern the provinces retain grain to feed their own troops.

Coin is being debased to cover the gap, the [[Temple of Juno]] records the debasement at every quarterly assay, and the [[Mithril Reserve]] has begun discounting Invictian silver against its own weight. The city has not yet noticed. The city's bankers have.`,
    military: `No legion inside the boundary. In practice the city is policed by the seven cohorts of [[The Vigiles]] — freedmen with axes and buckets, the only lawfully armed body within the walls — and defended by the fact that nobody has successfully besieged it.

The real force sits outside: the [[The Obsidian Phalanx]] beyond the sacred line, the Legates' retinues in the suburbs, and several thousand demobilised legionaries with no land, no pension and a great deal of time.

The Vigiles have been beaten by veterans twice this year. The Council of Legates declined to intervene both times. Everyone involved understands what that means.`,
    life: `Loud, vertical and crowded. Most Aeternans live in rented rooms above shops, cook on charcoal in rooms that should not have fire in them, and eat out because their homes have no kitchens. The streets are the living space.

The day is structured around the baths, which are free or nearly so and are where business, gossip and politics are actually conducted. The [[Cycle of the Eternal Bloom]] buries the poor by subscription, which for most citizens is the single most important contract they will ever sign.

Above that is the patrician city — a few hundred families with country estates, private couriers and salons where the Imperium's real news is exchanged. They resent the military, remember the Republic, and are waiting.`,
    festivals: `- **The Assay** — quarterly, at the [[Temple of Juno]]. Trial pieces weighed against the standard before witnesses. Once a formality; now the most closely watched morning in the city.
- **The Ludi Aeterna** — ten days of games each autumn, funded by whichever Legate is buying popularity. Attendance is enormous and the crowd is understood to be voting.
- **The Vigiles' Night** — midwinter. The cohorts parade with their axes reversed, and every fire in the city is extinguished and relit from a single flame.
- **The Triumph** — awarded by the [[Triumphant Vanguard of Glory]] under conditions the Treaty has made impossible to meet. None has been granted in five years, and three Legates have applied.`,
  },
  {
    name: "Hellarchon City",
    summary:
      "Capital of Hellenoria and its naval hegemon — a harbour city of colonnades and shipsheds whose fleet the rest of the League has begun to fear.",
    basis: "Athens and the Piraeus: the assembly, the long walls, the shipsheds, and hegemony resented by allies.",
    fields: { ruler: "The Assembly, in theory", population: "c. 300,000", region: "Hellenorian coast" },
    look: `A city built twice: the old town on its rock, and the harbour two miles below, joined by walls running the whole distance so that the two are effectively one fortress with a port inside it.

The upper city is temple and assembly — white stone, colonnades, and an acropolis visible from a day out at sea. The harbour is the opposite in every respect: tar, timber, noise, and the long roofed shipsheds where the fleet sits out of the weather, each shed numbered, each berth accounted for.

Between them, along the walls, is where most people actually live. Hellarchon's wealth is on the hill and its population is on the road.`,
    economy: `The harbour is the economy. Hellarchon grows almost nothing — Hellenoria never has — and imports its bread through the [[The Golden Scythe Accord]], which is the standing vulnerability of every League city and of this one most of all.

What it sells is carriage, silver, and finished work: pottery, worked bronze, and the products of guilds like the [[Geolith Artisan Covenant]] and the [[Forgeflame Artisans]]. Harbour dues fund the state.

The [[The Theoric Fund]] takes the surplus first, by law, to pay citizens to attend the festivals. This is popular, untouchable, and the reason the fleet is undermanned while the temples are magnificent.`,
    military: `The largest fleet in the world, and the political problem that comes with it. Hellarchon's triremes are the League's common defence in name and its hegemony in fact, berthed here, crewed by its citizens, and answerable to its assembly.

The other city-states have spent five years noticing this. Smaller rival alliances have formed inside the League, and the fire-signal chain that once warned of Acheaorian raiders now mostly reports the movement of Hellenorian ships.

On land Hellarchon is weak and knows it. It relies on the walls, the harbour, and hired companies — [[Sunward Valiants]] most often, for work that needs speed rather than a line.`,
    life: `Argumentative, public, and conducted outdoors. The assembly meets in the open, the courts are enormous and staffed by lot, and a Hellarchene citizen expects to speak, serve and vote in a way no Invictian would recognise.

The ideal is democracy; the reality, as [[Political]] records, is a wealthy elite of shipowners and merchants who manage the process. The gap is widely understood and complained about loudly, which is itself part of the culture.

Below the citizen body is a much larger population of resident foreigners and slaves who do most of the harbour work and vote on nothing. The [[The Hearthfire Sanctum]] keeps the civic hearth; the [[Ivory Chorus]] sings at every wedding that matters and hears everything.`,
    festivals: `- **The Greater Panegyris** — the year's chief festival, funded from the Theoric Fund. Processions from the harbour to the acropolis, a new robe for the goddess, and paid attendance for every citizen.
- **The Launching** — spring. The fleet is drawn from the sheds and rowed out in formation. Nominally a rite; unmistakably a demonstration, and the allied delegates are always invited.
- **The Dionysia** — theatre competitions running four days, where plays criticise the powerful with a licence that does not extend past the festival. The [[The Obsidian Masquerade]] is understood to be present and masked.
- **The Naming of the Dead** — autumn. The year's lost crews are read out by ship. During the war it took a full day.`,
  },
  {
    name: "Persemenid City",
    summary:
      "Seat of the King of Kings — a terraced palace-city of columned halls and tribute processions, magnificent, ceremonial, and increasingly ignored by its own provinces.",
    basis: "Persepolis: the terraced ceremonial capital, the Apadana reliefs of tribute-bearers, and the Achaemenid court.",
    fields: { ruler: "The King of Kings", population: "c. 150,000 with the court", region: "Acheaorian plateau" },
    look: `A platform cut into the rock of the plateau, forty feet above the plain, and on it a city of halls. Persemenid is approached by a stair wide enough for horsemen to ride up ten abreast, and it is meant to be climbed slowly.

The columned audience hall is the largest roofed space on the continent. Its walls carry a relief of tribute-bearers — every subject people in procession, each in its own dress, each carrying what it owes — running the length of the terrace stair, so that a visitor climbs alongside the entire empire bringing gifts.

Below the platform is an ordinary Acheaorian city of mud-brick, gardens and water channels. Above it, nothing is ordinary and nothing is accidental.`,
    economy: `Persemenid consumes tribute and produces ceremony. It is not a market city; the great trading is done at [[Atarabad City]] and the caravan towns, and what arrives here arrives as obligation.

That obligation is failing. The reliefs show every satrapy bringing its share; the ledgers kept by the [[Scribes of the Infinite Ledger]] now carry a lengthening column of provinces marked *not presented*, and the court spends against expectations of collection rather than collection.

The [[Vaults of Equilibrium]] lend against the shortfall at rates the [[Mithril Reserve]] will not match, which has kept the halls gilded and the arithmetic worse each year.`,
    military: `[[The Ten Thousand]] hold the platform, and by their own accounting have never been fewer. The first regiment quarters inside the precinct and is drawn from the old nobility, which makes it a guard and a hostage-house at once.

Field strength is another matter. The heavy cavalry of the [[The Lion's Mane Vanguard]] is raised and paid by the satraps, not the throne, and two satraps have quietly expanded their squadrons past the permitted establishment.

The [[The Ironclad Oath]] swears directly to the throne and is therefore the one force the court can rely on — and its oath forbids making war on the empire's own subjects, which is most of what the court currently needs done.`,
    life: `Hierarchical to a degree that outsiders find theatrical and Acheaorians find simply correct. Access is the whole currency: who may approach, how closely, and whether one may speak or must be spoken for.

The household staff run the palace and, as [[The Shadow Court]] demonstrates, run rather more than that. The Magi hold the calendar and the rites, are conservative, and act as the one check on the throne that has never been removed.

Ordinary Persemenid life happens below the terrace and is comfortable: gardens, running water from [[The Qanat Network]], and a court economy that employs thousands. Nobody down there speaks about the platform casually.`,
    festivals: `- **The Bringing** — new year. Every satrapy that still acknowledges the throne sends a delegation up the stair in the order shown on the relief. Absences are visible to everyone present and are the empire's real annual audit.
- **The Royal Hunt** — held at [[The Paradise of Persemenid]]. The King of Kings kills a lion before the court, under arrangements everyone understands and nobody mentions.
- **The Fire Watch** — the Magi's calendar rite, marked from the hilltop chain between the great temples. Sacred, unsupervised, and increasingly used for other purposes.
- **The Naming of the Rolls** — the guard is counted aloud at full strength. It is always at full strength.`,
  },

  // ---------------------------------------------------------------- CITIES --
  {
    name: "Romulo City",
    summary:
      "The Imperium's first city and its ceremonial heart — small, ancient, and where every Invictian institution keeps the copy that counts.",
    basis: "The founding city of the Roman tradition: older, smaller, and outgrown by the capital it created.",
    fields: { region: "Latium Plains", population: "c. 40,000" },
    look: `Older than [[Aeterna City]] and a twentieth its size. Romulo is low, walled in stone laid without mortar, and built around a hut that is certainly not the original and has been reverently rebuilt for nine centuries.

Nothing here is tall. Building above two storeys within the old walls requires a licence that is essentially never granted, which has left the city looking much as it did when the Imperium was a market town with ambitions.

The effect on visitors is reliable and intended. Invictians come here to be reminded that the Imperium was once small.`,
    economy: `Pilgrimage, record-keeping and land. Romulo's farmland is good and its landowners are the oldest families in the Imperium — the patricians who keep estates here and townhouses in the capital.

Its real business is archives. The [[Oathbound Sanctum]] holds one of its three registers here, the [[Watchers of the Eternal Rest]] keep the veterans' rolls here rather than in Aeterna, and a dozen guilds maintain their founding charters in the same vaults.

That concentration is deliberate. Documents kept in Romulo are outside the reach of anyone who takes the capital.`,
    military: `A town guard and no garrison, which is a statement rather than an oversight. Romulo has not been fortified beyond its ancient wall since the Imperium became strong enough that fortifying it was insulting.

The [[Order of the Silver Flame]] maintains a chapter house here and provides what protection the archives need. In practice the city's security is that sacking Romulo would be an act no Invictian faction could survive having done.

That confidence has held for nine hundred years. Several people have begun observing, quietly, that it has never been tested by Invictians.`,
    life: `Conservative to the point of obstruction, and comfortable with it. Romulans speak an older register of the language, keep festivals the capital abandoned, and regard Aeterna as a large, vulgar and regrettably necessary suburb.

The priesthoods here are the senior ones. A rite performed at Romulo is understood to be the correct version, and disputes about correct practice anywhere in the Imperium are referred here for a ruling that is slow, thorough and final.

The [[College of the Starlit Lute]] sends members annually to record the agricultural songs of the surrounding district, which are the oldest attested anywhere.`,
    festivals: `- **The Founding** — the year's great rite, a full day of processions ending at the rebuilt hut. Every Invictian magistrate is expected to have attended once.
- **The Boundary Walk** — the old wall is walked in procession and the sacred line re-marked. The [[Verdant Sentinel Order]] provides the wardens.
- **The Reading of the Charters** — guild founding documents are read aloud from the vaults, in full, over three days. Attendance is thin and the readings are complete regardless.`,
  },
  {
    name: "Deiperduem City",
    summary:
      "Where the Treaty was signed — a neutral city held by no empire, thick with envoys, and living entirely on the peace it hosts.",
    basis:
      "The neutral congress town of European diplomacy, whose whole economy is the negotiation it houses.",
    fields: { region: "Continental interior", population: "c. 60,000" },
    look: `A city of guarded compounds. Deiperduem sits where the three empires' territories come nearest to meeting, and it has spent five years rebuilding itself into embassies — walled quarters, each flying its own colours, each with its own guard, each pretending the others are not watching.

The old town in the middle is small, unremarkable, and now the most expensive property on the continent. The Treaty Hall stands on the square: unglamorous, deliberately plain, and preserved exactly as it was on the day of signing.

Traffic on the roads in is constant and consists almost entirely of people with credentials.`,
    economy: `Diplomacy is the industry. Deiperduem sells lodging, security, discretion and paper — its notaries, translators and copyists are the best available and price accordingly.

Everything else is imported and marked up ferociously. The [[Caravan of the Gilded Horizon]] runs three services a week, the [[Mithril Reserve]] keeps its largest branch outside the [[Duneforged Citadel]] here, and the [[The Chyrsus Syndicate]] holds the city's tolls on a long contract it negotiated when the peace looked fragile.

The city's terror is that the Treaty holds so well that nobody needs to negotiate. Its secondary terror is the opposite.`,
    military: `Nobody's, by agreement. The Treaty forbids any empire stationing troops here, and compliance is genuine because the alternative is the other two doing the same.

Order is kept by a city watch answerable to the town council, reinforced by whichever neutral company is on contract — currently the [[Ironclad Legion]], on terms that forbid it from accepting other work in the city for the duration.

Every embassy compound has guards it describes as household staff. The council counts them, publishes the count, and complains, and the numbers rise anyway.`,
    life: `Cosmopolitan, expensive, and permanently on edge. Three languages in the street and a fourth in the notaries' offices. Everyone is from somewhere else and everyone is being paid by somebody.

Deiperduem's own citizens are a minority in their own city and have become extremely good at not taking sides — a Deiperdene innkeeper who is caught having an opinion loses half a clientele.

It is, as [[Information]] notes, the single richest place on the continent for anyone in the business of knowing things first, and the density of couriers, translators and unusually well-informed merchants reflects that.`,
    festivals: `- **The Signing** — the Treaty's anniversary. All three empires send delegations, the Hall is opened, the document is displayed, and the speeches are checked in advance by everyone.
- **The Quiet Hour** — the same day at dusk. The city stops entirely for the reading of the war dead's numbers, three figures, no names. It is the only occasion on which nobody argues.
- **The Market of Nations** — high summer, a trade fair with each empire's goods in its own quarter. Nominally commerce; in practice the year's most productive week of unofficial negotiation.`,
  },
  {
    name: "Corinth City",
    summary:
      "Hellenoria's crossroads port — two harbours on two seas, a haulway between them, and tolls on everything that passes.",
    basis: "Corinth: the isthmus city with harbours on both gulfs and the diolkos haulway across the neck.",
    fields: { region: "Hellenorian isthmus", population: "c. 90,000" },
    look: `Built on a neck of land with a harbour on either side, under a fortified rock that dominates both. Corinth's defining feature runs between the two ports: a paved haulway with grooves cut for wheeled cradles, on which entire ships are dragged overland from one sea to the other.

The city is therefore loud in a particular way — ox teams, capstans, and the shriek of a hull being winched across stone. It never stops, because the tolls never stop.

The upper fortress is the strongest position in [[Hellenoria]] and has never been taken by assault.`,
    economy: `Tolls, transhipment and everything that grows around them. A cargo crossing at Corinth saves several days and a dangerous cape, and Corinth charges accordingly.

The city consequently has no need to produce and produces anyway: its bronze is famous, its potters supply half the League, and the [[Luminastra Alchemists]] maintain their largest workshop here because every ingredient on the continent passes through the warehouses.

It is also the League's chief money market after [[Hellarchon City]], and the branch offices of the [[Mithril Reserve]] and the [[Vaults of Equilibrium]] sit on the same street, watching each other.`,
    military: `The fortress rock, a modest fleet, and a very large amount of money with which to hire other people. Corinth has historically declined to build an army and has never needed one.

Its strategic value makes it a permanent object of interest to the naval hegemon, and Corinth's foreign policy for two centuries has been to make sure [[Hellarchon City]] never has a free hand. It funds rival alliances inside the League as a matter of routine.

The [[The Order of Morning's Rise]] has a standing contract here, which is the closest thing to an endorsement a mercenary company can hold.`,
    life: `Commercial, mixed and frankly disreputable by League standards. Every people on the continent is represented in the harbour quarters, and Corinth's tolerance is a business decision rather than a virtue.

Wealth is new and visible. The city's rich build ostentatiously, sponsor lavishly, and are looked down on by [[Thessalonika City]] and [[Hellarchon City]] for exactly that, which Corinth finds funny and profitable.

The port's temples are unusually well-endowed, unusually busy, and cater to sailors — which is to say they run on the traffic of men with money who may not come back.`,
    festivals: `- **The Isthmian Games** — the League's second-greatest games, held here every two years. Athletics, poetry, and a truce that is observed even by tyrants.
- **The Hauling** — the season's first ship dragged across the neck is decorated, blessed, and crewed by the city's magistrates, who are notoriously bad at it.
- **The Two Tides** — a single-day rite performed at both harbours simultaneously by two halves of the same priesthood, who then race back to the centre.`,
  },
  {
    name: "Delphara City",
    summary:
      "The sanctuary city — home of the oracle, governed jointly by twelve cities, and the one place in Hellenoria where the League still obeys.",
    basis: "Delphi: the oracular sanctuary, the Amphictyonic council, the treasuries, and the Pythian Games.",
    fields: { region: "Hellenorian highlands", population: "c. 25,000" },
    look: `Terraces cut into a mountainside above a valley of olives, climbing in switchbacks to the temple at the top. The whole ascent is lined with treasuries — small, exquisite buildings raised by individual cities to house their dedications, each competing with its neighbours in stone.

The effect is a road through eight centuries of Hellenorian rivalry, expressed entirely in architecture, ending at a temple where the god is asked questions.

Below the sanctuary the town itself is small and exists to serve it: lodging, sacrificial animals, and the guides who explain what the visitor is looking at.`,
    economy: `Pilgrims, dedications and the games. Delphara produces nothing and is extremely rich, which the [[Scales of Eternal Justice]] have noted in writing more than once.

Consultation is not free: a petitioner pays for the sacrifice, the attendance and the interpretation, and the fee scales with the questioner. Cities pay more than men. The treasuries hold the accumulated dedications of centuries, audited by the [[The Amphictyony of Delphara]] and lent to nobody.

The valley's olives and the sacred plain around them may not be cultivated for profit, a restriction enforced by sacred war three times in recorded history.`,
    military: `A ceremonial guard, and the Amphictyony's oath. Delphara has essentially no forces and has been sacked twice in fifteen centuries, both times by parties who discovered what the oath obliges the other eleven cities to do about it.

The sanction is the defence. A power that profanes Delphara faces a sacred war that every member city is bound to join, and the mechanism has worked well enough that the town has never needed a wall worth the name.

The current risk is subtler: two council seats are held by tyrant-ruled cities, and until the Amphictyony rules whether a tyrant's delegate is a delegate, no ruling can command the full twelve.`,
    life: `Quiet, formal, and organised entirely around a calendar of consultation days. The oracle does not answer on demand; there are days when the god speaks and days when he does not, and the town's rhythm follows them.

Delpharans are hosts by profession and are correspondingly discreet. What is asked at the temple is not repeated in the town, and a guide who breaks that is finished.

The priesthood is drawn locally and serves for life. The interpreters — who render the response into verse a petitioner can carry home — are the ones with the real influence, and everybody knows it.`,
    festivals: `- **The Pythian Games** — every four years. Musical contests first, athletics second, which is the opposite of every other games in Hellenoria and the point of pride here.
- **The Silence** — the winter months when the god is held to be absent. The temple stays shut, the town empties, and the [[The Amphictyony of Delphara]] does its auditing.
- **The Boundary Rite** — the sacred plain is walked and its markers checked. Tedious, annual, and the direct trigger of every sacred war ever declared.`,
  },
  {
    name: "Thessalonika City",
    summary:
      "The League's northern port and its scholarly capital — cold, orderly, and quietly the best-administered city in Hellenoria.",
    basis: "Thessaloniki: the northern harbour city, a hub of learning and a gateway to the interior.",
    fields: { region: "Hellenorian north coast", population: "c. 110,000" },
    look: `A gridded city on a curved bay, built to a plan and largely still following it, with a long sea wall and a citadel on the slope above. Thessalonika is the tidiest large city on the continent, and the tidiness is old.

The waterfront is warehouses and the upper town is institutions: academies, libraries, guild halls, and the long porticoes where teaching is done in public and interrupting is expected.

It is noticeably colder than the rest of [[Hellenoria]], and the buildings show it — enclosed courtyards, glazed windows, and roofs pitched for snow.`,
    economy: `The gateway to the northern interior. Everything moving between the League and the [[Malaunian Steppe]] passes through Thessalonika, which means grain, horses, hides, amber and mercenaries.

Its scholarly institutions are also an industry. The academies draw fee-paying students from all three empires, and the copying trade around them is the largest outside the [[Alexandria Sanctum]] — with which it maintains a rivalry conducted through catalogues.

The [[The Illuminated Scholars]] and the [[Seekers of Eternal Truth]] both keep correspondents here, and the [[The Whispering Eyes]] are understood to as well.`,
    military: `Competent, unglamorous and better funded than most of the League's. Thessalonika maintains a small standing force rather than relying on hired companies, which the other cities consider extravagant and Thessalonika considers obvious.

Its walls are modern, its citadel is maintained, and its grain reserve is kept at a level fixed by statute and actually audited. The city has never been taken.

Its relationship with the steppe is managed rather than defended: the [[Malaunian Steppe]] horsemen are hired, paid promptly, and never permitted inside the walls in numbers.`,
    life: `Sober, literate and a little smug. Thessalonika's citizens are the most educated in the League and are aware of it. Public argument here is conducted with citations.

The academies dominate social life, and their letters cross imperial borders more freely than anything else on the continent — a scholar's correspondence is one of the few things that passes uninspected, which [[Information]] notes is not lost on anyone.

The city is unusually kind to foreigners with skills and unusually cold to foreigners without them.`,
    festivals: `- **The Disputation** — a public academic contest held over five days. Positions are assigned by lot, so a scholar may be required to argue what he does not believe. Enormously popular.
- **The First Frost** — the harbour is blessed on the day the first ice appears in the upper town's fountains. The date is recorded and the series goes back four hundred years.
- **The Reading** — new works are read aloud in the porticoes before publication, and heckled. Several careers have ended here.`,
  },
  {
    name: "Atarabad City",
    summary:
      "Acheaoria's great caravan city — a fire-temple at its heart, gates on every road east, and the place where the empire's trade actually happens.",
    basis: "Persian atar (fire) + abad (settlement): the fire-temple city and the caravanserai hub.",
    fields: { region: "Acheaorian plateau", population: "c. 200,000" },
    look: `Mud-brick and shade. Atarabad is built to exclude the sun: streets roofed with matting, courtyards turned inward, and wind-towers on every roof of consequence pulling cool air down into the rooms below.

At the centre, on the highest ground, the fire-temple — a squat, heavy building where a flame is kept that the Magi hold has never been extinguished. The city is oriented on it.

Around the edge, the caravanserais: great walled courtyards with stabling below and rooms above, one for each major road, each effectively a small foreign quarter.`,
    economy: `The commercial capital of [[Acheaoria]] in every way that [[Persemenid City]] is not. Everything moving east or west crosses here, and the city takes a share of all of it.

The [[Gilded Vault]] and the [[Wheelwalkers]] both headquarter here, which means gems, bullion and the movement of portable wealth — a trade that has grown alarming in volume as the satrapies have grown restless and nobles have begun converting estates into things that fit in a saddlebag.

Water comes from [[The Qanat Network]], and the shares are held by the [[Bountiful Harvesters]], which makes the guild quietly one of the powers in the city.`,
    military: `A satrapal garrison and a great many private guards. Atarabad's wealth means every major house and caravanserai keeps armed men, and the total considerably exceeds the official force.

The [[The Lion's Mane Vanguard]] maintains squadrons here raised by the local satrap — one of the two whose numbers have quietly exceeded the permitted establishment.

The city's real defence has always been that everyone needs it functioning. Sacking Atarabad would impoverish whoever did it.`,
    life: `Mercantile, multilingual and formal. Bargaining here is a protracted social ritual and treating it as a transaction marks a man as a foreigner.

The Magi are strong in Atarabad and their calendar governs the working year. They are conservative, suspicious of foreign practice, and unusually powerful because the fire at the centre of the city is theirs.

Beneath that, the city is more cosmopolitan than the Magi would prefer: the caravanserais bring Invictians, Hellenorians and steppe people, and the [[Opus Dei Orientis]] recruits here more successfully than anywhere else.`,
    festivals: `- **The Tending** — the fire is formally fed at intervals through the year by the Magi, in a rite the public may watch but not approach. The intervals are the city's calendar.
- **The Opening of the Roads** — the caravan season's start. Each road's caravanserai sends the first convoy out on the same morning, and there is a great deal of unofficial racing.
- **The Long Bargain** — a market week in which prices are fixed by public negotiation rather than privately. Theatrical, exhausting, and taken seriously.`,
  },
  {
    name: "Mithratal City",
    summary:
      "A city built around a covenant — the Acheaorian centre of oath and contract, where a bargain sworn here is enforceable anywhere on the plateau.",
    basis: "Mithra, the Indo-Iranian god of covenant, oath and the binding word.",
    fields: { region: "Acheaorian plateau", population: "c. 80,000" },
    look: `A walled city of straight streets around a central precinct that is not a palace and not a market but a court. Mithratal is arranged so that every road runs to the place where oaths are sworn.

The precinct is open to the sky, floored in a single expanse of dressed stone, and empty of decoration. The city's wealth went into the buildings around it: the archives, the chambers where terms are drafted, the lodging where parties wait out the required intervals.

It is a strikingly quiet city for its size.`,
    economy: `Contract enforcement, and everything that grows on it. A covenant sworn at Mithratal is recognised across [[Acheaoria]] and, by long custom, by the [[Mithril Reserve]] and most Hellenorian courts.

That recognition is the product. Parties travel weeks to swear here; the city houses, feeds and bills them, and its archivists hold the record in perpetuity for a fee paid annually forever.

The [[Oathbound Sanctum]] maintains a correspondence with Mithratal's registrars — the two institutions verify each other's documents, which is the only formal Invictian–Acheaorian legal link that survived the war.`,
    military: `Small, and deliberately so. Mithratal's defence is that no party to a covenant can afford the city to fall, and the city has made itself useful to everyone who could threaten it.

A modest garrison holds the walls. The [[Lanterns of Justice]] ride circuit from here and are the city's real reach — a judgement made at Mithratal is carried outward by men whose approach is visible for an hour.

The archives are the only thing seriously fortified, and they are fortified absurdly.`,
    life: `Legalistic, patient and precise. Mithratal's people speak carefully because in this city careless speech has been held to be binding, and there is case law.

Waiting is a civic institution. Certain covenants require intervals — days, sometimes a season — between agreement and swearing, so that no oath is taken in heat. The city's inns, gardens and teahouses exist to fill those intervals, and the enforced idleness has produced an unusually good local tradition of poetry and board games.

The [[Melodic Circle]] is strong here, and its licensed criticism is taken as seriously as the courts.`,
    festivals: `- **The Renewal** — annual. Every standing covenant registered in the city is read out by class, and any party wishing to dispute must appear. Most do not. It takes eleven days.
- **The Silent Day** — one day each year on which nothing said is binding. Legally a curiosity; socially, the day people say what they have been holding.
- **The Setting of the Stone** — a new slab is laid in the precinct floor each decade, cut by the [[Geolith Artisan Covenant]], and the old one is broken and distributed.`,
  },
  {
    name: "Persevalis City",
    summary:
      "The Acheaorian garden city — terraces, water and orchards on the plateau's edge, and the satrapy that feeds the court.",
    basis: "The Persian garden city and the pairidaēza tradition applied at civic scale.",
    fields: { region: "Acheaorian plateau", population: "c. 70,000" },
    look: `Green, in country that is not. Persevalis is terraced down a long slope with water led along every level, so that the city is a series of gardens with buildings in them rather than the reverse.

Every house of consequence has a walled garden and a channel running through it, and the right to that channel is written into the deed. The public spaces are orchards.

From below, the city reads as a hillside of trees with roofs showing through, which is exactly the impression it was built to give.`,
    economy: `Fruit, wine, and the supply of the court. Persevalis grows what [[Persemenid City]] eats at its best tables, and the trade is old, protected and lucrative.

The whole thing depends on water from [[The Qanat Network]], and the city's channels are among the oldest on the plateau. Maintenance is a civic obligation shared by deed-holders, and neglect of one's section is a genuine scandal.

The [[Harvestwrights' Guild]]'s Acheaorian counterparts here maintain grafted cultivars by cutting over centuries, and the registry of named trees is kept in the city archive.`,
    military: `Almost none, and a serious vulnerability. Persevalis is indefensible — a terraced city cannot be walled usefully — and has survived by being valuable to whoever might take it.

Its actual security is the water. The channels are underground and the mother wells are a day's ride out, so an attacker who wants the gardens must hold a great deal of empty country to keep them alive.

The satrap maintains cavalry, mostly for show and for the hunt, and the [[Predator's Guild]] holds culling rights in the surrounding parks.`,
    life: `Leisured at the top and intensely skilled below. The city's reputation is for ease, and the ease rests on generations of gardeners, grafters and channel-men whose expertise is inherited and not written down.

Hospitality is the central social form. An invitation to sit in another man's garden is a real event with rules, and refusing one is a considerable insult.

The [[The River's Embrace]] keeps shrines at the channel heads, and the [[The Enchanted Muse]] is well established — Persevalis takes dreams seriously and plans by the almanac.`,
    festivals: `- **The Opening of the Channels** — spring. The water is let into the upper terraces and walks down through the city over a day, followed by a procession that arrives with it.
- **The Grafting** — late winter. New cuttings are made publicly, registered by name, and the registry read out.
- **The Night Gardens** — high summer. Lamps in every walled garden, gates left open, and the city walks through each other's houses until dawn. The one night of the year the walls do not mean anything.`,
  },
  {
    name: "Xerastri City",
    summary:
      "Acheaoria's frontier fortress-city — the shield against the steppe, garrisoned, walled twice, and the most heavily armed place in the empire.",
    basis:
      "The Achaemenid frontier fortress facing the nomad steppe, and Xerxes as the campaigning royal name.",
    fields: { region: "Acheaorian northern frontier", population: "c. 55,000" },
    look: `Two walls and a ditch, and between them the city. Xerastri is built for one purpose and does not pretend otherwise: everything is low, thick, and sited to be defended.

The outer wall faces the [[Malaunian Steppe]] and is the taller. The inner wall is older and encloses the citadel, the granaries and the wells. The space between is where the population lives, and it is understood by everyone that in a serious assault that space is expendable.

There are no gardens.`,
    economy: `The garrison is the economy. Xerastri produces armour, tack, dried provisions and horses, and consumes an imperial subsidy that has, for the last three years, arrived late.

Trade with the steppe is constant and officially discouraged: hides, horses and remounts in, grain and worked metal out. The [[Predator's Guild]] and the [[The Savage Pack]] both do business here, and the city's customs officers are famously easy to satisfy.

Since the Treaty the subsidy has been cut twice. The garrison has responded by taxing the steppe trade it is supposed to suppress.`,
    military: `The largest permanent force in [[Acheaoria]] outside the capital. Heavy infantry on the walls, light horse for patrol, and the empire's best siege engineers, who have nothing to besiege and maintain the engines anyway.

The [[The Ironclad Oath]] keeps a chapter here — one of the few places its direct oath to the throne is an operational advantage, since the local satrap cannot order it against the empire's own subjects and the steppe is full of nominal subjects.

Relations with the [[The Lion's Mane Vanguard]] are poor. The Vanguard is noble cavalry raised by satraps; Xerastri's officers are professionals who have watched them arrive late.`,
    life: `Hard, disciplined and unsentimental. Xerastri is a garrison town in which the civilians are mostly the garrison's families, and the distinction between military and civil life is thin.

Steppe influence is everywhere and officially deplored: the city rides like the Malaunians, shoots like them, and has absorbed a good deal of their custom. Officers from the capital find the place barbarous. The garrison finds officers from the capital useless.

The [[Watchers of the Eternal Rest]]' Acheaorian equivalent keeps the pension rolls here, and the rolls are the town's chief grievance.`,
    festivals: `- **The Counting of the Wall** — each spring every stretch of both walls is inspected by the family responsible for it and formally reported sound or otherwise. Failure is public.
- **The Horse Fair** — a truce week during which steppe clans may enter the outer city to trade. Heavily policed, extremely profitable, and the closest thing the frontier has to diplomacy.
- **The Riding** — a full muster and ride-out of the garrison, once a year, in view of the steppe. Everyone understands it is a message.`,
  },
  {
    name: "Aepistra City",
    summary:
      "An Invictian provincial capital built on the road — the Imperium's administrative model, exported and imposed.",
    basis: "The Roman colonia: a planned provincial city laid out on the grid with forum, baths and basilica.",
    fields: { region: "Invictian provinces", population: "c. 65,000" },
    look: `A grid. Aepistra was founded rather than grown, laid out by surveyors on two crossing main streets with the forum at the intersection, and it has never deviated from the plan.

Everything an Invictian expects is present in the standard arrangement: basilica for the courts, baths, a theatre cut into the slope, and an aqueduct arriving from the hills. A citizen of [[Aeterna City]] can find the law courts here without asking directions.

That is the point. The city is an argument about what civilisation looks like, built in brick.`,
    economy: `Administration and the road. Aepistra is a provincial capital, which means tax assessment, courts, and the movement of official traffic — the relay stations of the *Cursus Legionis* run through it.

Its farmland is worked in large estates owned mostly from the capital, and the grain goes to [[The Annona]]. The [[Golden Harvest Covenant]] has a strong chapter here and has been vocal about payment in debased coin.

The [[The Chyrsus Syndicate]] holds the tax-farming contract for the province, which is the single most resented fact about the city.`,
    military: `A legionary fortress two miles out, not in the city. Aepistra has walls of the ceremonial kind and relies on the legion, which is currently the problem.

Its Legate has been building a personal following in the province — land grants to his own veterans, appointments to his own clients — in exactly the pattern [[Political]] describes. The city council has noticed and has no mechanism to do anything about it.

The [[Order of the Silver Flame]] has increased its presence here, which is generally a sign of what is expected.`,
    life: `Provincial in the precise sense: aggressively Invictian, more correct about it than the capital, and slightly behind the fashion.

The local elite are enfranchised provincials who have taken Invictian names, run the [[The Cursus Honorum]] locally, and are extremely sensitive about being thought less Invictian than Aeterna. Their public building is lavish and their Latin is impeccable.

Underneath is a population that still speaks the older regional tongue at home and attends the imported rites without much conviction.`,
    festivals: `- **The Founding Day** — the surveyors' original marking-out is re-enacted, with the boundary ploughed by the chief magistrate. Taken very seriously.
- **The Assize** — the courts open for the season, with a procession. Half festival, half warning.
- **The Games of the Province** — smaller than the capital's and funded by whoever wants the province's goodwill. This year they were funded by the Legate.`,
  },
  {
    name: "Ephelanum City",
    summary:
      "A Hellenorian temple-port whose sanctuary draws more money than its harbour — pilgrims, silversmiths, and a permanent argument about who owns the goddess.",
    basis: "Ephesus: the great temple, the pilgrim trade, and the silversmiths who lived on selling shrines.",
    fields: { region: "Hellenorian coast", population: "c. 85,000" },
    look: `A harbour silting up, a marble street running from it, and at the end of the street a temple large enough to be visible from well out at sea.

The sanctuary is the city's reason for existing and dwarfs everything else in it. The colonnade alone took a century. Around it, packed close, is the trade the temple generates: lodging, sacrificial animals, and street after street of silversmiths selling votive models of the temple itself.

The harbour is the quiet crisis. It has been dredged four times and is losing.`,
    economy: `Pilgrimage, and the silver trade attached to it. Ephelanum's smiths produce shrine models and votive figures in enormous quantity and have a guild that is politically formidable — as the city discovered the last time a magistrate proposed regulating them.

The temple itself functions as a bank. It holds deposits under sanctuary protection, lends, and is by some measures the largest single holder of coin in [[Hellenoria]] — a role the [[Vaults of Equilibrium]] would recognise and the [[Mithril Reserve]] regards as amateurish but substantial.

The silting harbour threatens all of it, and nobody can agree who should pay to dredge.`,
    military: `Weak, and reliant on sanctuary status. Ephelanum has walls and a small force and has historically been protected by the fact that sacking a great sanctuary is a thing even tyrants think about twice.

The temple maintains its own guard, which answers to the priesthood and not the city, and the relationship between the two is the city's oldest political quarrel.

The [[The Amphictyony of Delphara]] has no jurisdiction here, which Ephelanum insists upon loudly and which leaves it without the oath that protects [[Delphara City]].`,
    life: `Devout, commercial and quarrelsome. The city's identity is entirely bound to the goddess, and disputes about her — her rites, her revenues, her jurisdiction — are the substance of local politics.

Pilgrim season transforms the place. For four months the population roughly doubles, prices triple, and the permanent residents make most of their annual income while complaining continuously.

The [[Ivory Chorus]] and the [[The Hearthfire Sanctum]] both maintain houses here, and the [[Luminastra Alchemists]] supply the temple's medicines.`,
    festivals: `- **The Procession of the Image** — the goddess's statue is carried from the temple to the harbour and back, a full day, with the whole city and every pilgrim in attendance.
- **The Smiths' Offering** — the silversmiths' guild presents a model of the temple worked over the whole preceding year, and it is displayed inside. The competition between workshops is bitter.
- **The Dredging** — nominally a rite for the harbour's health, in practice an annual reminder of the silt. Attendance has been falling.`,
  },
  {
    name: "Helionyx City",
    summary:
      "The sun-city of the Hellenorian south — white, blinding, and built around a solar cult that keeps the continent's best astronomical records.",
    basis: "Helios and the Greek solar cult; also the ancient observatory tradition of precise solar records.",
    fields: { region: "Hellenorian south", population: "c. 70,000" },
    look: `Lime-washed white, everywhere, by ordinance. Helionyx sits on a dry southern coast under a sun that does not relent, and the city's answer has been to reflect all of it — white walls, white roofs, narrow shaded streets between them.

At the high point stands the solar precinct: an open court with a gnomon at its centre and a graduated arc cut into the pavement, which has been read and recorded every clear day for six hundred years.

The glare is genuinely difficult. Visitors wear smoked glass; residents squint and are amused.`,
    economy: `Salt, dye and knowledge. The flats south of the city produce salt in quantity and a shellfish dye that is the most expensive substance in [[Hellenoria]] by weight.

The precinct's records are the other export. Six centuries of unbroken solar observation make Helionyx the authority on the calendar, and every serious calendar in the League — and, quietly, the [[Celestial Astromancers]] in the Imperium — is calibrated against its tables.

The [[The Ecliptica Arcanum]] maintains a house here and the two institutions cooperate carefully, each suspecting the other of wanting the records.`,
    military: `Modest and naval. Helionyx's coast is poor for landing and its harbour is small, which has done more for its security than any garrison.

Its real strategic asset is the salt, and the city has twice been squeezed rather than attacked — blockade being more profitable than assault. Both times it settled.

It maintains no significant land force and hires when it must, which in practice means the [[Sunward Valiants]], who can arrive quickly along the coast.`,
    life: `Early, then still. The city works from before dawn to mid-morning, stops entirely through the middle of the day, and resumes in the evening. Visitors who try to conduct business at noon are simply not attended to.

The solar priesthood is the civic authority in a way that is unusual for [[Hellenoria]] — they keep the calendar, so they keep the schedule of everything.

Night is social. Helionyx's evening streets are the liveliest in the League, and its people sleep late and briefly in a pattern the rest of the continent finds deranged.`,
    festivals: `- **The Standing** — the summer solstice, measured at the precinct. The exact moment is announced and the whole city is silent for it, then extremely not silent.
- **The Reading of the Arc** — annual publication of the year's tables. Dry, technical, attended by scholars from three empires.
- **The Dyeing** — the first vat of the season is opened publicly. The smell is famously appalling and attendance is mandatory for guild members.`,
  },
  {
    name: "Mavelon City",
    summary:
      "A river city of bridges and mills in the Invictian interior — unfashionable, productive, and the place the Imperium's iron is actually worked.",
    basis: "The Roman provincial manufacturing town: water power, ironworking, and the unglamorous industrial base.",
    fields: { region: "Invictian interior", population: "c. 75,000" },
    look: `Straddling a fast river on eleven bridges, with mills along both banks and the noise that implies. Mavelon is smoke and hammering and a permanent haze over the water.

The city is not handsome and does not try. Its public buildings are plain, its temples are functional, and its pride is the bridges — each one older than it looks, each maintained by a guild that carves its mark on the parapet.

Downstream the water runs discoloured for a mile, which the city regards as evidence of prosperity.`,
    economy: `Iron, and the water that works it. Mavelon's mills drive trip-hammers and bellows, and the city turns out the structural ironwork that holds the Imperium together: fittings, clamps, tools, and the frames the [[Emberforge Collective]] supplies to the aqueduct works.

Ore comes from the hills and, increasingly, from the [[Duneforged Citadel]]'s [[The Dune Mines]] by long-haul contract with the [[Caravan of the Gilded Horizon]].

It is not a luxury economy and has been hit less hard by the debasement than the capital, because its customers are guilds and the state rather than the wealthy.`,
    military: `An arsenal town, which makes it strategically important and politically exposed. Mavelon does not have a large garrison; it has the capacity to equip one, which is worse.

The Council of Legates has taken an interest. Two of them have placed standing orders that considerably exceed their establishment's needs, paid promptly, in good coin, which the city has accepted without asking questions and with a fairly clear idea of the answers.

The [[Ironclad Legion]] recruits here heavily. So, more quietly, do the [[Crimson Warlords]].`,
    life: `Working, organised and guild-run. Mavelon's guilds are unusually powerful — they own the bridges, set the apprenticeships, and effectively constitute the city council.

Status here is trade status. A master smith outranks a landowner socially, which visiting patricians find incomprehensible.

The city is proud of being useful and slightly defensive about being ugly. Its standing joke is that [[Aeterna City]] is beautiful because Mavelon makes the nails.`,
    festivals: `- **The Bridge Walk** — every bridge is crossed in procession by the guild that maintains it, and each parapet mark is recut. A bridge whose guild has failed is walked in silence.
- **The Quenching** — midwinter. Every forge in the city quenches at the same moment and the river is said to steam. It does not, quite.
- **The Apprentice's Piece** — annual public judging of first works. The pieces are kept, and the guild halls hold four centuries of them.`,
  },
  {
    name: "Thebesieas City",
    summary:
      "The League's inland military power — agricultural, conservative, and the only Hellenorian city that fields a serious army.",
    basis: "Thebes: the inland Boeotian power whose infantry, not fleet, made it briefly dominant in Greece.",
    fields: { region: "Hellenorian interior", population: "c. 80,000" },
    look: `Inland, walled, and squat. Thebesieas has no harbour and no interest in one, and its architecture reflects a city that expects to be attacked by land: heavy walls, a citadel with its own water, and gates that are genuinely gates rather than ceremonial arches.

The country around it is the best farmland in [[Hellenoria]] — flat, wet, and worked in large holdings — which is the source of both its wealth and its reputation for being slow.

The city itself is unadorned by League standards, and the other cities never let it forget.`,
    economy: `Grain and horses, in a league that imports both. Thebesieas is the only Hellenorian city that feeds itself and one of the few that can raise cavalry, which gives it leverage it has historically been too clumsy to use.

Its surplus feeds the [[The Golden Scythe Accord]]'s allocations, and its position in that body is far stronger than its diplomatic influence would suggest.

Wealth is in land rather than trade, which makes the city's elite conservative, cash-poor and land-rich — and increasingly indebted to Corinthian and Hellarchene lenders.`,
    military: `The best heavy infantry in [[Hellenoria]], and the city's entire identity. Thebesieas drills its citizen phalanx to a standard the maritime cities cannot match, and has twice in its history broken armies that had no business losing.

Its sacred band — a picked corps quartered together and sworn together — is the most decorated formation in the League and is currently at full strength for the first time since the Treaty.

The other cities find this alarming and say so at the League. Thebesieas points out, accurately, that it has never once used the army offensively outside its own borders.`,
    life: `Rural, communal and unfashionable. Thebesieas values land, family and service, distrusts cleverness, and produces almost no philosophy — a fact [[Thessalonika City]] mentions constantly.

Its assemblies are dominated by landholders and its politics are stable to the point of stagnation. The tyrants who have taken smaller cities have made no headway here, because there is no disenfranchised urban poor to promise anything to.

The [[Circle of the Eternal Grove]] is strong in the surrounding country, and the city defers to it on matters of land in a way no maritime city would.`,
    festivals: `- **The Muster** — annual. Every citizen of military age presents himself and his equipment for inspection. Public, thorough, and a real social event.
- **The Ploughing** — the first furrow of the year cut by the chief magistrate, in the presence of the Circle.
- **The Naming of the Band** — the sacred band's roll is read, living and dead together, and the dead are answered for by the living.`,
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
      fields: entries.fields,
    })
    .from(entries)
    .where(sql`${entries.archivedAt} is null`);

  const byName = new Map(rows.map((r) => [r.name.trim().toLowerCase(), r]));

  const plan: {
    id: string;
    name: string;
    body: string;
    summary?: string;
    dmNotes?: string;
    fields?: Record<string, string>;
  }[] = [];
  const missing: string[] = [];

  for (const s of SETTLEMENTS) {
    const hit = byName.get(s.name.trim().toLowerCase());
    if (!hit) {
      missing.push(s.name);
      continue;
    }
    if (hit.body.trim()) continue;

    const emptySummary = !hit.summary?.trim() || /^untitled$/i.test(hit.summary.trim());
    // Merge new properties in without disturbing anything already set.
    let mergedFields: Record<string, string> | undefined;
    if (s.fields) {
      const cur = (hit.fields ?? {}) as Record<string, string>;
      mergedFields = { ...cur };
      for (const [k, v] of Object.entries(s.fields)) {
        if (!cur[k]?.trim()) mergedFields[k] = v;
      }
    }

    plan.push({
      id: hit.id,
      name: hit.name,
      body: render(s),
      summary: emptySummary ? s.summary : undefined,
      dmNotes: hit.dmNotes?.trim() ? undefined : `Adapted from: ${s.basis}`,
      fields: mergedFields,
    });
  }

  console.log(`\n  described : ${SETTLEMENTS.length}`);
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
    if (p.fields) set.fields = p.fields;
    await db.update(entries).set(set).where(eq(entries.id, p.id));
  }
  console.log(`\n  Wrote ${plan.length} settlement descriptions.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
