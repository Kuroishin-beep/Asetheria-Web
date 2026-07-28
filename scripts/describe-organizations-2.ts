/**
 * Second half of the organization descriptions. Same method as
 * `describe-organizations.ts`: the deity's real cult supplies the character,
 * the type supplies the trade, the empire supplies the manners, and the five
 * years since the Treaty of Deiperdeum supply the trouble.
 *
 * The continental dark cults — Melted Ice, Mending Needle, Mother of
 * Corruption, Shaking Rest, Trumpeteer of Rest — name no deity in the export,
 * so they are grounded in the world instead: the Titans the codex records as
 * put down rather than killed, and the kingdoms that fell.
 *
 * Only fills entries whose body is empty. Never overwrites.
 *
 * Run with:  npx tsx scripts/describe-organizations-2.ts          (dry run)
 *            npx tsx scripts/describe-organizations-2.ts --apply
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

type Row = [string, string, string, string];

const ORGS: Row[] = [
  [
    "Sunward Valiants",
    "A Hellenorian mercenary company under Hermes — fast, mobile, and contractually impossible to pin down.",
    "Hermes as god of travellers, boundaries, heralds and luck — and the herald's inviolability.",
    `Hermes crosses boundaries for a living, and so does the company: light infantry and skirmishers who march faster than anyone expects and are gone before the reply arrives.

Their contracts reflect the god. A Valiant company will not hold a line, will not garrison, and reserves the right to withdraw on notice — terms that sound worthless until an employer needs a pass seized before dawn or a supply train intercepted three valleys away.

They also carry heralds' privileges, and take them seriously: a Valiant carrying a parley flag has never been known to break it, in a century of work for employers who occasionally wished otherwise. It is the only part of their contract that is not negotiable.`,
  ],
  [
    "The Order of Morning's Rise",
    "Nike's mercenaries — a company that takes only contracts it expects to win, and has the record to prove it.",
    "Nike, the winged personification of victory, who attends the winner rather than the just.",
    `Nike does not care who deserves to win. She attends the victor, and the Order has built an unusually honest business model on that theology.

They vet contracts. Before signing, the Order assesses the campaign and declines anything it judges unwinnable — publicly, and with reasons. This has made them expensive, made their acceptance a form of endorsement, and made their refusal a political event: a war the Morning's Rise has turned down is a war whose backers start hearing questions.

Their record is accordingly superb and slightly fraudulent, which they cheerfully concede. Since the Treaty they have refused every offer put to them, and every offer put to them has been an Invictian Legate's.`,
  ],
  [
    "Triumphant Vanguard of Glory",
    "Victoria's order — keepers of the Imperium's triumphs, now curating parades for a war that ended in a treaty.",
    "Victoria and the Roman triumph: the strictly regulated procession that legitimised a general.",
    `The triumph in the [[Imperium Invicta]] was never a parade. It was a legal award with conditions — a threshold of enemy dead, a war concluded, a general who held the right command — and the Vanguard exists to police those conditions.

This was uncontroversial while the Imperium was winning wars. It has become the most awkward office in the capital now that it is not. The Treaty of Deiperdeum ended the fighting without a victory, and by the Vanguard's own rules no triumph is owed to anyone for it.

Three Legates have applied. The Vanguard has refused three times, correctly, and its Master has taken to travelling with an escort.`,
  ],
  [
    "The Obsidian Phalanx",
    "Bellona's order — heavy infantry who serve the war rather than the state, and whose loyalty is a live question.",
    "Bellona, the Roman war goddess whose temple stood outside the pomerium, where the Senate met foreign envoys and declared war.",
    `Bellona's temple stood outside the sacred boundary of the capital, because war is a thing conducted beyond the walls and admitted inside only under conditions. The Phalanx has always been quartered accordingly — near Aeterna, never in it.

They are the heaviest infantry the Imperium fields and among its oldest formations, and their oath is to Bellona rather than to the Dominus Militum, a distinction that mattered to nobody for eight hundred years.

It matters now. The Council of Legates has been probing whether an order sworn to war has any obligation to a peace, and the Phalanx's officers have declined to answer, which is itself an answer. They remain outside the walls. Everyone has noticed that they are also, for the first time in living memory, at full strength.`,
  ],
  [
    "Verdant Sentinel Order",
    "Diana's knights — wardens of the Imperium's sacred groves and boundaries, and the last authority the frontier respects.",
    "Diana as goddess of the hunt, wild places and boundaries, whose grove at Nemi was guarded by a priest who held the office by combat.",
    `Diana holds the wild and the edge of things, and her order patrols exactly that: the Imperium's groves, its forest boundaries, and the frontier where the roads stop being roads.

The Sentinels are the only Invictian authority most frontier villages ever see, and they have accordingly acquired functions no charter gives them — settling disputes, licensing hunts, escorting tax collectors who would otherwise not return.

The order's oldest custom is uncomfortable and still observed at one grove: its warden holds the post until another takes it from him, in single combat, at the grove. The current warden has held it for nineteen years. The Order does not discuss the arrangement with outsiders and has resisted every attempt by the capital to abolish it.`,
  ],
  [
    "The Ironclad Oath",
    "An Acheaorian military order sworn to Vatagatal — bound to a promise rather than a satrap, which is why the throne tolerates them.",
    "The Achaemenid tradition of the oath sworn directly to the King of Kings, bypassing the satrap.",
    `In an empire where a satrap's troops are a satrap's troops, the Ironclad Oath is the exception: its members swear directly, and their oath is to a promise rather than to a person or a province.

This makes them the throne's most reliable instrument and its most inconvenient one. They cannot be suborned by a satrap, because he did not raise them. They also cannot be ordered to do anything inconsistent with the oath, and the oath is specific about not making war on the empire's own subjects.

The Court of Vipers has spent five years discovering how much of the current unrest that clause covers. So far the answer has been: most of it.`,
  ],
  [
    "The Lion's Mane Vanguard",
    "Acheaorian heavy cavalry under Hajama — the satraps' pride, magnificent on parade and increasingly loyal to whoever pays.",
    "The Persian noble cavalry, raised and equipped by regional magnates rather than the crown.",
    `Armoured lancers raised from the noble houses of the satrapies, mounted on the heavy plateau-bred horse, and the most visually impressive force on the continent.

The problem is structural and old: the Vanguard's squadrons are raised, equipped and paid by the satraps, not by the throne. Their loyalty in a crisis has always been an open question, and for fifteen centuries the question stayed theoretical because there was an external enemy.

There is no longer an external enemy. Two satraps have expanded their squadrons beyond the establishment permitted, filed the correct paperwork, and received no reply — because the [[Scribes of the Infinite Ledger]] forwarded the returns and nobody at court wished to be the one to act on them.`,
  ],
  [
    "The Dawnfire Alchemists",
    "Aurora's apothecaries — dawn-gathered preparations, a difficult schedule, and the Imperium's best burn treatments.",
    "Aurora, goddess of the dawn, and the ancient pharmacological insistence on gathering at a particular hour.",
    `Aurora is the dawn specifically, and the guild's practice is built on the old pharmacological conviction that when a thing is gathered changes what it does.

Whether or not that is true, the discipline it imposes is real: Dawnfire preparations are made from material cut within a fixed window before sunrise, which means the guild's members work hours nobody would choose and can prove exactly when a batch was made. Their records are consequently excellent, and their product is consistent.

Their speciality is burns — salves, dressings, and the staged treatment of them — which they developed for the [[Forge of Vulcan]]'s smiths and refined, at length, during the war. It is the one thing every field surgeon in three empires buys from the same supplier.`,
  ],
  [
    "The Golden Scythe Accord",
    "Demeter's farmers in Hellenoria — the grain accord that decides which city-states eat in a bad year.",
    "Demeter as grain goddess, and the Greek grain trade on which the city-states depended for survival.",
    `The Hellenorian grain accord, sworn to Demeter, coordinating supply across city-states that grow nothing like enough to feed themselves.

The League's cities are maritime and mountainous, and the arithmetic has never worked: Hellenoria imports its bread, and always has. The Accord manages the shortfall — contracting cargoes, allocating them, and in a bad year deciding, in effect, which city goes short.

That power is enormous and is exercised by a body with no constitutional standing whatsoever. The Accord's authority rests entirely on the fact that every city needs the next allocation more than it needs to punish the last one. The tyrants have been testing this, and the Accord has begun quietly requiring payment in advance from cities it does not trust.`,
  ],
  [
    "The Hearthfire Sanctum",
    "Hestia's order — keepers of the civic hearth, whose fire is carried to every new colony and has never been allowed to go out.",
    "Hestia and the prytaneion: the civic hearth of a Greek city, from which colonists carried fire to found a new one.",
    `Hestia takes the first offering and has no myths, because a hearth does not need adventures. Her Sanctum keeps the civic fire of the Hellenorian cities.

The practice is genuinely load-bearing. A new colony is founded by carrying fire from the mother city's hearth, and that act — not a charter or a treaty — is what makes the colony a daughter rather than a rival. The Sanctum controls the fire, and so the Sanctum has an unspoken veto over Hellenorian expansion.

They have never used it aggressively and have refused twice, both times to tyrants proposing colonies that were obviously garrisons. Neither refusal was explained. Neither colony was founded.`,
  ],
  [
    "The Ecliptica Arcanum",
    "Athena's magical society — strategy, craft, and the doctrine that a working should be planned before it is cast.",
    "Athena as goddess of strategic warfare and skilled craft, opposed in temperament to Ares' violence.",
    `Athena is the war goddess of the plan rather than the slaughter, and the Ecliptica have taken that division seriously enough to build a school on it.

Their working method is preparatory to the point of tedium: contingencies drawn, sequences rehearsed, failure modes assigned. An Ecliptica mage on a battlefield is usually doing something unimpressive that was decided three weeks earlier and that removes the need for anything impressive.

They and the [[Obsidian Veins]] regard each other with total incomprehension. The Ecliptica's standing observation is that Dionysian practice produces marvellous stories and unreliable outcomes, and that they are in the business of outcomes.`,
  ],
  [
    "The Eclipsed Mirror",
    "Hecate's society — crossroads magic, and the only order that will work at the boundary between one thing and another.",
    "Hecate, goddess of crossroads, thresholds, night and the passage between states.",
    `Hecate stands where roads meet and where one condition becomes another, and the Eclipsed Mirror works exclusively at those joins: doorways, boundaries, the turn of the year, the moment of death, the point at which a thing stops being itself.

This is legitimately dangerous and legitimately useful, and the League's attitude to them is correspondingly two-faced. The order is proscribed in four city-states and quietly consulted by three of the four.

Their rule is that a threshold cannot be crossed in only one direction. Whatever the Mirror opens, it opens both ways, and the order will not perform a working for a client who has not understood that. Clients frequently believe they have understood it.`,
  ],
  [
    "The Nightweaver Syndicate",
    "Nyx's secret society — older than the gods they hide from, trading in what happens while the city sleeps.",
    "Nyx, primordial night, whom even Zeus feared to offend in the Iliad.",
    `Nyx is not an Olympian. She is older, and the one power in the old accounts that the king of the gods declined to cross. The Syndicate makes a great deal of this and is not entirely wrong to.

They operate at night and in the specific: what was moved, who left a house, which ship sailed unlisted. They are not thieves — that is the [[Veilborn Syndicate]]'s trade — but brokers of nocturnal fact, and their clientele is drawn from every faction that would deny knowing them.

The order's protective claim is that Nyx predates the pantheons and is therefore outside their jurisdiction, which the Hellenorian priesthoods reject and have never quite acted on. It is not clear whether the hesitation is theological or practical.`,
  ],
  [
    "The Obsidian Masquerade",
    "A Dionysian secret society where rank is hidden behind masks — and the mask, not the man, holds the office.",
    "Dionysus as god of the mask and the theatre, and the ritual dissolution of ordinary identity.",
    `Dionysus is the god of the mask, and the Masquerade has built its constitution on the principle that the mask is the officeholder.

Members are known only by their masks, which are inherited, and the person behind one is irrelevant to the order's business. A mask's authority, debts and enemies pass to whoever wears it next, and the wearer may be replaced without any outsider noticing.

The practical effect is an organisation that cannot be decapitated and cannot be reliably infiltrated, since an infiltrator learns a mask rather than a man. It also means the Masquerade has, on at least two documented occasions, continued issuing instructions on behalf of a member who had been dead for years.`,
  ],
  [
    "The Enchanted Muse",
    "An Acheaorian magical society under Selan — moon-work, tides of the mind, and the empire's most respected dream-readers.",
    "The lunar cults of the Near East and the ancient practice of reading dreams as diagnostic rather than prophetic.",
    `A society working under the moon's authority, in an empire whose calendar, festivals and agricultural year all run on it.

Their speciality is the dream. Where the [[Healer’s Sanctuary]] treats dreams as diagnosis, the Muse treats them as tide — something that moves on a schedule, affects everyone at once, and can be predicted. They publish an almanac of it, and enough Acheaorian officials plan around the almanac that its predictions have acquired a certain self-fulfilling quality.

The Magi have never condemned them, which is unusual, and the Muse takes care not to test why. Their work touches the calendar, and the calendar is the Magi's.`,
  ],
  [
    "The Illuminated Scholars",
    "Zann's scholars — the Acheaorian archive-keepers who copy everything and lend almost nothing.",
    "The Near Eastern palace archive: clay, seal, and a scribal class whose power lay in retrieval.",
    `Sworn to the god of records, the Scholars maintain the great archives of [[Acheaoria]] — tribute rolls, land grants, genealogies, and the accumulated correspondence of two thousand years of administration.

Their institutional conviction is that nothing should be destroyed and very little should be circulated. Access requires a petition, a purpose, and usually a wait, and the Scholars are entirely unembarrassed about this: their position is that an archive that lends freely is an archive that is being edited by its borrowers.

They work closely with the [[Scribes of the Infinite Ledger]], who audit, and there is a standing joke that the Scribes find out what is true while the Scholars find out what was previously claimed.`,
  ],
  [
    "The Sage's Archive",
    "An Acheaorian magical society under Kor — they read the empire's oldest inscriptions, and have begun to disagree with the official versions.",
    "The Behistun inscription and the Achaemenid habit of carving the official account of a reign into a cliff.",
    `The empire's kings record their reigns on rock faces, in several languages, high enough to be permanent and inconvenient enough to be difficult to check. The Archive checks them.

Its members are epigraphers and translators, and their work has always been antiquarian and harmless. It stopped being harmless about a decade ago, when the Archive began publishing readings of the older inscriptions that do not match the dynastic history the court maintains — a usurpation described as a succession, a defeat described as a punitive expedition, a satrapy that appears and then does not.

The Archive insists this is philology. The Court of Vipers has not yet decided whether to agree, and the Archive's senior members have begun making copies of their notes.`,
  ],
  [
    "The Stormcallers' Choir",
    "Acheaorian weather-workers who sing the seasonal storms in — indispensable to the farmers, and blamed for every drought.",
    "The weather-rite specialist of the ancient agrarian world, credited in a good year and blamed in a bad one.",
    `A magical society that works in weather, chiefly the seasonal rains on which the Acheaorian dry-farming belt depends.

Whether they cause the rain is not a question the Choir considers useful. They sing the rites at the correct times, the rains have historically come, and the causal question is left to philosophers who do not farm. What is beyond dispute is that the Choir's timing is exact and its almanac is the best in the empire.

The exposure is obvious. In a drought year the Choir is blamed, has been driven from three provinces in living memory, and always returns — because whatever the theology, nobody else knows when to plant.`,
  ],
  [
    "The River's Embrace",
    "An Acheaorian order under Shajar tending the river shrines — and quietly running the ferries and the flood warnings.",
    "The river cults of Mesopotamia and the practical religion of flood prediction.",
    `An order of the river shrines, whose religious function is inseparable from a civil one: the priests keep the gauges.

Flood is the central fact of life along the Acheaorian rivers, and the Embrace's shrines have recorded high-water marks for over a thousand years. A priest can tell a village what the river did in a comparable year and what it will probably do this one, and the accuracy of that is the whole basis of the order's standing.

They also run most of the ferries, which is less holy and more lucrative. The two functions support each other neatly: the order knows when the river is safe to cross because it is the order that has been measuring it.`,
  ],
  [
    "Vaults of Equilibrium",
    "An Acheaorian banking order under Bala — the empire's counterweight to the Mithril Reserve, and losing.",
    "The temple-bank of the ancient Near East, lending and holding deposits under divine sanction.",
    `The Acheaorian answer to a foreign bank holding the empire's credit: a banking order, temple-based, lending on the authority of a god rather than a charter.

The Vaults are older than the [[Mithril Reserve]] and were, for most of their history, larger. They have been losing ground steadily for a century for a structural reason they cannot fix — their notes are honoured within [[Acheaoria]] and nowhere else, while a Reserve letter of credit is good in every major city on the continent.

Their response has been to lend to the satrapies at rates the Reserve will not match, which has won them business and an increasingly alarming book of debt owed by provinces that have stopped forwarding tribute.`,
  ],
  [
    "Wheelwalkers",
    "Acheaorian road merchants under Jauhar — caravan folk who own no land, keep no house, and are related to everyone.",
    "The caravan trading families of the Silk Road, whose commercial network was a kinship network.",
    `Caravan traders whose entire capital moves. Wheelwalkers own no fixed property by custom, marry within a network of allied families, and treat a permanent house as the beginning of decline.

The kinship structure is the business. A Wheelwalker arriving in a strange caravan city has a cousin there, and the cousin is the reason the goods clear, the warehouse is honest, and the local price is known before the bargaining starts. No contract enforcement is required in a system where cheating a trading partner means cheating a relative.

They deal heavily with the [[Gilded Vault]] and are the reason portable wealth moves at all in the current unrest — a Wheelwalker convoy will go where nothing insured will.`,
  ],
  [
    "The Exiled Wanderers",
    "An Acheaorian tribe of the dispossessed under the Lost One — a people the empire uprooted and has never been able to resettle.",
    "The Achaemenid practice of mass deportation, resettling conquered populations far from home.",
    `Acheaoria's traditional method with a rebellious people was not slaughter but relocation — moving a population a thousand miles and settling it among strangers, where it could not raise a revolt because it had no ground to raise one on.

It worked, mostly, and it produced the Wanderers: the descendants of groups moved so often that the relocations lost their point. They have no home province to be returned to and no memory of one that agrees with any other family's.

They now travel by choice, work as drovers, harvesters and messengers, and are regarded by settled Acheaorians with a mixture of contempt and unease. The unease is the older feeling. Everyone on the plateau knows that a family's presence in a place is an administrative decision, and that decisions are revisited.`,
  ],
  [
    "The Savage Pack",
    "An Acheaorian frontier tribe living by the beast-ways beyond the qanat line, where the empire's writ simply stops.",
    "The nomadic frontier peoples of the Iranian plateau, outside the irrigated zone and outside imperial administration.",
    `Beyond the last channel of [[The Qanat Network]] the water stops and, with it, the empire. The Pack lives out there.

They are herders and hunters organised by kin rather than by satrapy, they pay no tribute, and the throne's official position is that they are Acheaorian subjects in a district whose administration is temporarily unassigned. This has been the official position for four hundred years.

Their relationship with the settled belt is a working one: they trade hides, sell knowledge of the deep country, and raid in bad years. The satraps' response has never varied — punitive expeditions in a good decade, subsidies in a bad one — and the Pack has learned to tell which decade it is faster than the satraps do.`,
  ],
  [
    "The Shadow Court",
    "An Acheaorian secret society under Lotha — a parallel court that shadows the real one, office for office.",
    "The Achaemenid court's eunuch administration and the reality of power exercised through the household rather than the throne.",
    `The Acheaorian court has always had two structures: the offices as constituted, and the household that actually delivers decisions. The Shadow Court is the second one, organised and made deliberate.

For every office at [[Persemenid City]] there is a corresponding member — someone who is not the chamberlain but who is consulted before the chamberlain acts. Membership is invisible from outside and, according to defectors, frequently invisible from inside.

The Court's aim is stability rather than power, which is what makes it dangerous. It has smoothed three successions and, on at least one occasion described in [[Political]], decided one. The King of Kings is understood to know it exists. Whether he knows who is in it is a different question.`,
  ],
  [
    "The Undying Legion",
    "A proscribed Acheaorian society under Thasmudayan, who claim their dead are still enrolled — and muster to prove it.",
    "The Achaemenid Immortals' constant strength, taken to a heretical literal conclusion.",
    `A heresy grown directly out of [[The Ten Thousand]]'s central conceit. If the guard's number never falls because the fallen are replaced the same day, the Legion asks, in what sense did the number ever fall at all — and if it did not, in what sense did the man?

Their doctrine holds that the enrolled dead remain enrolled. The Legion musters at strength, counts its rolls aloud, and includes names of men nobody living has met. Outsiders who have seen a muster report that the count is answered.

The empire has proscribed them, unusually harshly, and the harshness is itself informative: [[Acheaoria]] does not normally expend that much effort on a small cult with a strange idea about arithmetic.`,
  ],
  [
    "Veilborn Syndicate",
    "Acheaorian thieves under Lotha — organised, licensed in all but name, and careful never to be worth suppressing.",
    "The tolerated criminal guild of the ancient city, surviving by staying below the threshold of official attention.",
    `A thieves' guild operating across the Acheaorian caravan cities, and a masterclass in remaining beneath notice.

Their governing rule is a ceiling. The Syndicate does not steal above a certain value, does not touch temple property, does not touch the [[Gilded Vault]], and disciplines its own members savagely for breaches — because a guild that costs a satrap less than a crackdown would cost him is a guild that is never cracked down upon.

They are, in consequence, the most stable criminal organisation on the continent and by some distance the least ambitious. Younger members periodically argue that the ceiling is cowardice. The Syndicate's elders point at the [[Gallienain Cult]], which has been hunted for three centuries, and the argument ends.`,
  ],
  [
    "The Chyrsus Syndicate",
    "A continental merchants' guild pursuing wealth and influence without pretending otherwise — the closest thing to a cartel.",
    "The publicani, Rome's tax-farming companies: private syndicates that bid for state revenue and extracted more than they paid.",
    `The Syndicate bids for contracts that states would rather not administer — tax collection in the difficult provinces, harbour dues, the tolls on the dry bed of [[Xeruezcho Canal]].

The model is old and reliably corrosive. The Syndicate pays a fixed sum up front, takes the revenue, and keeps the difference, which gives it every incentive to extract as much as the province will bear and no incentive at all to care what happens afterwards.

All three empires use them, all three complain about them, and none can stop, because the alternative is administering the awkward provinces directly and none of the three currently can. The Syndicate's contracts have grown notably longer since the Treaty.`,
  ],
  [
    "The Veiled Caste",
    "A continental circle holding that power should be exercised by people nobody can name — and demonstrating it.",
    "The philosophical defence of government by an unseen elite, as old as Plato's guardians.",
    `A philosophical circle with an argument rather than a god: that visible authority is inherently unstable, because it can be flattered, threatened and replaced, and that durable government is therefore anonymous.

They do not conspire so much as advise, and they advise everywhere — Invictian Legates, Hellenorian oligarchs, Acheaorian satraps. Members are forbidden to hold office themselves, which they present as principle and their critics present as a method of avoiding consequences.

The Caste's inconvenient feature is that its argument is partly correct. The most stable institutions described in the codex — the [[Mithril Reserve]], the [[The Shadow Court]], the [[Amphictyony of Delphara]] — all work exactly as the Caste says they should, and none of them is accountable to anyone.`,
  ],
  [
    "The Whispering Eyes",
    "A continental society trading in forbidden knowledge — they sell what the archives will not lend, and remember who bought.",
    "The private intelligence broker of antiquity, and the reality that suppressed knowledge acquires a market price.",
    `Where the [[The Illuminated Scholars]] will not lend and the [[Alexandria Sanctum]] will not release, the Whispering Eyes sell.

Their stock is material that is proscribed, sealed or simply denied: readings of struck-out inscriptions, copies of deep-shelved texts, and the specific unwelcome facts that the three empires have decided are not facts. Their sourcing is not explained and their prices are severe.

The dangerous part is not the buying. It is that the Eyes keep a record of every transaction, and a client's second visit is priced with reference to the first. Nobody has established what they do with the accumulated list of who wanted to know what, and the fact that nothing has visibly been done with it is not reassuring.`,
  ],
  [
    "The Sanctuary of the Silver Veil",
    "A continental society hoarding arcane knowledge to keep it out of use — preservation as a form of suppression.",
    "The closed magical tradition that restricts transmission on the grounds that the knowledge is too dangerous to teach.",
    `The Sanctuary collects magical knowledge and does not use it, teach it, or allow it to be rediscovered. Its doctrine is that certain workings were correctly abandoned and that the only reliable way to keep them abandoned is to hold the sole copy.

This is preservation and suppression at once, and the order is untroubled by the tension. Its members are archivists rather than practitioners, several are notably weak mages, and the Sanctuary regards that as a qualification.

Its natural enemy is the [[The Whispering Eyes]], which exists to sell exactly what the Sanctuary exists to bury, and the two have been quietly at war for a century — a war conducted almost entirely through burglary, forged catalogues, and the occasional very selective fire.`,
  ],
  [
    "Writhing Curiosity",
    "A continental society that experiments where others will not, publishes nothing, and is chiefly known by its results.",
    "The transgressive natural-philosophical tradition: inquiry pursued past the point where the culture withdrew consent.",
    `An order defined entirely by a refusal to stop. Its members investigate what other societies have ruled closed — not from malice, by all available evidence, but from an inability to leave a question alone.

Nothing is published. What is known of the Curiosity is known from what turns up: a village whose livestock breed true to a pattern nobody selected, a stretch of coast where the tide is eleven minutes early, a corpse that will not decay and was, according to the parish, a volunteer.

All three empires proscribe them. The [[Sanctuary of the Silver Veil]] hunts them with more energy than any state does, which suggests the Sanctuary knows something about the order's direction of travel that the states do not.`,
  ],
  [
    "Watchers of the Eternal Rest",
    "Senectus's circle — they administer the Imperium's pensions and are the reason the veteran arrears are documented.",
    "Senectus, the Roman personification of old age; and the Roman military pension, whose non-payment repeatedly caused mutiny.",
    `Senectus is old age as a fact rather than a blessing — grim, undignified, and arriving regardless — and the Watchers approach it with the same lack of sentiment.

Their business is provision for the end of a working life: pensions, annuities, the disposal of estates, and above all the veterans' entitlements. The Watchers hold the registers of who was promised what on discharge, and those registers are the single most inflammatory set of documents in the [[Imperium Invicta]].

They have refused to amend them. Three times since the Treaty the treasury has proposed a reconciliation of the rolls that would have quietly reduced the total owed, and three times the Watchers have declined and published the request. The [[Crimson Warlords]] have taken to posting a guard on their archive, unasked.`,
  ],
  [
    "The Adamantine Line",
    "A defensive order with no recorded patron, no charter, and a name that appears in the muster rolls of all three empires.",
    "Grounded in the codex itself: an organization the export records with no type, allegiance, sphere or dedication.",
    `The codex holds a name and nothing else. The Adamantine Line has no recorded type, no allegiance, no sphere, and no dedication — the only organization in the archive whose entry is blank in every field.

What is documented sits outside the order's own records. The name appears in Invictian muster returns, in a Hellenorian harbour levy, and in an Acheaorian tribute schedule, always as a body present and never as one raised. In each case it is listed as holding a position rather than taking one.

The obvious conclusions have all been drawn. That it is a clerical fiction repeated across three bureaucracies; that it is a cover; that it is older than the empires and has simply continued being written down. No archive on the continent has produced a document in which the Line describes itself.`,
  ],
  [
    "Melted Ice",
    "A continental dark cult that gathers where the old ice retreats, and takes what the retreat uncovers.",
    "Grounded in the codex's Titans, recorded as put down rather than killed — and in what a thaw exposes.",
    `One of the continental dark cults, and the least theatrical of them. Melted Ice has no temple, no calendar, and no doctrine that anyone has recorded. It has a practice: it goes where ice has withdrawn and it collects.

The high ground of the northern ranges has been giving up ground for a century, and the ice does not release only rock. The cult's interest is in the older material — the worked pieces, the proportioned-for-something-larger pieces of the kind found on [[Vael’Tharan Mountain]] — and it reaches them first with a consistency that suggests it knows where to look.

Nothing collected has ever been recovered from the cult. Its members are unremarkable, frequently local, and answer questions about the work with what observers describe as patience rather than evasion.`,
  ],
  [
    "Mending Needle",
    "A continental artisan cult that repairs what should have been left broken, for people who should have known better.",
    "Grounded in the codex's own dark cults, and the very old bargain in which restoration carries a cost paid later.",
    `An artisan cult of restorers. They will mend anything: a shattered heirloom, a ruined manuscript, a body. The work is exceptional, the price is modest, and the terms are the problem.

The Needle's craftsmen do not accept payment at the time of work. An account is opened, the sum is agreed, and collection is at the cult's discretion — later, and in a form the cult specifies. Clients sign willingly, because at the moment of asking they are not thinking about the terms.

The cult is scrupulous. It has never been shown to have overcharged, misrepresented, or refused an itemised account. Every documented grievance against Mending Needle is a grievance about what the client agreed to.`,
  ],
  [
    "Mother of Corruption",
    "A continental dark cult holding that decay is the only honest process, and hastening it as an act of respect.",
    "Grounded in the codex's dark cults, and the antique idea of a devouring mother-power older than the civic gods.",
    `The largest and most doctrinally coherent of the continental dark cults, and the one the three priesthoods find hardest to argue with.

Its position is that everything the empires have built is in the process of ending, that this is neither tragedy nor punishment but simply what happens, and that the honest response is to help. Cult members do not usually destroy. They neglect — a maintenance schedule not kept, a repair deferred, a record allowed to be lost.

This makes them nearly impossible to prosecute and extremely difficult to detect. The failing spans of [[The Aqua Aeterna]], the silted [[Xeruezcho Canal]] and the abandoned northern qanats are all attributed to the Mother by someone, and in no case has anything been proved.`,
  ],
  [
    "Shaking Rest",
    "A continental dark cult that attends the dying and insists, gently, that rest is not what waits.",
    "Grounded in the codex's dark cults, and the ancient anxiety that the dead are not at peace but merely still.",
    `A cult of the deathbed. Its members attend the dying — invited, usually, and often welcomed, because they are calm, competent and unpaid — and what they say to the dying is the whole of the offence.

The orthodox rites of all three empires promise rest. Shaking Rest tells the dying, quietly and without cruelty, that rest is a comfort invented by the living, and that what is coming is continuation of a kind the pantheons decline to describe.

Whether this is true is not a question the priesthoods can settle by argument, which is why they have settled it by proscription. The cult continues regardless, and the [[Cycle of the Eternal Bloom]] reports finding its marks at perhaps one funeral in forty.`,
  ],
  [
    "Trumpeteer of Rest",
    "A continental dark cult waiting for a signal, with instruments prepared and no explanation of what the signal is for.",
    "Grounded in the codex's dark cults, and the eschatological tradition of a horn that ends the settled order.",
    `The strangest of the continental dark cults, and the only one whose practice is entirely preparatory.

Its members maintain instruments — horns, mostly, of considerable age and unhelpful metallurgy — and they rehearse. They rehearse in isolated places, at intervals the cult will not explain, playing a piece nobody outside the order has heard in full. Fragments recovered from captured members are, according to musicians who have examined them, structurally unlike anything in the continental tradition.

They do not proselytise or resist arrest. Asked what the signal announces, captured members have given the same answer for two hundred years: that it is not an announcement, and that they are not the ones who will hear it.`,
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
    if (hit.body.trim()) continue;
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
