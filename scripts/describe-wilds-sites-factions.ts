/**
 * Writes descriptions for the wilds, sites and factions that had none.
 *
 * Each is anchored in the real history the name already points at — Elysium,
 * the Tiber, the Caspian, Petra, the Library of Alexandria, Juno Moneta and the
 * Roman mint — and then pushed somewhere stranger, because Asetheria is a world
 * where the Titans were real and the gods still answer. Where a name is the
 * world's own invention rather than a borrowing, it is grounded in what the
 * codex already establishes: the qanats, the Treaty, the fallen kingdoms.
 *
 * Only fills entries whose body is empty. Never overwrites.
 *
 * Run with:  npx tsx scripts/describe-wilds-sites-factions.ts          (dry run)
 *            npx tsx scripts/describe-wilds-sites-factions.ts --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, sql } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { entries, links } from "../src/db/schema";

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

type Desc = {
  /** Matched on exact name; every one of these already exists. */
  name: string;
  summary: string;
  /** Real-world root, stored in DM notes. */
  basis: string;
  body: string;
  /** Only set when the entry currently has none. */
  fields?: Record<string, string>;
};

const DESCRIPTIONS: Desc[] = [
  // ------------------------------------------------------------------ WILDS --
  {
    name: "Elysian Plains",
    summary:
      "Grassland where the grass grows in the shape of the wind that blew a week ago, and the dead are said to be pleasant company.",
    basis: "The Elysian Fields, the blessed afterlife of Greek myth reserved for heroes.",
    body: `A shallow bowl of pale grass three days across, warm in every season, where
it has not rained within memory and the grass is nonetheless green.

The Hellenorians hold that this is where the honoured dead are kept, and the
plains do very little to argue. The grass lies flat in patterns that match the
wind of some previous day rather than the wind presently blowing. Travellers
report conversations they are certain they had, with people they cannot
afterwards name, and arrive at the far side rested and a little lighter than
they set out — in mood, and once or twice in memory.

Nothing here is hostile. That is precisely what unsettles the people who live
around the edge, who graze the margin and do not sleep on it. A shepherd who
loses a day on the Elysian Plains comes back content. A shepherd who loses a
season comes back content, too, and that is the problem.`,
  },
  {
    name: "River Tiberius",
    summary:
      "The Imperium's founding river — spine of the capital, sewer of the capital, and keeper of everything the capital has thrown away.",
    basis: "The Tiber, Rome's river: boundary, highway, sewer, and dumping ground for the condemned.",
    body: `The river that made [[Aeterna City]] possible and has been paying for it ever
since. It carries grain barges up from the coast and carries everything else
back down.

Yellow with silt for most of its length, the Tiberius floods on no schedule any
augur has managed to predict. Its banks below the capital are built up in brick
and its bed is not: divers who go down after lost cargo describe a floor of
amphorae, coin, statuary, and the occasional weighted sack, layered in the order
the Imperium discarded them.

The priesthood insists the river is a god and that the god is owed an offering
before any bridge is built. The engineers of the [[Imperium Invicta]] regard
this as superstition, and make the offering anyway. Four bridges have been
raised without it. None of the four is standing.

Below the last bend the water runs briefly, unmistakably clear — a stretch of
perhaps two hundred paces where the silt simply stops. No one drinks from it.`,
  },
  {
    name: "Kaspiran Seas",
    summary:
      "A salt sea with no outlet at the heart of Acheaoria, dropping a hand's breadth each decade and giving up what it covered.",
    basis: "The Caspian Sea — the world's largest inland body of water, salt, and slowly shrinking.",
    body: `Not a sea in any sense that satisfies a Hellenorian sailor: no tide, no exit,
and water salt enough to hold a swimmer up like a plank. The Kaspiran sits in
the middle of [[Acheaoria]] with rivers running into it and nothing running out.

What goes in stays. The sea is therefore a ledger of everything the empire has
ever poured downstream, concentrated by two thousand years of evaporation, and
its water is undrinkable in a way that is famously immediate.

It is also falling. A hand's breadth a decade, by the marks the satraps' clerks
have cut into the rock since the founding — and the new shoreline gives things
up. Jetties belonging to no recorded port. A road that runs out into the flats
and continues under the water. In the last dry season, the roofline of something
with columns.

The Magi have forbidden excavation. The fishermen dig anyway, at night, and sell
what they find inland where the prohibition is a rumour.`,
  },
  {
    name: "Olympus Mountain Range",
    summary:
      "The high seat of the Hellenorian gods — and the reason no Hellenorian army has ever been able to hold its own northern border.",
    basis: "Mount Olympus, home of the Greek gods and the natural barrier of northern Greece.",
    body: `A wall of grey limestone standing across the north of [[Hellenoria]], its upper
third in cloud for nine months of the year. The Hellenorians place the seat of
their gods above that cloud and are entirely uninterested in whether anyone has
been up to check.

Several have. The accounts do not agree, which the priesthood considers proof
and the philosophers consider evidence of altitude.

Strategically the range is a gift that has ruined its owners. It cannot be
crossed by an army except at three passes, which sounds like security until you
notice that it also cannot be crossed *from* Hellenoria except at those same
three, and that each is held by a different city-state that regards the other
two as rivals. The League has never once managed to garrison all three at the
same time.

The cloud does something to sound. Shouted orders arrive late, or twice, or in a
voice that is nearly the right one. Officers who campaign here learn to use
horns and to distrust anything they hear that they wanted to hear.`,
  },
  {
    name: "Oros Mountain Range",
    summary:
      "The older, lower range the Hellenorians simply call The Mountain — quarried for eight centuries and hollow in places nobody has mapped.",
    basis: "Greek óros, 'mountain' — the plain descriptive name older than the myth-names layered over it.",
    body: `The Hellenorians name most things twice: once in poetry and once in the flat old
word that came before the poetry. The Oros is the flat old word. It means, simply,
*the mountain*, and it is what people called this range before anyone thought to
put gods on the taller one to the north.

Lower than [[Olympus Mountain Range]], greener, and far more useful. Eight
centuries of quarrying have taken the marble for every temple in the League out
of its western face, and the galleries left behind run further into the rock
than any surviving plan records. Quarry crews still occasionally break through a
wall into a worked chamber that no one alive cut.

The stone is unusually white and unusually cold, and holds a chisel line so
cleanly that Hellenorian sculptors claim they are not carving so much as
removing what was never meant to be there. Blocks taken from the deepest
galleries are prized, expensive, and quietly refused by some temples.`,
  },
  {
    name: "Aeolus Reach",
    summary:
      "The strait where Hellenoria's winds are made — reliable, charted, and answerable to something that does not always answer.",
    basis: "Aeolus, keeper of the winds, who gave Odysseus the bag of storms.",
    body: `A twenty-mile channel between two headlands through which every wind in the
Hellenorian archipelago appears to be issued. Sailors do not say the wind blows
through the Reach; they say it is *let out* of it.

The practical effect is a strait with the most predictable weather in the known
world. There is a chart, kept at [[Delphara City]] and copied badly everywhere
else, giving the wind for each hour of each day of the sailing season, and it is
right often enough that a captain who ignores it is considered not bold but
stupid.

It is not right always. Perhaps twice a season the Reach delivers something that
is not on the chart, and the something is invariably enormous. The keepers on
the headland light no beacon on those days, on the grounds that a ship that
cannot see the rocks will at least not see them coming.

There is a shrine on the northern head where captains leave a knotted cord
before passing through. The knots are never untied by anyone. They come undone.`,
  },
  {
    name: "Nereid’s Veil",
    summary:
      "The permanent sea-fog off the Hellenorian coast — beautiful, navigable by ear alone, and full of voices that know your name.",
    basis: "The Nereids, the fifty sea-nymph daughters of Nereus, helpers and hazards to sailors.",
    body: `A bank of fog that sits off the western coast and does not move with the wind.
It thins and thickens with the season but it does not go, and it does not
travel; ships pass into it as into a room.

Inside, sight is worth nothing and hearing is worth everything. Coastal pilots
navigate the Veil by the sound of surf on known rocks, by bells set on
moorings, and by counting. It is a skill that takes a decade and cannot be
written down, which is why pilot families in the coastal towns are wealthy and
insular.

The voices are the part outsiders refuse to believe until they have been in.
They are female, they are numerous, they are pleasant, and they use your name.
Pilots are trained from childhood to answer nothing. The standing instruction of
every League port is that a helmsman who replies is relieved at once and does
not go back in — not as punishment, but because those who reply once tend to
reply again.

Drowned sailors recovered from the Veil are, without exception, smiling.`,
  },
  {
    name: "Maeotis Helos",
    summary:
      "The great marsh at the mouth of three rivers — impassable to armies, home to reed-cutters, and slowly digesting a fallen kingdom.",
    basis:
      "Lake Maeotis (the Sea of Azov) and Greek helos, 'marsh' — the shallow reed-sea of the northern steppe.",
    body: `Where three rivers meet the sea without any of them managing to finish, the land
gives up being land for about forty miles. The Helos is reed and black water and
islands that are islands only until the season changes.

It has never been conquered because there is nothing here to hold and no way to
march. Every attempt in the long war ended the same way: a column enters, the
guides prove unreliable, the water rises, and a smaller column comes out
somewhere unintended. The reed-cutters who live here paid tribute to whichever
empire asked and continued exactly as before.

The Helos is also where a kingdom went. Fragments of worked stone come up in the
nets, always the same pale stone, always carved on one face — and the
reed-cutters have a rule against bringing them home. The old people say the
marsh took [[Nethrana: The Kingdom of Mirrors and Mist]] because it was owed it,
and that the debt was not fully settled, and that this is why the water rises
when soldiers come.`,
  },
  {
    name: "Malaunian Steppe",
    summary:
      "Grass to the horizon in every direction — the horse country that no empire has ever conquered and every empire has hired.",
    basis:
      "The Pontic–Caspian steppe of the Scythians and Sarmatians: horse nomads, mounted archery, burial kurgans.",
    body: `A sea of grass along the northern edge of the continent, treeless, waterless
between rivers, and belonging to nobody in the sense the three empires
understand the word.

The people of the Malaunian are mounted from the age of four. They keep no
cities, sign no treaties that outlast the man who signed them, and have
destroyed, in fifteen centuries, three punitive expeditions from each of the
empires — always the same way. The column advances, the steppe empties, the
supply line lengthens, and the horsemen appear behind it.

All three empires now solve this by hiring them instead. Malaunian auxiliaries
ride in Invictian, Hellenorian and Acheaorian service, frequently in the same
season, occasionally against each other. This is not felt as disloyalty. A
contract is with a man, not a nation.

The steppe's only permanent structures are the burial mounds, which are
enormous, thickly gold, and never robbed twice — the first thief always
manages it.`,
  },
  {
    name: "Parthian Ravine",
    summary:
      "A dry gorge on the Acheaorian frontier, three days long and never once successfully forced — the shot that killed you comes from behind.",
    basis: "The Parthian shot: the feigned retreat, firing backwards from the saddle at full gallop.",
    body: `Sixty miles of dry gorge cutting the Acheaorian frontier, walls of red rock
close enough in places that two carts cannot pass. The floor is gravel and the
gravel is loud.

It is the only practical road east for an army, and taking it has cost more
Invictian legionaries than any battle of the long war. The Acheaorian defence
never involved holding it. Light horse would meet a column at the mouth, engage,
break, and flee up the gorge — and the column, sensing collapse, would pursue
into ground where it could not form line, and where the fleeing horsemen would
turn in the saddle and shoot backwards without slowing.

The manoeuvre is old enough that the Imperium named it after the place. Officers
of the [[Imperium Invicta]] still use the phrase to mean any victory that turns
out to be the first half of a defeat.

The ravine is thick with arrowheads. Locals gather them by the sack. They do not
gather after dark, because the gravel is loud, and because on certain nights it
is loud in a rhythm that nobody is making.`,
  },
  {
    name: "Klynin Mountain Range",
    summary:
      "The spring-bearing highlands that water the Imperium's capital — quiet, cold, and jealously surveyed.",
    basis:
      "The Apennine spring country that fed Rome's aqueducts, and the Roman cura aquarum that policed it.",
    body: `Not high, not dramatic, and the most strategically valuable ground in the
[[Imperium Invicta]]. The Klynin holds the springs, and the springs feed the
[[The Aqua Aeterna]], and the aqueduct feeds the capital.

The range is therefore surveyed to a degree that would flatter a city. Every
significant spring is measured, named, cut with a boundary mark, and assigned in
law to the water office. Tapping one without licence is theft from the capital
and is prosecuted as such — the standing penalty has not been revised in four
hundred years and remains startling.

The water is very cold and very clear and comes out of the rock already moving.
The engineers say the mountain is hollow with it. The villages say something
lives in the hollow and that the water is clean because it is being kept clean,
and that this is a courtesy rather than a property of limestone.

Both parties agree on the practical point: nothing is to be put into the
springs. The villages enforce this more reliably than the water office does.`,
  },
  {
    name: "Foloicauria Forest",
    summary:
      "Old-growth woodland the Hellenorians will not clear, held by druidic circles who answer to the trees before the League.",
    basis:
      "The sacred groves of Greek and Gaulish practice — woodland under divine protection, felling forbidden on pain of death.",
    body: `The last unbroken old-growth on the Hellenorian mainland, and the only large
stand of timber in the League that has never been touched by a shipwright — a
restraint that has cost Hellenoria at least two wars.

The prohibition is religious and enforced by the druidic circles who keep the
forest, notably the [[Circle of the Eternal Grove]]. Their position is that the
grove is not a resource under protection but a party to an agreement, and that
the agreement predates the League, the empires, and probably the gods currently
being credited with it.

The League has tested this three times in fifteen centuries, always during a
naval crisis, always with the same result: the felling crews go in, and the
felling crews come out fewer, and the surviving foremen decline to say why in
terms any assembly is willing to write down.

The trees are enormous, evenly spaced in a way that no natural woodland manages,
and dying nowhere. Nothing rots on the floor of the Foloicauria. What falls is
gone by the following season, and no one has ever established where it goes.`,
  },
  {
    name: "Briar’s Valley",
    summary:
      "A green valley closed by forty years of thornbrake — the hedge grew after the massacre, and it grew inward.",
    basis:
      "The hedged sacred enclosures of antiquity, and the very old idea of a thorn wall that closes over a place better left shut.",
    body: `Good pasture, sheltered water, gentle slopes, and a wall of thorn around the
whole of it thick enough to turn a horse and high enough to hide a man standing
on one.

The brake is not old. It is forty years old, and the people in the villages
around the rim can name the year, because it is the year the valley's own
militia was massacred inside it during the last serious campaign of the long
war. The thorn came up the following spring, everywhere at once, and has been
thickening since.

It grows inward. This is the detail that keeps the story alive: cut a path from
the outside and the cut closes from the far side, over a season or two, as if
the valley were sealing rather than the hedge spreading.

Nothing suggests the interior is dangerous. Birds go in and come out. Smoke has
twice been seen. The standing local opinion is not that something is in there
but that something is being kept in, and that the arrangement is working, and
that it would be discourteous to interfere.`,
  },
  {
    name: "Shadowed Vale",
    summary:
      "A valley the sun reaches for forty minutes a day — cold, fertile, and farmed by people who keep very precise clocks.",
    basis:
      "The deep-cut alpine valleys where geometry, not weather, decides how long the sun is up.",
    body: `A cleft so narrow and so deep that direct sun crosses it for about forty minutes
around noon and, for eleven weeks of winter, not at all.

The people here are not gloomy about it. They are punctual about it, which is
stranger. Every settlement in the Vale keeps a sun-clock calibrated to its own
patch of sky, work is scheduled around the arriving light to the quarter-hour,
and a Valefolk given a time will keep it to a degree the rest of the continent
finds unnerving.

The soil is superb — cold, wet, and thick with washed-down mineral — and the
Vale exports fruit that ripens nowhere else. It is picked in the dark, mostly,
by people who navigate their own orchards by count of paces.

Outsiders find the winter weeks difficult. Valefolk find them ordinary and mark
their return with no ceremony at all. When asked what is done during the sunless
weeks, they say: the same things. When asked what is *out* during them, they
change the subject, politely, every time.`,
  },
  {
    name: "Mountain of Kharveth",
    summary:
      "A solitary peak on the Acheaorian plateau where the qanat-diggers will not sink a shaft, and the empire has stopped asking why.",
    basis:
      "Grounded in the codex's own qanat engineering rather than an outside myth: the one place the muqanni refuse to dig.",
    body: `A single mountain standing alone where the Acheaorian plateau is otherwise flat
enough to see three days in every direction. It carries snow. It therefore
carries water, and by every principle of [[The Qanat Network]] it ought to be
ringed with mother wells.

It is not. The *muqanni* — the hereditary tunnel-diggers, who are not a
superstitious trade and cannot afford to be — will not sink a shaft within a
day's ride of Kharveth. They give no reason that survives translation. The
nearest is a phrase meaning roughly *the water there is already spoken for*.

Three satraps have tried to compel them. The first two got shafts dug by
conscripts; both collapsed, with losses that were unusual and, in the second
case, unexplained. The third satrap sent surveyors instead, who returned with
excellent measurements and the observation that the mountain's meltwater does
not appear anywhere downhill of it in any quantity that matches the snowfall.

The Magi have no doctrine on Kharveth, which for the Magi is itself a position.`,
  },
  {
    name: "Vael’Tharan Mountain",
    summary:
      "The peak the Titans are said to have been broken against — bare, faintly warm, and worked on one face by hands that were not human-sized.",
    basis:
      "Grounded in the codex's own Titan pantheon rather than an outside myth: the site of their fall.",
    body: `Bare rock from the treeline up, warm to the touch on its southern face in any
weather, and shaped — on that face only — into terraces and channels far too
large to be stairs and far too regular to be nothing.

Asetherian tradition puts the breaking of the Titans here. The pantheon of the
Titans is extensive, the codex records fifty-one of them, and the tradition is
consistent on the point that they did not die but were *put down*, which is a
different thing and implies a place.

Nothing grows on the worked face. Instruments behave: compasses point true,
water boils normally. What is wrong with Vael'Tharan is entirely a matter of
scale — every worked feature is proportioned for something between three and
five times human size, and the proportions are consistent enough that scholars
of [[Hellenoria]] have published estimates of the builders' height and been
taken seriously.

The warmth has never been explained. It is not volcanic. It is strongest in the
channels, and it is strongest at night.`,
  },
  {
    name: "Zaruk'thal Spine",
    summary:
      "A ridge of black stone splitting the Acheaorian desert — the old border of a kingdom that no longer exists, and still refuses passage.",
    basis:
      "Grounded in the codex's fallen kingdoms rather than an outside myth: a frontier that outlived its empire.",
    body: `Two hundred miles of black rock standing out of the sand like a fin, nowhere
more than a quarter-mile wide, nowhere passable except at eleven notches that
are plainly cut rather than weathered.

The cutting is old — older than [[Acheaoria]], older than the treaties, and
attributed by the satraps' own annals to one of the kingdoms that came before.
Each notch was a gate. Several still have the sockets, and two still have
fragments of the doors, which are not stone and have not corroded.

The Spine no longer borders anything. The kingdom it defended is a chapter in
[[The 3 Empires]] and a set of ruins under the sand. The notches remain the only
crossings, which means every caravan road in eastern Acheaoria still runs where
that dead kingdom decided it should, and the satraps still tax the crossings
because the crossings are still where the crossings are.

Caravan masters make a small offering at the sockets. Asked to whom, they say:
to whoever is still holding the gate.`,
  },
  {
    name: "Xeruezcho Canal",
    summary:
      "A royal canal cut across the desert neck to join two seas — finished, magnificent, and abandoned within a generation.",
    basis:
      "Darius I's canal linking the Nile to the Red Sea: a genuine Achaemenid megaproject, completed and later silted up.",
    body: `A cut a hundred and twenty miles long and wide enough for two galleys abreast,
driven across the desert neck by an Acheaorian King of Kings whose name has been
struck from the stelae at both ends but not from the annals.

It worked. For roughly one generation, ships passed from one sea to the other
without unloading, the tolls were enormous, and the empire ran a route no rival
could reach. Stelae were raised every ten miles announcing, in four scripts,
that the King of Kings had commanded the sea to join the sea, and it had obeyed.

Then it silted. The engineers had solved gradient, banks and locks, and had not
solved sand, which arrives without a schedule and does not stop. Dredging cost
more each year than the tolls returned. The court's solution was to stop
recording the dredging figures, and then to stop dredging.

Long dry stretches remain, walled and paved, running arrow-straight into
nothing. Caravans use them as roads: the bed is level, the walls give shade, and
the tolls are still collected, now for walking along the bottom of a sea-road
that no longer holds water.`,
  },

  // ------------------------------------------------------------------ SITES --
  {
    name: "Alexandria Sanctum",
    summary:
      "The continent's great library — every text copied twice, one copy never lent, and a catalogue nobody has seen the end of.",
    basis:
      "The Library of Alexandria and its policy of seizing ships' books to copy, keeping the originals.",
    body: `A colonnaded precinct holding, by its own claim, a copy of every written work in
Asetheria. The claim is not quite true and is closer to true than any rival
would like to admit.

The Sanctum acquires by an old and legally awkward custom: any vessel docking at
its harbour surrenders every book aboard for copying. The copy is returned to
the owner. The original is retained, catalogued, and shelved. Complaints are
heard sympathetically and have never once resulted in a return.

Everything is held twice — a reading copy and a deep copy. The reading copies
circulate. The deep copies are shelved below ground in rooms that librarians
enter in pairs and leave together, a rule with no stated reason that has never
been relaxed.

The catalogue is itself a work of some hundreds of volumes and is the Sanctum's
real treasure, since a book that cannot be found is a book that is not there.
Three generations of catalogue-keepers have died mid-revision. The current keeper
is elderly and has begun, quietly, to train two successors instead of one.`,
  },
  {
    name: "Ancient Petra",
    summary:
      "A city carved down into the rock of a desert gorge, rich beyond reason on water it hid, and empty since the routes moved.",
    basis:
      "Petra: the Nabataean rock-cut city whose wealth rested on concealed cisterns and caravan tolls.",
    body: `Approached through a gorge two carts wide and half a mile long, which opens
without warning onto facades cut forty feet into the living cliff. Nothing here
was built. It was removed.

Petra grew rich the way desert cities do — by controlling a caravan road — and
stayed rich by a trick its neighbours never solved. The surrounding country has
no visible water. Petra had cisterns, channels and settling tanks cut inside the
rock, invisible from outside and fed by flash floods that elsewhere simply
killed people. A besieger camped on dry ground while the city drank.

The routes moved. Rock-cut cities cannot follow. What is left is the most
complete abandoned city on the continent: facades intact, channels intact, and
the cisterns still filling every wet season for nobody.

Caravans shelter here and rarely stay two nights. The complaint is always the
same and always slightly embarrassed — that the city is too well kept. Sand does
not drift as far in as it should. The channels are not blocked. Something is
maintaining the drainage of a city that has had no population for four hundred
years.`,
  },
  {
    name: "Temple of Juno",
    summary:
      "The Imperium's mint, inside its temple — coin has been struck here under the goddess's eye for nine hundred years, and she is said to notice debasement.",
    basis:
      "Juno Moneta on the Capitoline, where Rome struck its coin — the origin of the words money and mint.",
    body: `A temple that is also a factory. The Imperium has struck its coinage in the
undercroft of Juno's house for nine hundred years, on the reasoning that money
is a promise and a promise wants a god standing over it.

The arrangement gave the Imperium its word for coin, which is simply the
goddess's title, and gave the priesthood an unusual duty: the temple keeps the
standard. A sealed set of trial pieces sits in the sanctuary, and the strikings
are assayed against them at each quarter, before the goddess, by priests who
are not employees of the treasury and cannot be dismissed by it.

This has become the most delicate room in [[Aeterna City]]. The debasement noted
in [[Economic]] is real, ordered from above, and the quarterly assay records it
in the temple's own ledgers in front of witnesses who are sworn.

The priesthood has not refused. It has simply continued to record, and the
[[Mithril Reserve]] has continued to read the record, which is how a bank in a
mountain four hundred miles away knows the weight of Invictian silver more
exactly than the Senate does.

The goddess is said to be attentive to false weight. Nobody in the undercroft
treats this as metaphor.`,
  },
  {
    name: "Vault of Mercury",
    summary:
      "The merchants' temple-bank in the Duneforged Citadel — sanctuary deposits under the god of commerce, and of thieves.",
    basis:
      "The Roman temple-treasury: sacred deposits under divine protection, and Mercury as patron of both merchants and thieves.",
    body: `Set within the cathedral precinct of the [[Duneforged Citadel]], the Vault takes
deposits under the protection of the god of merchants — which is to say, under
the protection of the god of thieves, a duality no Invictian has ever found
awkward.

The theology is practical. Mercury does not forbid theft; he governs it. Goods
placed in his vault are placed inside his jurisdiction, and to take them is not
a crime against the owner but a breach of the god's own house rules, which is a
far more serious matter and settled by far less patient parties.

In practice the Vault serves merchants too small for the [[Mithril Reserve]] and
travellers who need a thing held for a season. It asks no questions about what
is deposited, keeps no ledger of ownership beyond a token and a matching token,
and has never, in four centuries, admitted to a loss.

The priesthood is cheerful, quick, and famously good with numbers. Several are
retired from trades that give them insight into how a vault might be entered.
This is not concealed. It is, if anything, the advertisement.`,
  },
  {
    name: "Forge of Vulcan",
    summary:
      "The Citadel's sacred forge, where a fire that has not been let out in six centuries does things to metal that the smiths will not fully explain.",
    basis:
      "The Roman Vulcanal and the smith-god's forge; the sacred flame maintained without interruption.",
    body: `The largest of the temple-forges in the cathedral precinct of the
[[Duneforged Citadel]], and the reason Duneforged work commands what it does.

The fire has not been out in six hundred and eleven years. This is recorded,
audited, and taken with complete seriousness — the relighting of a lapsed sacred
forge requires rites that the priesthood would rather not perform and the Duke
would rather not pay for. Fuel is delivered on a rota that has never failed,
including during two sieges.

What the fire does is disputed. The smiths say only that metal worked in it
takes temper more evenly than it should and holds an edge past what the alloy
ought to allow. The priesthood says the god attends the work. The
[[Mithril Reserve]], which buys here, says nothing and pays the difference.

Apprentices are bound for nine years and spend the first three not touching
metal. What they do instead is tend the fire, in shifts, at every hour — and the
older smiths will tell you, without embarrassment, that this is the actual
training, and that the metalwork is comparatively simple.`,
  },
  {
    name: "Healer’s Sanctuary",
    summary:
      "Where the sick sleep in the god's own hall and are told what ails them in a dream — with the priests taking careful notes either way.",
    basis:
      "The Asklepieion: temple healing by incubation, where patients slept in the sanctuary to be diagnosed in dreams.",
    body: `A long hall of quiet cells within the [[Duneforged Citadel]] where the treatment
is, in the first instance, sleep.

A petitioner bathes, fasts, makes a modest offering, and is bedded down in the
hall itself. What is supposed to happen is a dream in which the god appears and
either performs the cure or names it. In the morning the priest-physicians take
a full account of the dream and act on it.

Sceptics of [[Hellenoria]] have been pointing out for centuries that the fasting,
the bathing, the quiet and the sleep would improve most patients on their own,
and that the priests' interpretations are conveniently flexible. The Sanctuary's
answer is its archive: every dream and every outcome, written down, kept, and
consulted. Whatever the mechanism, the recurring dreams have been sorted into
patterns, and the patterns have become the closest thing on the continent to a
diagnostic manual.

The physicians here are therefore excellent, and mostly by accident of
bookkeeping. The votive offerings — small silver models of the healed part — hang
in their thousands from the roof beams, and the roof beams have twice been
reinforced.`,
  },
  {
    name: "Sanctum of Hoplodamus",
    summary:
      "A shrine to the giant who stood for the gods when the Titans came — where the Citadel's guard swear, and oversized armour hangs on the walls.",
    basis:
      "Hoplodamus, the giant who in Greek myth defended Rhea against the Titans — a giant on the gods' side.",
    body: `The soldiers' shrine of the [[Duneforged Citadel]]'s cathedral precinct, and the
least ornamented room in it.

Hoplodamus is an awkward figure: a giant who fought for the gods against his own
kind when the Titans rose. The Asetherian pantheons keep the Titans as a real and
extensive line — fifty-one of them are recorded — which makes the story of a
giant who changed sides less a myth than a precedent, and precedent is what
soldiers want from a shrine.

The oath sworn here is not to the Duke, and this is the point. It is to hold when
holding is the correct thing to do, against whatever is in front of you,
including your own. Officers of the citadel garrison swear it on commission. So,
by long custom, do the [[The Vigiles]]' counterparts here.

Armour hangs on the walls: a mail coat, greaves, and a helm, all of them
proportioned for something roughly four times a man. They are old, they are
genuine metal, and no one has ever produced a satisfying account of where they
came from. Recruits are shown them on the day they swear and are not told
anything about them at all.`,
  },
  {
    name: "The Dune Mines",
    summary:
      "Shafts sunk under the sand for the ore that made the Citadel — worked in shifts against heat that kills in hours.",
    basis:
      "Ancient deep-shaft desert mining, and the Roman use of convict labour in the worst workings.",
    body: `The workings that made the [[Duneforged Citadel]] a power rather than an
outpost: shafts driven through sand and cap-rock into the ore bodies beneath the
southern desert.

The engineering problem is not the digging but the heat. Below a certain depth
the rock itself is warm, and air in a dead-end gallery becomes lethal quickly
and without much warning. The Citadel's solution is a ventilation system of
paired shafts and fire-draughts that is genuinely sophisticated, expensive to
maintain, and the reason a Dune miner works a four-hour shift and no longer.

Free miners work the upper galleries at good wages. The deep galleries were
historically worked by the condemned, and the Citadel has been quietly retiring
that practice since the Treaty — partly from conscience, mostly because the
supply of condemned men dried up when the war did.

The ore is exceptional. It is also finite, and the assay reports have been
trending in one direction for a decade. The families who own shares in the
shafts have begun buying land instead, which is the kind of thing that is
noticed.`,
  },
  {
    name: "Shrine of Anchiale",
    summary:
      "A small shrine to the Titan of craft-fire — tolerated inside the cathedral, and older than everything around it.",
    basis:
      "Anchiale, the Titan associated with the warmth of fire, kept in the codex's own Titan pantheon.",
    body: `The smallest chamber in the cathedral precinct of the [[Duneforged Citadel]],
and the only one whose foundations do not match the rest of the building.

Anchiale belongs to the Titan line, not to the Invictian gods, and a Titan shrine
inside a cathedral of the standing pantheon is an anomaly that visiting clergy
raise roughly once a generation. The Citadel's answer has not changed: the shrine
was here first, the cathedral was built around it rather than over it, and the
[[Forge of Vulcan]] two doors away has burned for six centuries without incident,
which suggests the arrangement is acceptable to everyone who matters.

Smiths come here before beginning work they are frightened of. The offering is
a handful of ash from one's own forge, left in a stone dish that is emptied by
nobody and is never full.

The chamber is warm in the same manner as the southern face of
[[Vael’Tharan Mountain]] — faintly, constantly, and from no identifiable source.
The priesthood of the cathedral does not comment on this and does not permit it
to be measured.`,
  },

  // --------------------------------------------------------------- FACTIONS --
  {
    name: "The Virtuous",
    summary:
      "The continental alignment of orders that hold the peace worth keeping — guilds, healers, and knights who mostly agree, which is their weakness.",
    basis: "Summary only; the existing body is left untouched.",
    body: "",
  },
  {
    name: "The Impartial",
    summary:
      "Those who serve whoever pays and whoever asks — merchants, banks, mercenaries, and the couriers all three empires need to stay neutral.",
    basis: "Summary only; the existing body is left untouched.",
    body: "",
  },
  {
    name: "The Occult",
    summary:
      "Cults, forbidden alchemists, and the orders that survived being outlawed — fragmented by design, so no single loss ends them.",
    basis: "Summary only; the existing body is left untouched.",
    body: "",
  },
];

async function main() {
  const rows = await db
    .select({
      id: entries.id,
      name: entries.name,
      kind: entries.kind,
      body: entries.body,
      summary: entries.summary,
      dmNotes: entries.dmNotes,
    })
    .from(entries)
    .where(sql`${entries.archivedAt} is null`);

  const byName = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const k = r.name.trim().toLowerCase();
    if (!byName.has(k)) byName.set(k, r);
  }

  const plan: {
    id: string;
    name: string;
    body?: string;
    summary?: string;
    dmNotes?: string;
  }[] = [];
  const missing: string[] = [];

  for (const d of DESCRIPTIONS) {
    const hit = byName.get(d.name.trim().toLowerCase());
    if (!hit) {
      missing.push(d.name);
      continue;
    }
    const set: (typeof plan)[number] = { id: hit.id, name: hit.name };
    // Only ever fill a gap.
    if (d.body && !hit.body.trim()) {
      set.body = d.body;
      set.dmNotes = hit.dmNotes?.trim() ? hit.dmNotes : `Adapted from: ${d.basis}`;
    }
    const emptySummary = !hit.summary?.trim() || /^untitled$/i.test(hit.summary.trim());
    if (d.summary && emptySummary) set.summary = d.summary;
    if (set.body || set.summary) plan.push(set);
  }

  console.log(`\n  described  : ${DESCRIPTIONS.length}`);
  console.log(`  not found  : ${missing.length}${missing.length ? " -> " + missing.join(", ") : ""}`);
  console.log(`  to write   : ${plan.length}\n`);
  for (const p of plan) {
    const bits = [p.body ? `body ${p.body.length}` : null, p.summary ? "summary" : null]
      .filter(Boolean)
      .join(" + ");
    console.log(`    ${p.name.slice(0, 34).padEnd(36)} ${bits}`);
  }

  if (!APPLY) {
    console.log("\n  Dry run. Re-run with --apply to write these descriptions.\n");
    return;
  }

  for (const p of plan) {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (p.body) set.body = p.body;
    if (p.summary) set.summary = p.summary;
    if (p.dmNotes) set.dmNotes = p.dmNotes;
    await db.update(entries).set(set).where(eq(entries.id, p.id));

    if (!p.body) continue;
    for (const name of new Set([...p.body.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].trim()))) {
      const [t] = await db
        .select({ id: entries.id })
        .from(entries)
        .where(sql`lower(${entries.name}) = lower(${name}) and ${entries.archivedAt} is null`)
        .limit(1);
      if (!t) {
        console.log(`    ! unresolved wikilink in ${p.name}: [[${name}]]`);
        continue;
      }
      await db
        .insert(links)
        .values({ sourceId: p.id, targetId: t.id, relation: "mentions" })
        .onConflictDoNothing();
    }
  }
  console.log(`\n  Wrote ${plan.length} descriptions.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
