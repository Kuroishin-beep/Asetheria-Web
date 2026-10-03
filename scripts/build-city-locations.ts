/**
 * Builds `data/city-locations.json`: the places *inside* Asetheria's capitals
 * and major cities, each filed under its city.
 *
 * Two kinds of place:
 *
 *  - **Common** — what every city of an empire has, in that empire's idiom.
 *    An Invictian city has a forum, baths, a basilica and a garrison camp; a
 *    Hellenorian city an agora, a temple precinct, a gymnasion and a theatre;
 *    an Acheaorian city a bazaar, a fire-temple, a caravanserai and a water-court.
 *    The shared paragraph explains the institution (grounded in its Roman, Greek
 *    or Achaemenid original); the second paragraph is that city's own version,
 *    taken from the city's write-up.
 *  - **Unique** — the landmarks each city's write-up already names but the
 *    codex had no page for: Corinth's haulway, Persemenid's stair, Deiperduem's
 *    Treaty Hall, Mavelon's eleven bridges.
 *
 * Culture follows each city's written description. Two cities' tags disagree
 * with their text (Thessalonika is tagged Invictian but written as a League
 * city; Aepistra the reverse) — the text wins here and the tags are left for
 * the DM to settle.
 *
 * It also files existing pages under their city (Duneforged's districts and
 * temples, the Aqua Aeterna, the Paradise of Persemenid, the Palace of Eronis)
 * and writes the two thin Duneforged pages.
 *
 * Load with:  npx tsx scripts/import-codex-file.ts data/city-locations.json --fill-empty
 * Run with:   npx tsx scripts/build-city-locations.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");

type Culture = "invictian" | "hellenorian" | "acheaorian";
type City = { slug: string; name: string; short: string; culture: Culture };

const CITIES: City[] = [
  { slug: "aeterna-city", name: "Aeterna City", short: "Aeterna", culture: "invictian" },
  { slug: "romulo-city", name: "Romulo City", short: "Romulo", culture: "invictian" },
  { slug: "mavelon-city", name: "Mavelon City", short: "Mavelon", culture: "invictian" },
  { slug: "ephelanum-city", name: "Ephelanum City", short: "Ephelanum", culture: "invictian" },
  { slug: "aepistra-city", name: "Aepistra City", short: "Aepistra", culture: "invictian" },
  { slug: "hellarchon-city", name: "Hellarchon City", short: "Hellarchon", culture: "hellenorian" },
  { slug: "corinth-city", name: "Corinth City", short: "Corinth", culture: "hellenorian" },
  { slug: "delphara-city", name: "Delphara City", short: "Delphara", culture: "hellenorian" },
  { slug: "helionyx-city", name: "Helionyx City", short: "Helionyx", culture: "hellenorian" },
  { slug: "thebesieas-city", name: "Thebesieas City", short: "Thebesieas", culture: "hellenorian" },
  { slug: "thessalonika-city", name: "Thessalonika City", short: "Thessalonika", culture: "hellenorian" },
  { slug: "persemenid-city", name: "Persemenid City", short: "Persemenid", culture: "acheaorian" },
  { slug: "atarabad-city", name: "Atarabad City", short: "Atarabad", culture: "acheaorian" },
  { slug: "mithratal-city", name: "Mithratal City", short: "Mithratal", culture: "acheaorian" },
  { slug: "persevalis-city", name: "Persevalis City", short: "Persevalis", culture: "acheaorian" },
  { slug: "xerastri-city", name: "Xerastri City", short: "Xerastri", culture: "acheaorian" },
];

// ---------------------------------------------------------------------------
// Common institutions
// ---------------------------------------------------------------------------

type Common = {
  key: string;
  title: (c: City) => string;
  type: string;
  tier: "site" | "district";
  summary: (c: City) => string;
  shared: string;
};

const COMMON: Record<Culture, Common[]> = {
  invictian: [
    {
      key: "forum",
      title: (c) => `The Forum of ${c.short}`,
      type: "Forum",
      tier: "site",
      summary: (c) => `${c.short}'s civic square, where law, market and religion share one pavement.`,
      shared:
        "Every Invictian city is laid out around a forum: a paved, colonnaded square with the basilica on one side, the chief temple on another and the speakers' platform between them. Proclamations are read here, elections are canvassed here, and the price of bread is argued about here in public. It is the Roman forum, and an Invictian abroad navigates by it.",
    },
    {
      key: "baths",
      title: (c) => `The Baths of ${c.short}`,
      type: "Public Baths",
      tier: "site",
      summary: (c) => `${c.short}'s public baths, where the city does its bathing, its gossip and most of its business.`,
      shared:
        "Invictian baths are civic, cheap and nearly universal: a sequence of cold, warm and hot rooms over a furnace-heated floor, an exercise yard, and benches enough for a city's business to be conducted in them. Most citizens bathe daily. Most deals are made wet.",
    },
    {
      key: "basilica",
      title: (c) => `The Basilica of ${c.short}`,
      type: "Law Courts",
      tier: "site",
      summary: (c) => `${c.short}'s hall of law: courts, contracts and the property registers under one roof.`,
      shared:
        "The basilica is an Invictian city's hall of law: a long roofed hall with an apse at the far end where the magistrate sits. Cases are heard, contracts witnessed and property registered under one roof and in public, on the principle that law done privately is not law.",
    },
    {
      key: "garrison",
      title: (c) => `The ${c.short} Garrison`,
      type: "Legionary Camp",
      tier: "site",
      summary: (c) => `The legion's camp at ${c.short}, kept outside the sacred line as Invictian law requires.`,
      shared:
        "Invictian law keeps soldiers outside a city's sacred boundary, so the garrison stands beyond the walls: a rectangular fortress on the standard plan, a gate on each side, the headquarters at the crossing of the two main streets. Since the Treaty of Deiperdeum, who these camps answer to has become the Imperium's central question.",
    },
  ],
  hellenorian: [
    {
      key: "agora",
      title: (c) => `The Agora of ${c.short}`,
      type: "Agora",
      tier: "site",
      summary: (c) => `${c.short}'s agora: market, assembly ground and the place anyone may speak.`,
      shared:
        "Every Hellenorian city has its agora: an open square framed by stoas, where the market trades in the mornings, the courts sit in the colonnades, and the citizen body meets to argue. It is the Greek agora exactly, and its rule is the League's: anyone may speak, and everyone will answer.",
    },
    {
      key: "precinct",
      title: (c) => `The Temple Precinct of ${c.short}`,
      type: "Sanctuary",
      tier: "site",
      summary: (c) => `The walled sacred ground of ${c.short}, home of its patron's temple and its dedications.`,
      shared:
        "A Hellenorian sanctuary is a walled sacred ground, a temenos, around the city's chief temple: altar outside, cult image within, and every open space crowded with dedications from citizens who want the god and their neighbours to know what they gave. Each city keeps its own patron and its own version of the story.",
    },
    {
      key: "gymnasion",
      title: (c) => `The Gymnasion of ${c.short}`,
      type: "Gymnasion",
      tier: "site",
      summary: (c) => `${c.short}'s gymnasion: exercise ground, school and the citizens' club.`,
      shared:
        "The gymnasion is exercise ground, school and club at once: a running track, a wrestling floor, and colonnaded rooms where teachers lecture and old men talk politics. It is where Hellenorian boys become citizens, and where the League's philosophers find their audiences.",
    },
    {
      key: "theatre",
      title: (c) => `The Theatre of ${c.short}`,
      type: "Theatre",
      tier: "site",
      summary: (c) => `${c.short}'s open-air theatre, cut into the hillside for festival drama and the assembly.`,
      shared:
        "A Hellenorian theatre is cut into a hillside: a curve of stone seats above a circular dancing floor and a stage building behind it. Plays are performed only at festivals, in competition, before the whole citizen body. Between festivals the assembly often meets here, which is why so many plays are about politics.",
    },
  ],
  acheaorian: [
    {
      key: "bazaar",
      title: (c) => `The Bazaar of ${c.short}`,
      type: "Bazaar",
      tier: "district",
      summary: (c) => `${c.short}'s roofed market streets, each trade with its own lane, gate and warden.`,
      shared:
        "An Acheaorian bazaar is a district, not a square: roofed lanes laid out by trade, coppersmiths in one, spice-sellers in another, each lane with its own gate, its own warden and its own guild. Prices are bargained, never posted, and bargaining is a social ritual that a stranger is expected to fail at.",
    },
    {
      key: "fire-temple",
      title: (c) => `The Fire-Temple of ${c.short}`,
      type: "Fire-Temple",
      tier: "site",
      summary: (c) => `The house of ${c.short}'s sacred flame, kept by the Magi and never allowed to die.`,
      shared:
        "Every Acheaorian city of any size keeps a fire-temple, the Persian atashkadeh: a heavy, plain building around an inner chamber where the Magi tend a flame that must never go out. The public may see the fire through a screen but not approach it. The Magi's calendar, set by the tending of the fire, governs the working year.",
    },
    {
      key: "caravanserai",
      title: (c) => `The Caravanserai of ${c.short}`,
      type: "Caravanserai",
      tier: "site",
      summary: (c) => `The great walled inn at ${c.short} where caravans stable, sleep and trade.`,
      shared:
        "A caravanserai is a walled courtyard inn built for caravans: stabling and storerooms on the ground floor, lodging above, one fortified gate that is shut at night. Every road into an Acheaorian city ends at one, and each becomes a small foreign quarter of whoever travels that road.",
    },
    {
      key: "water-court",
      title: (c) => `The Water-Court of ${c.short}`,
      type: "Qanat Head",
      tier: "site",
      summary: (c) => `Where [[The Qanat Network]] surfaces at ${c.short} and the city's water shares are measured out.`,
      shared:
        "Acheaorian cities live on water brought underground from distant hills by [[The Qanat Network]]. Where the channel surfaces there is a water-court: a cool vaulted chamber where the flow is divided into shares, each measured by a timed bowl and owned by deed. The [[Bountiful Harvesters]] hold most of the shares, which is why the guild is quietly one of the powers in every Acheaorian city.",
    },
  ],
};

/** Each city's own version of the common institutions, from its write-up. */
const LOCAL: Record<string, Record<string, string>> = {
  "aeterna-city": {
    forum:
      "Aeterna's forum is the original that every other is copied from, and it is too small for the city it serves: hemmed in by seven centuries of temples and basilicas, crowded from dawn, and the place where [[The Annona]]'s grain shortfalls are first felt in the form of a crowd.",
    baths:
      "The great baths of the capital are free or nearly so, and they are where Aeterna actually lives. Business, gossip and politics happen here rather than in the tenements, which have no room for any of them.",
    basilica:
      "The capital's basilicas hear cases from across the Imperium. Their registers are where the city's bankers first noticed the coin was being debased, before the [[Temple of Juno]] said so at the quarterly assay.",
    garrison:
      "No legion may camp inside the sacred line, so Aeterna's soldiers sit beyond it: [[The Obsidian Phalanx]] in its ancient quarters, the Legates' retinues in the suburbs, and thousands of unpaid veterans with nowhere to go. Inside the walls the only armed body is [[The Vigiles]].",
  },
  "romulo-city": {
    forum:
      "Romulo's forum is the oldest in the Imperium and the smallest, a market square that became sacred by being first. The rebuilt founder's hut stands at one end of it.",
    baths:
      "Modest by the capital's standards, and built low like everything else inside the old walls. Romulans regard the scale as a virtue.",
    basilica:
      "Romulo's basilica keeps the guild charters, the Imperium's founding documents, in its vaults. They are read aloud in full once a year to a thin audience.",
  },
  "mavelon-city": {
    forum:
      "Mavelon's forum is plain, functional and loud, ringed with guild halls rather than temples, because in Mavelon the guilds are the government in everything but name.",
    baths:
      "The arsenal town's baths are fired from the mills' own furnaces and open before dawn for the forge shifts. The water downstream runs warm.",
    basilica:
      "Most cases in Mavelon's basilica are guild disputes: patents of method, apprentices poached, a bridge-guild's mark cut by the wrong hand.",
    garrison:
      "Mavelon's garrison is small, and that is its danger. The city does not have a large force; it has the capacity to equip one, and every Legate knows it.",
  },
  "ephelanum-city": {
    forum:
      "Ephelanum's forum is the commercial end of the marble street that runs from the harbour to the sanctuary, given over to the silversmiths' trade in votive models.",
    baths:
      "The baths serve pilgrims as much as citizens, and are the first stop for anyone arriving by sea before they climb to the goddess.",
    basilica:
      "Ephelanum's basilica hears the sanctuary's lending cases, for the temple here is also a bank.",
    garrison:
      "Small, and largely ceremonial. Ephelanum's real protection has always been its sanctuary status: sacking a great temple is a thing even tyrants think twice about.",
  },
  "aepistra-city": {
    forum:
      "Aepistra's forum sits exactly where the surveyors put it, at the crossing of the two main streets. A citizen of [[Aeterna City]] can find the law courts here without asking directions, and that is the point.",
    baths:
      "Built to the standard plan and more lavishly than the capital's, by a local elite anxious to be thought more Invictian than Aeterna.",
    basilica:
      "As a provincial capital, Aepistra's basilica handles tax assessment for the whole province. The tax-farming contract is held by [[The Chyrsus Syndicate]], the single most resented fact in the city.",
    garrison:
      "The legionary fortress stands two miles out, not in the city, and its Legate has been building a personal following among his veterans. The city council has noticed and can do nothing about it.",
  },
  "hellarchon-city": {
    agora:
      "Hellarchon's agora sits on the upper city's rock, beneath the acropolis. Here the assembly that commands the League's fleet meets and votes, and here the other cities' envoys wait to be heard.",
    precinct:
      "The great sanctuary crowns the acropolis, white stone visible a day out at sea. The Greater Panegyris ends here each year after its procession up from the harbour.",
    gymnasion:
      "Hellarchon's gymnasia feed the [[Arcane Academy]] as much as the athletic games: the city's young magi train their bodies and their arguments in the same colonnades.",
    theatre:
      "The theatre of the Dionysia, where for four days a year plays criticise the powerful with a licence that does not extend to the rest of the calendar.",
  },
  "corinth-city": {
    agora:
      "Corinth's agora is the busiest and least decorous in the League, crowded with shippers, toll-farmers and every people on the continent. Corinthian tolerance is a business decision.",
    precinct:
      "The port's temples are unusually well-endowed and unusually busy. They cater to sailors, which is to say they run on the money of men who may not come back.",
    gymnasion:
      "Corinth's gymnasion trains the athletes of the Isthmian Games, the League's second-greatest, held here every two years under a truce that even tyrants observe.",
    theatre:
      "The theatre is new money's favourite gift to the city. Corinth's rich sponsor its festivals lavishly, and are looked down on by older cities for it.",
  },
  "delphara-city": {
    agora:
      "Delphara's agora is small and exists to serve pilgrims: lodging brokers, sellers of sacrificial animals, and guides who explain the treasuries for a fee.",
    precinct:
      "In Delphara the temple precinct is the whole city's reason for being: the sacred way climbs past the treasuries to the god who answers questions.",
    gymnasion:
      "The gymnasion trains for the Pythian Games, where the musical contests come before the athletics, the opposite of every other games in Hellenoria.",
    theatre:
      "The theatre sits above the temple on the mountainside and holds the Pythian musical contests. Its view down the valley of olives is considered part of the performance.",
  },
  "helionyx-city": {
    agora:
      "Helionyx's agora is shaded by awnings strung between the white walls. In this city the shade, not the sun, is what people gather in.",
    precinct:
      "The city's sacred ground is the solar precinct, where the gnomon's shadow has been read and recorded every clear day for six hundred years.",
    gymnasion:
      "The gymnasion keeps the hours of the sun: exercise at dawn, lectures in the shade at noon, and the astronomers' pupils at the arc by evening.",
    theatre:
      "The theatre faces away from the afternoon sun by design, and performances begin at dusk.",
  },
  "thebesieas-city": {
    agora:
      "The Thebesian agora doubles as a parade ground, and during the Muster every citizen of military age presents himself and his equipment here for inspection.",
    precinct:
      "The sanctuary of Thebesieas is plain by League standards and the other cities never let it forget. Its dedications are captured arms.",
    gymnasion:
      "The gymnasion is where the city's citizen phalanx is made. Thebesieas drills to a standard the maritime cities cannot match, and the sacred band trains here.",
    theatre:
      "Thebesieas built its theatre late and reluctantly. It is used more for the reading of the sacred band's roll than for plays.",
  },
  "thessalonika-city": {
    agora:
      "Thessalonika's agora is the tidiest in the League: a planned square on the city grid, its stoas glazed against the northern cold.",
    precinct:
      "The sanctuary stands in the upper town among the academies. Its priests bless the harbour on the day the first ice appears in the fountains.",
    gymnasion:
      "Thessalonika's gymnasia are as much academies as exercise grounds. Their porticoes host the Disputation, where scholars argue positions assigned by lot.",
    theatre:
      "The theatre holds the Reading, where new works are read aloud and heckled before publication. Several careers have ended on its stage.",
  },
  "persemenid-city": {
    bazaar:
      "Persemenid's bazaar lies in the ordinary city below the platform, among the mud-brick houses and water channels, and supplies the court above.",
    "fire-temple":
      "Persemenid's great fire-temples stand on the hilltop chain from which the Magi mark the Fire Watch, signalling from temple to temple across the plateau.",
    caravanserai:
      "The royal caravanserai receives the satrapies' delegations before the Bringing, when each climbs the stair in the order the relief shows them.",
    "water-court":
      "Below the platform, Persemenid's water-court feeds both the city and the gardens of [[The Paradise of Persemenid]].",
  },
  "atarabad-city": {
    bazaar:
      "The commercial capital of [[Acheaoria]] has the largest bazaar on the continent. During the Long Bargain, prices here are fixed by public negotiation rather than in private.",
    "fire-temple":
      "Atarabad is oriented on its fire-temple, a squat, heavy building on the highest ground, where the Magi hold that the flame has never been extinguished.",
    caravanserai:
      "Atarabad has one caravanserai for each major road, each a small foreign quarter of its own. On the Opening of the Roads they all send their first convoy out on the same morning.",
    "water-court":
      "The [[Bountiful Harvesters]] hold Atarabad's water shares, which makes the guild one of the city's powers despite having no seat on anything.",
  },
  "mithratal-city": {
    bazaar:
      "Mithratal's bazaar is quiet for its size, like the rest of the city. Its busiest stalls sell writing materials and seals.",
    "fire-temple":
      "Mithratal's fire burns before the oath precinct, and the Magi witness every covenant sworn there.",
    caravanserai:
      "The waiting lodges for parties to a covenant began as caravanserais and are still built like them: walled, with one gate.",
    "water-court":
      "Mithratal's water shares are themselves covenants, registered and read out with the rest at the annual Renewal.",
  },
  "persevalis-city": {
    bazaar:
      "Persevalis's bazaar is mostly fruit, cuttings and seed, sold under the trees of the public orchards.",
    "fire-temple":
      "The fire-temple stands at the top of the terraces, where the water enters the city, and the Magi bless the Opening of the Channels each spring.",
    caravanserai:
      "The caravanserai sits at the foot of the slope, where the green ends and the plateau's ordinary dust begins.",
    "water-court":
      "Persevalis is the water-court made into a city. Water runs along every terrace, and the right to each channel is written into the deed of the house it passes.",
  },
  "xerastri-city": {
    bazaar:
      "Xerastri's bazaar lies between the two walls, in the ward that everyone understands would be given up in a serious assault.",
    "fire-temple":
      "The fire-temple stands inside the inner wall with the granaries and wells: the fire is one of the things Xerastri will not give up.",
    caravanserai:
      "During the Horse Fair, steppe clans are let into the outer city to trade at the caravanserai under truce. It is heavily policed and very profitable.",
    "water-court":
      "Xerastri's wells are inside the inner wall, and its water-court is kept there too. In a siege, water is the citadel's argument.",
  },
};

// ---------------------------------------------------------------------------
// Unique landmarks
// ---------------------------------------------------------------------------

type Unique = { city: string; name: string; tier: "site" | "district"; type: string; summary: string; body: string };

const UNIQUE: Unique[] = [
  // Aeterna
  {
    city: "aeterna-city",
    name: "The Sacred Line of Aeterna",
    tier: "site",
    type: "Sacred Boundary",
    summary: "The ancient boundary inside which no soldier may bear arms, which is why Aeterna's legions camp outside it.",
    body: "The boundary matters more than the walls. Aeterna's sacred line, the Roman pomerium, is marked by low stones and is older than the city it encloses. Inside it no soldier may bear arms, no army may camp, and the only lawfully armed body is [[The Vigiles]].\n\nThat single rule has shaped the capital's politics for eight hundred years. It is why [[The Obsidian Phalanx]] is quartered beyond it, why a Legate entering the city lays down his command at the line, and why, five years after the Treaty, everyone is watching to see whether someone steps over it under arms.",
  },
  {
    city: "aeterna-city",
    name: "The Insulae of Aeterna",
    tier: "district",
    type: "Tenement Quarter",
    summary: "The capital's tenements: brick blocks six and seven storeys high, where most Aeternans live, cook and burn.",
    body: "Behind the marble of the public city is the city people actually live in: brick-faced concrete tenements six and seven storeys high, plaster coming off, streets narrow enough that two carts stop each other. Most Aeternans rent rooms above shops, cook on charcoal in rooms that should not have fire in them, and eat out because their homes have no kitchens.\n\nThe insulae burn regularly enough that [[The Vigiles]] are the busiest institution in the Imperium. Burial here is by subscription to the [[Cycle of the Eternal Bloom]], for most citizens the most important contract they will ever sign.",
  },
  // Romulo
  {
    city: "romulo-city",
    name: "The Founder's Hut",
    tier: "site",
    type: "Shrine",
    summary: "A humble hut, reverently rebuilt for nine centuries, said to stand where the Imperium was founded.",
    body: "At the heart of Romulo stands a hut that is certainly not the original, rebuilt in the same form every time it decays, for nine centuries. It is said to mark where the founder of the Imperium lived when the Imperium was a market town with ambitions.\n\nThe Founding ends here each year after a full day of processions, and every Invictian magistrate is expected to attend at least once. Invictians come to be reminded that the Imperium was once small.",
  },
  {
    city: "romulo-city",
    name: "The Old Wall of Romulo",
    tier: "site",
    type: "City Wall",
    summary: "Romulo's ancient wall of mortarless stone, walked each year in procession to re-mark the sacred line.",
    body: "Romulo is walled in stone laid without mortar, and has not been fortified beyond it since the Imperium grew strong enough that fortifying the founding city would be an insult. Inside it, building above two storeys needs a licence that is essentially never granted.\n\nOnce a year the wall is walked in procession and the sacred line re-marked, with the [[Verdant Sentinel Order]] providing the escort.",
  },
  // Mavelon
  {
    city: "mavelon-city",
    name: "The Eleven Bridges of Mavelon",
    tier: "site",
    type: "Bridges",
    summary: "Mavelon's pride: eleven bridges over a fast river, each kept by a guild that cuts its mark on the parapet.",
    body: "Mavelon straddles a fast river on eleven bridges, and the bridges are the only thing the city is vain about. Each is older than it looks, and each is maintained by a guild that carves its mark into the parapet.\n\nAt the Bridge Walk every bridge is crossed in procession by its guild and the marks are recut. A bridge whose guild fails to appear is a scandal, and in the past has been a revolution.",
  },
  {
    city: "mavelon-city",
    name: "The Mill Banks of Mavelon",
    tier: "district",
    type: "Industrial Quarter",
    summary: "Mills and forges along both riverbanks, under a permanent haze: the Imperium's arsenal.",
    body: "Along both banks of the river run the mills and forges that make Mavelon the Imperium's arsenal: smoke, hammering, and a haze that never lifts off the water. Downstream the river runs discoloured for a mile, which the city regards as evidence of prosperity.\n\nAt midwinter, on the Quenching, every forge quenches at the same moment. The guild halls on the banks keep four centuries of apprentices' first pieces.",
  },
  // Ephelanum
  {
    city: "ephelanum-city",
    name: "The Great Sanctuary of Ephelanum",
    tier: "site",
    type: "Temple",
    summary: "The vast temple at the end of Ephelanum's marble street, visible far out to sea, and the city's reason to exist.",
    body: "At the end of the marble street from the harbour stands a temple large enough to be seen from well out at sea, its colonnade alone a century's work. Like the great temple at Ephesus it is also a bank: it holds deposits under sanctuary protection, lends, and is by some measures the largest single holder of coin in the region.\n\nEach year the goddess's statue is carried from the temple to the harbour and back in the Procession of the Image, a full day with the whole city behind it.",
  },
  {
    city: "ephelanum-city",
    name: "The Silting Harbour of Ephelanum",
    tier: "district",
    type: "Harbour",
    summary: "Ephelanum's harbour, dredged four times and losing: the city's quiet crisis.",
    body: "Ephelanum's harbour is silting up. It has been dredged four times, and the sea is retreating anyway, leaving the waterfront further from the water every generation.\n\nThe annual Dredging is nominally a rite for the harbour's health. In practice it is a yearly reminder of the silt, and attendance has been falling.",
  },
  // Aepistra
  {
    city: "aepistra-city",
    name: "The Relay Station of Aepistra",
    tier: "site",
    type: "Road Station",
    summary: "The Cursus Legionis station at Aepistra, where official riders change horses on the Imperium's roads.",
    body: "The relay stations of the *Cursus Legionis* run through Aepistra, and its station is one of the busiest in the provinces: stables, a posting house, and a constant traffic of official riders, tax documents and orders, changing horses on the road to and from [[Aeterna City]].\n\nWhoever controls the station sees the province's correspondence first, which is why the Legate's men are always in the posting house.",
  },
  // Hellarchon
  {
    city: "hellarchon-city",
    name: "The Shipsheds of Hellarchon",
    tier: "district",
    type: "Naval Harbour",
    summary: "The long roofed sheds where the world's largest fleet is berthed, each one numbered and accounted for.",
    body: "The harbour below Hellarchon is tar, timber and noise, and its long roofed shipsheds hold the largest fleet in the world. Each shed is numbered and each berth accounted for. The triremes here are the League's common defence in name and Hellarchon's hegemony in fact.\n\nIn spring, at the Launching, the fleet is drawn from the sheds and rowed out in formation. It is nominally a rite and unmistakably a demonstration.",
  },
  {
    city: "hellarchon-city",
    name: "The Long Walls of Hellarchon",
    tier: "site",
    type: "Fortification",
    summary: "The walls that join Hellarchon's hill city to its harbour two miles below, making one fortress with a port inside it.",
    body: "Hellarchon was built twice: the old town on its rock and the harbour two miles below. Walls run the whole distance between them, so the two are one fortress with a port inside it, impossible to starve while the fleet holds the sea.\n\nAlong the walls is where most of the city's people actually live. Hellarchon's wealth is on the hill and its population is on the road.",
  },
  {
    city: "hellarchon-city",
    name: "Arcane Academy",
    tier: "site",
    type: "Academy",
    summary: "Hellarchon's renowned school of magic, which draws ambitious magi from across the planes.",
    body: "At the heart of [[Hellenoria]] lies Hellarchon, called Aetherion by its people, and at the heart of Hellarchon is the Arcane Academy, which the court scribe [[Selenarion of Helarchon]] describes as a place 'where reality is reshaped by will alone'. It draws ambitious magi from across the planes, eager to unlock the secrets of the cosmos.\n\nThe violet skies over the city at dusk are popularly said to come from ancient magic. The official histories footnote the claim to a redacted vault record.",
  },
  // Corinth
  {
    city: "corinth-city",
    name: "The Haulway of Corinth",
    tier: "site",
    type: "Ship Haulway",
    summary: "A paved track across the isthmus on which whole ships are dragged overland between Corinth's two seas.",
    body: "Between Corinth's two harbours runs a paved haulway with grooves cut for wheeled cradles, on which entire ships are dragged overland from one sea to the other, like the diolkos of ancient Corinth. A cargo that crosses here saves several days and a dangerous cape, and Corinth charges accordingly.\n\nIt never stops: ox teams, capstans, and the shriek of a hull winched across stone. The season's first ship across is decorated and crewed by the city's magistrates, who are notoriously bad at it.",
  },
  {
    city: "corinth-city",
    name: "The Upper Fortress of Corinth",
    tier: "site",
    type: "Citadel",
    summary: "The fortified rock above Corinth, the strongest position in Hellenoria, never taken by assault.",
    body: "Above the isthmus rises a fortified rock that dominates both harbours. Like the Acrocorinth, it is the strongest position in [[Hellenoria]] and has never been taken by assault.\n\nCorinth has never needed much of an army: it has the rock, a modest fleet, and a great deal of money to hire other people.",
  },
  {
    city: "corinth-city",
    name: "The Street of Counting-Houses",
    tier: "district",
    type: "Banking Quarter",
    summary: "Corinth's money street, where rival banks keep branches side by side.",
    body: "After [[Hellarchon City]], Corinth is the League's chief money market, and its bankers keep to one street. The branch offices of the [[Mithril Reserve]] and the [[Vaults of Equilibrium]] sit on it side by side, watching each other.\n\nThe [[Luminastra Alchemists]] keep their largest workshop nearby, because every ingredient on the continent passes through Corinth's warehouses.",
  },
  // Delphara
  {
    city: "delphara-city",
    name: "The Sacred Way of Delphara",
    tier: "district",
    type: "Processional Way",
    summary: "The switchback road up to Delphara's temple, lined with the treasuries of rival cities.",
    body: "The road from the valley of olives to Delphara's temple climbs in switchbacks, and the whole ascent is lined with treasuries: small, exquisite buildings raised by individual cities to house their dedications, each competing with its neighbours in stone.\n\nThe effect is a road through eight centuries of Hellenorian rivalry, told entirely in architecture, ending at a temple where the god is asked questions.",
  },
  {
    city: "delphara-city",
    name: "The Oracle of Delphara",
    tier: "site",
    type: "Oracle Temple",
    summary: "The temple at the summit where petitioners pay to put their question to the god.",
    body: "At the top of the sacred way is the temple of the oracle. Consultation is not free: a petitioner pays for the sacrifice, the attendance and the interpretation, and the fee scales with the question. Delphara produces nothing and is extremely rich, which the [[Scales of Eternal Justice]] have noted in writing.\n\nIn the winter months the god is held to be absent. The temple stays shut during the Silence and the town empties.",
  },
  // Helionyx
  {
    city: "helionyx-city",
    name: "The Solar Precinct of Helionyx",
    tier: "site",
    type: "Observatory",
    summary: "An open court with a gnomon and a graduated arc, read every clear day for six hundred years.",
    body: "At Helionyx's highest point is the solar precinct: an open court with a gnomon at its centre and a graduated arc cut into the pavement. It has been read and the reading recorded every clear day for six hundred years.\n\nAt the summer solstice, the Standing, the exact moment is announced and the whole city falls silent. The year's tables are published at the Reading of the Arc, attended by scholars from three empires.",
  },
  {
    city: "helionyx-city",
    name: "The Dye-Works of Helionyx",
    tier: "district",
    type: "Industrial Quarter",
    summary: "The vats on Helionyx's edge, whose season opens each year with the city's least fragrant festival.",
    body: "On the edge of the white city, downwind, are the dye-works. The season's first vat is opened in public at the Dyeing, a festival whose smell is famously appalling and whose attendance is mandatory for the guild.\n\nThe colours made here are worn across the League, and the white city's wealth is, somewhat ironically, in them.",
  },
  // Thebesieas
  {
    city: "thebesieas-city",
    name: "The Citadel of Thebesieas",
    tier: "site",
    type: "Citadel",
    summary: "The inland city's fortress, with its own water: built by a city that expects to be attacked by land.",
    body: "Thebesieas expects to be attacked by land, and its architecture says so: heavy walls, gates that are genuinely gates, and a citadel with its own water supply, so that it can hold out after the lower city falls.\n\nThe citadel keeps the roll of the sacred band. At the Naming of the Band, the living answer for the dead.",
  },
  // Thessalonika
  {
    city: "thessalonika-city",
    name: "The Porticoes of Thessalonika",
    tier: "district",
    type: "Academic Quarter",
    summary: "The upper town's long colonnades, where teaching is done in public and interrupting is expected.",
    body: "Thessalonika's upper town is institutions: academies, libraries, guild halls, and the long porticoes where teaching is done in public and interrupting is expected. Courtyards are enclosed and windows glazed, for this is the coldest city in [[Hellenoria]].\n\nThe porticoes host the Disputation, five days of public academic contest in which positions are assigned by lot, so a scholar may have to defend the opposite of everything he has written.",
  },
  {
    city: "thessalonika-city",
    name: "The Sea Wall of Thessalonika",
    tier: "site",
    type: "Fortification",
    summary: "The long wall along Thessalonika's bay, guarding a waterfront of warehouses.",
    body: "Thessalonika lies on a curved bay behind a long sea wall, with warehouses along the waterfront and a citadel on the slope above. It is the tidiest large city on the continent, built to a plan it still follows.\n\nThe harbour is blessed on the day the first ice appears in the upper town's fountains. The date is recorded, and a late frost is considered an omen.",
  },
  // Persemenid
  {
    city: "persemenid-city",
    name: "The Royal Stair of Persemenid",
    tier: "site",
    type: "Ceremonial Stair",
    summary: "The great stair up to Persemenid's platform, wide enough for ten horsemen abreast and lined with the tribute relief.",
    body: "Persemenid's platform is cut into the rock forty feet above the plain and approached by a stair wide enough for horsemen to ride up ten abreast. It is meant to be climbed slowly. Along it runs a relief of tribute-bearers, every subject people in its own dress carrying what it owes, so a visitor climbs alongside the whole empire bringing gifts, as at Persepolis.\n\nAt the Bringing, every satrapy that still acknowledges the throne sends its delegation up the stair in the order the relief shows. Which ones do not come is the year's real news.",
  },
  {
    city: "persemenid-city",
    name: "The Audience Hall of Persemenid",
    tier: "site",
    type: "Throne Hall",
    summary: "The columned hall on the platform: the largest roofed space on the continent, where the King of Kings receives.",
    body: "On the platform stands the columned audience hall, the largest roofed space on the continent, modelled on the Apadana. Here the King of Kings receives the satrapies, and here nothing is ordinary and nothing is accidental.\n\n[[The Ten Thousand]] hold the platform. Their first regiment quarters inside the precinct and is drawn from the old nobility, which makes it a guard and a hostage-house at once.",
  },
  // Atarabad
  {
    city: "atarabad-city",
    name: "The Wind-Tower Quarter of Atarabad",
    tier: "district",
    type: "Residential Quarter",
    summary: "Atarabad's inward-turned houses under roofed streets and wind-towers that pull cool air into the rooms below.",
    body: "Atarabad is built to exclude the sun: streets roofed with matting, courtyards turned inward, and wind-towers on every roof of consequence pulling cool air down into the rooms below. The great houses of the merchant city sit here, each with its own armed guard.\n\nThe [[Gilded Vault]] and the [[Wheelwalkers]] both keep their headquarters in this quarter. The gems and bullion moving through it have grown alarming in volume as the satrapies turn restless.",
  },
  // Mithratal
  {
    city: "mithratal-city",
    name: "The Precinct of Oaths",
    tier: "site",
    type: "Covenant Court",
    summary: "The open stone court at Mithratal's centre, where oaths are sworn and every road ends.",
    body: "Mithratal is arranged so that every road runs to the place where oaths are sworn: an open precinct, roofless, floored in one expanse of dressed stone and empty of decoration. It is named for Mithra, god of the covenant and the binding word.\n\nA new slab is laid in the floor each decade, cut by the [[Geolith Artisan Covenant]]. Once a year, on the Silent Day, nothing said in the city is binding, and people say what they think.",
  },
  {
    city: "mithratal-city",
    name: "The Covenant Archives of Mithratal",
    tier: "site",
    type: "Archive",
    summary: "Where every covenant sworn in Mithratal is drafted, registered and read out at the annual Renewal.",
    body: "Mithratal's wealth went into the buildings around the precinct: the archives where covenants are kept, the chambers where terms are drafted, and the lodging where parties wait out the required intervals.\n\nAt the Renewal every standing covenant registered in the city is read out by class, and any party wishing to dispute one must do so then or hold its peace for another year.",
  },
  // Persevalis
  {
    city: "persevalis-city",
    name: "The Terraced Gardens of Persevalis",
    tier: "district",
    type: "Garden Terraces",
    summary: "The terraces that make Persevalis a hillside of trees with roofs showing through.",
    body: "Persevalis is terraced down a long slope, with water led along every level, so that it is a series of gardens with buildings in them rather than the reverse. Every house of consequence has a walled garden with a channel through it, and the public spaces are orchards. This is the Persian paradise garden on the scale of a city.\n\nOn the Night Gardens of high summer, lamps are lit in every walled garden, the gates are left open, and the city walks through each other's houses until dawn.",
  },
  // Xerastri
  {
    city: "xerastri-city",
    name: "The Outer Wall of Xerastri",
    tier: "site",
    type: "Fortification",
    summary: "The taller of Xerastri's two walls, facing the Malaunian Steppe.",
    body: "Xerastri is two walls and a ditch with the city between them. The outer wall faces the [[Malaunian Steppe]] and is the taller. Every stretch of it belongs to a family responsible for its upkeep, and at the Counting of the Wall each spring the families formally report on their sections.\n\nOnce a year the garrison rides out in full muster in view of the steppe. Everyone on both sides understands the message.",
  },
  {
    city: "xerastri-city",
    name: "The Inner Citadel of Xerastri",
    tier: "site",
    type: "Citadel",
    summary: "The older inner wall enclosing Xerastri's citadel, granaries and wells: what the city keeps if it loses everything else.",
    body: "The inner wall is the older and encloses the citadel, the granaries and the wells. The space between the walls is where most people live, and everyone understands that in a serious assault that space is expendable.\n\nThe empire's best siege engineers are stationed here, with nothing to besiege, and keep the engines in order anyway.",
  },
];

/** Deiperduem: neutral ground has no imperial idiom, only its own landmarks. */
const DEIPERDUEM: Unique[] = [
  {
    city: "deiperduem-city",
    name: "The Treaty Hall of Deiperduem",
    tier: "site",
    type: "Assembly Hall",
    summary: "The plain hall where the Treaty of Deiperdeum was signed, preserved exactly as it was on the day.",
    body: "On the square of the old town stands the Treaty Hall: unglamorous, deliberately plain, and preserved exactly as it was on the day the three empires signed. Its plainness is the point. No empire could be seen to have built it.\n\nAt the Signing each year all three empires send delegations, the document is displayed, and every speech is checked in advance by everyone. At dusk comes the Quiet Hour, when the war dead are read out as three figures with no names. It is the only occasion on which nobody argues.",
  },
  {
    city: "deiperduem-city",
    name: "The Embassy Compounds of Deiperduem",
    tier: "district",
    type: "Diplomatic Quarter",
    summary: "Walled embassy quarters, each with its own colours and guards, each pretending not to watch the others.",
    body: "In five years Deiperduem has rebuilt itself into embassies: walled compounds, each flying its own colours, each with its own guard, each pretending the others are not watching. The Treaty forbids any empire to station troops in the city, so the guards are described as household staff.\n\nThe town council counts them, publishes the count and complains, and the numbers rise anyway. Order outside the walls is kept by the city watch and the [[Ironclad Legion]] under contract.",
  },
  {
    city: "deiperduem-city",
    name: "The Old Town of Deiperduem",
    tier: "district",
    type: "Old Quarter",
    summary: "The small, unremarkable old town at Deiperduem's centre: now the most expensive ground on the continent.",
    body: "The old town in the middle of Deiperduem is small, unremarkable, and now the most expensive property on the continent. Its notaries, translators and copyists are the best available and price accordingly.\n\nIn high summer the Market of Nations fills it, each empire's goods in its own quarter. It is nominally a trade fair and in practice the year's most productive week of unofficial negotiation.",
  },
];

// ---------------------------------------------------------------------------
// Existing pages to file under their city, and two thin pages to write.
// ---------------------------------------------------------------------------

const ATTACH: { slug: string; name: string; parentSlug: string }[] = [
  ...[
    "the-ju-colliseum", "citadel-cathedral", "temple-of-juno", "the-iron-parade-grounds",
    "drakkurs-expenditionary", "terraces-farms", "the-marketplace",
    "the-quarrymen-district", "the-parched-ox", "the-dune-mines",
    "the-rockpools", "geomantic-forge", "healers-sanctuary",
  ].map((slug) => ({ slug, name: slug, parentSlug: "duneforged-citadel" })),
  // The individual temples belong under the Citadel Cathedral that keeps them.
  ...["shrine-of-anchiale", "forge-of-vulcan", "vault-of-mercury", "sanctum-of-hoplodamus"].map((slug) => ({
    slug,
    name: slug,
    parentSlug: "citadel-cathedral",
  })),
  { slug: "aqua-aeterna", name: "aqua-aeterna", parentSlug: "aeterna-city" },
  { slug: "the-paradise-of-persemenid", name: "the-paradise-of-persemenid", parentSlug: "persemenid-city" },
  { slug: "palace-of-eronis", name: "palace-of-eronis", parentSlug: "eronis" },
];

const WRITTEN: Unique[] = [
  {
    city: "duneforged-citadel",
    name: "The Molten Crucible",
    tier: "site",
    type: "Alchemist & Artificer",
    summary: "An upscale alchemist and artificer in the Noble Districts, run jointly by the Vulkrim and Virellarion families.",
    body: "An upscale alchemist's and artificer's in the Noble Districts of the [[Duneforged Citadel]], managed by two noble houses at once: [[The Vulkrim Family, Marquis]] and [[The Virellarion Family, Count]].\n\nEach house runs its own shop lower down the Citadel: the Virellarions' [[The Gilded Crucible]] in alchemy and the Vulkrims' [[Ember & Anvil]] in smithing. The Molten Crucible is where the two trades, and the two families, meet: enchanted metalwork and alchemical craft for the Citadel's upper streets.",
  },
  {
    city: "duneforged-citadel",
    name: "The Temples",
    tier: "site",
    type: "Temple Quarter",
    summary: "The temples kept within the Citadel Cathedral of Duneforged, one for each patron the Citadel honours.",
    body: "The [[Citadel Cathedral]] of the [[Duneforged Citadel]] keeps a temple for each of the powers the Citadel honours, Titans and Invictian gods alike:\n\n- [[Forge of Vulcan]], for Vulcan, the Artisan of Creation\n- [[Temple of Juno]], for Juno, the Protector of Bonds, where the coin is assayed\n- [[Vault of Mercury]], for Mercury, the Trickster of Trade\n- [[Shrine of Anchiale]], for the Titan of fire and craft\n- [[Sanctum of Hoplodamus]], for the Titan of Guardianship, patron of the trials at [[The Ju Colliseum]]\n\nThat Titans are honoured beside the Imperium's gods is a Duneforged peculiarity. Elsewhere the Titans' worship is older and stranger than any state cult.",
  },
];

// ---------------------------------------------------------------------------

function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type OutEntry = {
  slug: string;
  kind: "location";
  name: string;
  summary: string;
  body: string;
  dmNotes: string;
  fields: Record<string, string>;
  tags: string[];
  visibility: "public";
  sourcePath: string;
  parentSlug: string;
  replaceBodyShorterThan?: number;
};

const out: OutEntry[] = [];
const byCity = new Map(CITIES.map((c) => [c.slug, c]));
const cityName = (slug: string) =>
  byCity.get(slug)?.name ?? (slug === "deiperduem-city" ? "Deiperduem City" : "Duneforged Citadel");

for (const c of CITIES) {
  for (const common of COMMON[c.culture]) {
    const local = LOCAL[c.slug]?.[common.key];
    if (!local) continue; // e.g. Romulo has no garrison, by design
    out.push({
      slug: slugify(common.title(c)),
      kind: "location",
      name: common.title(c),
      summary: common.summary(c),
      body: `${common.shared}\n\n## In ${c.short}\n\n${local}`,
      dmNotes: "",
      fields: { tier: common.tier, type: common.type, region: c.name },
      tags: [c.short, "city-common", c.culture],
      visibility: "public",
      sourcePath: "authored: scripts/build-city-locations.ts (common institution)",
      parentSlug: c.slug,
    });
  }
}

const writtenNames = new Set(WRITTEN.map((w) => w.name));
for (const u of [...UNIQUE, ...DEIPERDUEM, ...WRITTEN]) {
  const city = cityName(u.city);
  out.push({
    // The two Duneforged pages exist as one-line Notion stubs this supersedes.
    ...(writtenNames.has(u.name) ? { replaceBodyShorterThan: 120 } : {}),
    slug: slugify(u.name),
    kind: "location",
    name: u.name,
    summary: u.summary,
    body: u.body,
    dmNotes: "",
    fields: { tier: u.tier, type: u.type, region: city },
    tags: [city.replace(/ City$/, ""), "city-landmark"],
    visibility: "public",
    sourcePath: "authored: scripts/build-city-locations.ts (landmark from the city's own write-up)",
    parentSlug: u.city,
  });
}

// Attach-only rows: no text, so --fill-empty only sets the missing parent.
const attach = ATTACH.map((a) => ({
  slug: a.slug,
  kind: "location" as const,
  name: a.name,
  summary: "",
  body: "",
  dmNotes: "",
  fields: {},
  tags: [],
  visibility: "public" as const,
  parentSlug: a.parentSlug,
  attachOnly: true,
}));

fs.writeFileSync(
  path.join(REPO, "data", "city-locations.json"),
  JSON.stringify(
    {
      format: "asetheria-codex",
      note: "Generated by scripts/build-city-locations.ts. Load with import-codex-file.ts --fill-empty.",
      entries: [...out, ...attach],
    },
    null,
    2,
  ) + "\n",
);

const common = out.filter((e) => e.tags.includes("city-common")).length;
console.log(`\n  ${out.length} places (${common} common, ${out.length - common} landmarks) across ${CITIES.length + 2} cities;`);
console.log(`  ${attach.length} existing pages filed under their city.\n`);
