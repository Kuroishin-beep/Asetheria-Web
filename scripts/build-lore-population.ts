/**
 * Builds `data/lore-population.json`: bodies (and summaries where blank) for
 * the 186 deities, which until now were a name and four properties each.
 *
 * Nothing is invented whole. Every body is assembled from what the codex and
 * the world's sources already establish:
 *
 *  1. **The namesake.** Most of the Titans and the Hellenorian and Invictian
 *     gods carry the name of a real Greek or Roman deity, and the domains the
 *     codex gives them follow that figure. One line says who that is in myth.
 *  2. **The pantheon.** What the pantheon is in Asetheria — the empire whose
 *     state cult it is, or the older/stranger order it belongs to.
 *  3. **The properties.** Domains, alignment and the form iconography gives the
 *     god, read as how worship of them actually looks.
 *  4. **The worshippers.** Every organization whose `dedicatedTo` names the
 *     god, every temple the expansion keeps for them, every NPC whose `gods`
 *     names them — linked, so the graph connects gods to the people who serve
 *     them.
 *
 * The Ascended carry the names of a published setting's gods. Their bodies say
 * only what they are *in Asetheria* and retell none of that setting's lore.
 *
 * Load the result with:
 *   npx tsx scripts/import-codex-file.ts data/lore-population.json --fill-empty
 * which only ever fills blank fields.
 *
 * Run with:  npx tsx scripts/build-lore-population.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");

type SeedEntry = {
  slug: string;
  kind: string;
  name: string;
  summary: string;
  body: string;
  fields: Record<string, string>;
  tags: string[];
};

const load = (f: string): SeedEntry[] =>
  JSON.parse(fs.readFileSync(path.join(REPO, "data", f), "utf8")).entries;

const all = [...load("world-seed.json"), ...load("expansion.json"), ...load("foundry-world.json")];

// ---------------------------------------------------------------------------
// 1. Namesakes — one line each, from the Greek and Roman sources.
// ---------------------------------------------------------------------------

const NAMESAKE: Record<string, string> = {
  // Titans and the older Greek powers
  Anchiale: "In Greek myth Anchiale is a Titaness of the warmth of fire, the heat that a forge holds after the flame dies down.",
  Asteria: "In Greek myth Asteria is the Titaness of falling stars and of oracles read in the night sky, who fled Zeus by becoming the wandering island of Delos.",
  Astraeus: "In Greek myth Astraeus is the Titan of dusk, father of the four winds and of the stars.",
  Atlas: "In Greek myth Atlas is the Titan condemned after the war against the Olympians to hold up the sky forever.",
  Aura: "In Greek myth Aura is the Titaness of the breeze and the cool air of early morning, swift and unwilling to be caught.",
  Clymene: "In Greek myth Clymene is the Titaness of renown, the mother of Prometheus and Atlas, whose name means fame.",
  Coeus: "In Greek myth Coeus is the Titan of the inquiring mind and of the axis the heavens turn on.",
  Crius: "In Greek myth Crius is the Titan of the constellations that mark the year, the ram that leads the stars in spring.",
  Cronus: "In Greek myth Cronus is the Titan of time and the harvest sickle, who overthrew his father and devoured his own children for fear of the same fate.",
  Curetes: "In Greek myth the Curetes are the armed dancers who hid the infant Zeus from Cronus by clashing their shields to drown his cries.",
  Dione: "In Greek myth Dione is a Titaness of prophecy honoured at the oracle of Dodona, where the god's will was heard in the rustling of an oak.",
  Eos: "In Greek myth Eos is the Titaness of the dawn, who opens the gates of heaven each morning for the sun.",
  Epimetheus: "In Greek myth Epimetheus is the Titan of afterthought, who handed out every gift to the beasts before remembering mankind.",
  Eurybia: "In Greek myth Eurybia is the Titaness of mastery over the sea, of the force of winds and the rise of constellations over water.",
  Eurynome: "In Greek myth Eurynome is the Titaness of water-meadows and pasture, who in the oldest accounts ruled the world before Cronus.",
  Gigantes: "In Greek myth the Gigantes are the giants born of the Earth, who rose against the Olympians in the war called the Gigantomachy.",
  Helios: "In Greek myth Helios is the sun itself, driving its chariot across the sky and seeing everything done beneath it.",
  Hoplodamus: "In Greek myth Hoplodamus is the giant who stood guard over Rhea while she carried Zeus, so that Cronus could not reach the child.",
  Hyperion: "In Greek myth Hyperion is the Titan of heavenly light and watchfulness, father of the sun, the moon and the dawn.",
  Iapetus: "In Greek myth Iapetus is the Titan of mortality, the piercer, from whose line mortal humanity is said to descend.",
  Lelantos: "In Greek myth Lelantos is the Titan of unseen air and of the hunter's skill of moving without being noticed.",
  Leto: "In Greek myth Leto is the Titaness of motherhood and modesty, who bore Apollo and Artemis while hunted across the world by Hera.",
  Megamedes: "In Greek myth Megamedes is an obscure Titan named as the father of Pallas — a ruler 'of great counsel', as the name says.",
  Melisseus: "In Greek myth Melisseus is the Cretan king whose daughters fed the infant Zeus on honey in hiding; his name means 'of the bees'.",
  Menoetius: "In Greek myth Menoetius is the Titan of violent anger and rash action, struck down by Zeus's thunderbolt for his arrogance.",
  Metis: "In Greek myth Metis is the Titaness of wisdom and cunning counsel, whom Zeus swallowed so that her wisdom would be his.",
  Mnemosyne: "In Greek myth Mnemosyne is the Titaness of memory and the mother of the nine Muses.",
  Muses: "In Greek myth the Elder Muses — Practice, Memory and Song — were the first inspirers, before the nine daughters of Mnemosyne.",
  Mylinus: "In Cretan tradition Mylinus is a Titan or giant of the old order, remembered chiefly for being struck down.",
  Oceanus: "In Greek myth Oceanus is the great river that encircles the world, from which every sea and spring is fed.",
  Olymbrus: "In late Greek tradition Olymbrus is one of the sons of Heaven and Earth, a Titan of the sky.",
  Ophion: "In the oldest Greek cosmogonies Ophion is the primordial serpent who ruled the world from Olympus before the Titans.",
  Ostasus: "In some Greek lists Ostasus is a Titan of the first generation, one of the sons of Heaven and Earth.",
  Pallas: "In Greek myth Pallas is the Titan of warcraft, who fought in the war of the Titans and fell.",
  Perses: "In Greek myth Perses is the Titan of destruction, father of Hecate.",
  Phoebe: "In Greek myth Phoebe is the Titaness of prophecy who held the oracle at Delphi before passing it to Apollo.",
  Phorcys: "In Greek myth Phorcys is the old god of the sea's hidden dangers and the father of monsters: the Gorgons, the Graeae and Scylla.",
  Polus: "In Greek tradition Polus is the celestial pole, a name of the Titan Coeus, around which the heavens turn.",
  Prometheus: "In Greek myth Prometheus is the Titan who stole fire from the gods for mankind and was chained to a mountain for it.",
  Rhea: "In Greek myth Rhea is the mother of the gods, who saved Zeus by giving Cronus a stone wrapped in swaddling to swallow instead.",
  Selene: "In Greek myth Selene is the moon, who drives her pale chariot across the night and loved the sleeping shepherd Endymion.",
  Styx: "In Greek myth Styx is the river of the underworld on which even the gods swear their unbreakable oaths.",
  Syceus: "In Greek myth Syceus is the Titan who fled Zeus's thunderbolt and was hidden by the Earth, which made a fig tree grow over him.",
  Tethys: "In Greek myth Tethys is the Titaness of fresh water, mother of the rivers and springs.",
  Theia: "In Greek myth Theia is the Titaness of sight and of shining light, from whom gold and silver take their brilliance.",
  Themis: "In Greek myth Themis is the Titaness of divine law and right order, who sits beside the throne of heaven as counsellor.",
  // Hellenorian (Greek)
  Aphrodite: "In Greek myth Aphrodite is the goddess of love and beauty, born of the sea foam.",
  Apollo: "In Greek myth Apollo is the god of light, healing, music and prophecy, the lord of Delphi.",
  Ares: "In Greek myth Ares is the god of war's violence and strife, feared and little loved even by the other gods.",
  Artemis: "In Greek myth Artemis is the huntress of the wild places and the moon, protector of the young.",
  Athena: "In Greek myth Athena is the goddess of wisdom, craft and the defence of the city, born armoured from Zeus's head.",
  Demeter: "In Greek myth Demeter is the goddess of grain and the harvest, whose grief for her lost daughter brings the winter.",
  Dionysus: "In Greek myth Dionysus is the god of wine, revelry and ecstatic release, the twice-born.",
  Hades: "In Greek myth Hades is the lord of the dead and of the wealth that lies under the earth.",
  Hecate: "In Greek myth Hecate is the goddess of magic, crossroads and the night, who carries torches between the worlds.",
  Hephaestus: "In Greek myth Hephaestus is the smith of the gods, lame and peerless at the forge.",
  Hera: "In Greek myth Hera is the queen of the gods and the goddess of marriage, family and jealous vengeance.",
  Hercules: "In Greek myth Heracles is the hero of twelve labours, a mortal whose strength won him a place among the gods.",
  Hermes: "In Greek myth Hermes is the messenger of the gods, patron of travellers, merchants and thieves.",
  Hestia: "In Greek myth Hestia is the goddess of the hearth, given the first offering at every sacrifice.",
  Nike: "In Greek myth Nike is the winged goddess of victory, who attends the gods in battle and contest.",
  Pan: "In Greek myth Pan is the goat-footed god of shepherds and the wild, whose shout causes panic.",
  Poseidon: "In Greek myth Poseidon is the god of the sea and the earthquake, the earth-shaker.",
  Tyche: "In Greek myth Tyche is the goddess of fortune and chance, patron of the luck of cities.",
  Zeus: "In Greek myth Zeus is the king of the gods and the lord of storm and thunder.",
  Nyx: "In Greek myth Nyx is the primordial night, a power so old that Zeus himself feared to anger her.",
  Terra: "In Roman myth Terra is the Earth herself, mother of all that grows and stands on it.",
  // Invictian (Roman)
  Arcus: "In Roman tradition Arcus is the rainbow, the bow in the sky that the Greeks called Iris.",
  Aurora: "In Roman myth Aurora is the goddess of the dawn, who renews herself every morning.",
  Bacchus: "In Roman myth Bacchus is the god of wine, freedom and revelry, the Roman Dionysus.",
  Bellona: "In Roman religion Bellona is the goddess of war, at whose temple the Senate met to receive generals and declare war.",
  Caelus: "In Roman myth Caelus is the sky itself, the oldest father, older than the gods who live beneath it.",
  Ceres: "In Roman religion Ceres is the goddess of grain and fertile land, patron of the plebeians and the grain supply.",
  Concordia: "In Roman religion Concordia is the goddess of civic agreement, whose temple was raised to mark the end of civil strife.",
  Cupid: "In Roman myth Cupid is the god of desire, whose arrows wound gods and mortals alike.",
  Cybele: "In Roman religion Cybele is the Great Mother of the mountains and wild places, brought to Rome to save it in war.",
  Diana: "In Roman religion Diana is the goddess of the hunt, the woodland and the moon, worshipped in sacred groves.",
  Faunus: "In Roman religion Faunus is the horned god of the countryside, flocks and the open plain.",
  Febris: "In Roman religion Febris is the goddess of fever, propitiated at three temples so that she would spare the city.",
  Flora: "In Roman religion Flora is the goddess of flowers and the spring, honoured at the riotous Floralia.",
  Fortuna: "In Roman religion Fortuna is the goddess of luck, turning her wheel and pouring from her horn of plenty.",
  Janus: "In Roman religion Janus is the two-faced god of doorways, beginnings and passages, whose temple doors stood open in time of war.",
  Juno: "In Roman religion Juno is the queen of the gods and the protector of the state, of marriage and of the sworn bond.",
  Jupiter: "In Roman religion Jupiter is the king of the gods, lord of the sky and thunder and guarantor of oaths and authority.",
  Juventus: "In Roman religion Juventas is the goddess of youth, especially of young men coming of age to bear arms.",
  Mars: "In Roman religion Mars is the god of war and the father of the Roman people, second only to Jupiter.",
  Mercury: "In Roman religion Mercury is the god of commerce, travel, eloquence and trickery, the Roman Hermes.",
  Minerva: "In Roman religion Minerva is the goddess of wisdom, crafts and the arts, patron of artisans.",
  Mutunus: "In Roman religion Mutunus Tutunus is the god of marital union and fertility, invoked at weddings.",
  Nemesis: "In Roman and Greek religion Nemesis is the goddess of retribution, who brings down those who rise beyond their due.",
  Neptune: "In Roman religion Neptune is the god of the sea, of horses and of fresh water.",
  Phoebus: "In Roman usage Phoebus, 'the bright one', is Apollo as the god of the sun and of illumination.",
  Pluto: "In Roman religion Pluto is the lord of the underworld and of the riches buried in the earth.",
  Pomona: "In Roman religion Pomona is the goddess of fruit trees, gardens and orchards.",
  Proserpina: "In Roman myth Proserpina is the daughter of Ceres taken to the underworld, whose return each spring brings rebirth.",
  Senectus: "In Roman tradition Senectus is old age personified, the gentle end of a long life.",
  Somnus: "In Roman myth Somnus is the god of sleep, who lives in a cave where no light comes and the river of forgetting flows.",
  Spes: "In Roman religion Spes is the goddess of hope, carried a flower in her hand and was honoured in times of crisis.",
  Trivia: "In Roman religion Trivia, 'of the three ways', is the goddess of crossroads, sorcery and the night.",
  Venus: "In Roman religion Venus is the goddess of love, beauty and victory, the mother of the Roman people.",
  Veritas: "In Roman tradition Veritas is truth personified, said to hide at the bottom of a sacred well.",
  Vesta: "In Roman religion Vesta is the goddess of the hearth, whose sacred fire was tended by the Vestal Virgins and must never go out.",
  Victoria: "In Roman religion Victoria is the goddess of victory, whose altar stood in the Senate house.",
  Vis: "In Roman tradition Vis is force and strength personified, the power behind every deed.",
  Vulcan: "In Roman religion Vulcan is the god of fire and the forge, worshipped outside the walls for fear of his flame.",
};

// ---------------------------------------------------------------------------
// 2. Pantheons — what each one is in Asetheria.
// ---------------------------------------------------------------------------

const PANTHEON_TEXT: Record<string, (name: string) => string> = {
  "Aetherian Ancient Titan": (n) =>
    `${n} is one of the Aetherian Ancient Titans, the powers that held the world before the three empires had gods of their own. The codex records the Titans as put down rather than killed, which is why their temples still stand — in the [[Citadel Cathedral]] among other places — and why their worship is older and stranger than any state cult.`,
  Invictian: (n) =>
    `${n} belongs to the Invictian pantheon, the gods of the [[Imperium Invicta]]. Invictian religion is a civic contract: the gods are honoured so that the state prospers, rites are performed correctly whether or not anyone believes in them, and a god's temple is as much a public institution as a holy place.`,
  Hellenorian: (n) =>
    `${n} belongs to the Hellenorian pantheon, the gods of [[Hellenoria]]. Hellenorian worship is local and argumentative: every city keeps its own favourites, its own festivals and its own version of the stories, and the oracles carry more weight than any priesthood.`,
  Acheaorian: (n) =>
    `${n} is one of the Acheaorian gods, worshipped in [[Acheaoria]]. The Acheaorian lesser gods are close to the people who keep them — gods of kin, craft, river and road, honoured at household shrines and caravan halts as much as in the great fire-temples.`,
  "Asetherian Ascended": (n) =>
    `${n} is one of the Asetherian Ascended, the gods who came to the continent from beyond and took root among its peoples. Their worship crosses the borders of all three empires, and none of the imperial priesthoods fully claims them.`,
  "Outer Gods": (n) =>
    `${n} is one of the Outer Gods, powers from beyond the world whose attention is a catastrophe. They are not worshipped so much as served — by cults, by the desperate, and by those who believe that being useful to such a thing is the only safety there is.`,
  Outer: (n) =>
    `${n} is counted among the Outer Gods, powers from beyond the world whose attention is a catastrophe. They are not worshipped so much as served.`,
  "Dreaming Gods": (n) =>
    `${n} is one of the Dreaming Gods, powers that sleep at the edges of the world and reach it through visions, omens and the minds of those who dream too deeply. Few temples are raised to them; their faithful find them, not the other way around.`,
};

// ---------------------------------------------------------------------------
// 3. Properties read as practice.
// ---------------------------------------------------------------------------

const ALIGNMENT_TEXT: Record<string, string> = {
  "Lawful Good": "Its priests keep strict rules and expect the faithful to keep them too, in the belief that right order is itself a kindness.",
  "Neutral Good": "Its faithful are expected to help where they can and are given wide latitude in how.",
  "Chaotic Good": "Its worship is warm and unruly: the faithful honour the god by acting on generous impulse rather than by keeping any particular rite.",
  "Lawful Neutral": "Its rites are exacting and impersonal. The god is owed correct observance, not affection, and gives order in return.",
  "True Neutral": "Its priests take no side in the quarrels of the world, holding that the god's domain must stay in balance whoever profits.",
  Neutral: "It takes no side in the quarrels of the world.",
  "Chaotic Neutral": "It is unpredictable, and so are its faithful; the god is honoured by being given room rather than by being obeyed.",
  "Lawful Evil": "Its worship is a hierarchy of obligation. The god rewards those who serve its ends without question, and its priests are effective, feared and well organised.",
  "Neutral Evil": "Its worship is quiet and self-serving. The faithful bargain with the god for advantage and rarely speak of what they paid.",
  "Chaotic Evil": "Its worship is dangerous to the faithful and to everyone near them. Most of its shrines are hidden, and its cults are hunted.",
};

function shortName(full: string): string {
  return full.split(/[,.]/)[0].trim();
}

function domainsSentence(e: SeedEntry): string | null {
  const domains = e.fields.domains?.replace(/\s+/g, " ").trim();
  if (!domains) return null;
  return `Its domains are ${domains.toLowerCase().replace(/, ([^,]*)$/, " and $1")}.`;
}

function formSentence(e: SeedEntry): string | null {
  const race = e.fields.race?.trim();
  if (!race || /titan/i.test(race)) return null;
  const article = /^[aeiou]/i.test(race) ? "an" : "a";
  return `Asetherian iconography shows ${shortName(e.name)} in the form of ${article} ${race}.`;
}

// ---------------------------------------------------------------------------
// 4. Who serves them, from the codex itself.
// ---------------------------------------------------------------------------

function worshippers(deity: SeedEntry): string[] {
  const short = shortName(deity.name).toLowerCase();
  const full = deity.name.toLowerCase();
  const matches = (v: string | undefined) =>
    !!v &&
    v
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .some((s) => s === short || s === full || s.startsWith(`${short},`) || s.startsWith(`${short} `));

  const lines: string[] = [];
  const orgs = all.filter((e) => e.kind !== "deity" && (matches(e.fields.dedicatedTo) || matches(e.fields.gods)));
  const temples = all.filter(
    (e) => e.kind !== "deity" && e.body.includes(`kept for [[${deity.name}`),
  );
  for (const t of temples) lines.push(`- [[${t.name}]] — ${t.summary.replace(/\.$/, "")}.`);
  for (const o of orgs) {
    if (temples.includes(o)) continue;
    const what = o.kind === "npc" ? "worships them" : o.summary ? o.summary.replace(/\.$/, "") : `is dedicated to ${shortName(deity.name)}`;
    lines.push(`- [[${o.name}]] — ${what}.`);
  }
  return [...new Set(lines)];
}

// ---------------------------------------------------------------------------

function pantheonOf(e: SeedEntry): string {
  if (e.tags.includes("Dreaming Gods")) return "Dreaming Gods";
  return e.fields.pantheon ?? e.tags[0] ?? "";
}

function build(e: SeedEntry) {
  const short = shortName(e.name);
  const key = Object.keys(NAMESAKE).find((k) => short === k || short.startsWith(`${k} `));
  const pantheon = pantheonOf(e);
  const crossListed = e.tags.join(",").includes("Hellenorian") && e.tags.join(",").includes("Invictian");

  const paragraphs = [
    key ? NAMESAKE[key] : null,
    PANTHEON_TEXT[pantheon]?.(short) ?? null,
    crossListed
      ? `${short} is one of the few powers honoured in both the Hellenorian and Invictian calendars, under the same name.`
      : null,
    [domainsSentence(e), ALIGNMENT_TEXT[e.fields.alignment?.trim() ?? ""] ?? null, formSentence(e)]
      .filter(Boolean)
      .join(" "),
  ].filter(Boolean);

  const served = worshippers(e);
  if (served.length) paragraphs.push(`## Served by\n\n${served.join("\n")}`);

  const domains = e.fields.domains?.trim();
  const summary = [
    domains ? `${domains.replace(/\s+/g, " ")}.` : null,
    `${e.fields.alignment?.trim() ?? ""} ${pantheon === "Aetherian Ancient Titan" ? "Titan" : "power"} of the ${pantheon.replace("Aetherian Ancient Titan", "Aetherian Ancient")} pantheon.`.trim(),
  ]
    .filter(Boolean)
    .join(" ");

  return {
    slug: e.slug,
    kind: "deity",
    name: e.name,
    summary,
    body: paragraphs.join("\n\n"),
    dmNotes: "",
    fields: {},
    tags: [],
    visibility: "public",
  };
}

const deities = all.filter((e) => e.kind === "deity");
const out = deities.map(build);
fs.writeFileSync(
  path.join(REPO, "data", "lore-population.json"),
  JSON.stringify(
    {
      format: "asetheria-codex",
      note: "Generated by scripts/build-lore-population.ts. Load with import-codex-file.ts --fill-empty: only blank fields are filled.",
      entries: out,
    },
    null,
    2,
  ) + "\n",
);

const withNamesake = deities.filter((e) => Object.keys(NAMESAKE).some((k) => shortName(e.name) === k || shortName(e.name).startsWith(`${k} `))).length;
const withServants = out.filter((e) => e.body.includes("## Served by")).length;
console.log(`\n  ${out.length} deities written to data/lore-population.json`);
console.log(`  ${withNamesake} with a mythological namesake, ${withServants} with worshippers linked in the codex.\n`);
