/**
 * Adds entries for institutions the three empires plainly must have but that
 * the codex had no page for.
 *
 * Nothing here is invented whole. Each entry adapts a real institution of the
 * empire that power is built on — Rome for the Imperium Invicta, Greece for
 * Hellenoria, Achaemenid Persia for Acheaoria — and is written to sit inside
 * the situation the codex already describes: five years after the Treaty of
 * Deiperdeum, with demobilised legions unpaid, the League fragmenting, and the
 * satrapies restless.
 *
 * Idempotent: an entry whose slug already exists is skipped, never overwritten.
 *
 * Run with:  npx tsx scripts/add-imperial-entries.ts          (dry run)
 *            npx tsx scripts/add-imperial-entries.ts --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, inArray, sql } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { entries, links, type EntryKind } from "../src/db/schema";

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

type NewEntry = {
  slug: string;
  name: string;
  kind: EntryKind;
  summary: string;
  tags: string[];
  fields?: Record<string, string>;
  /** Slug of the entry this hangs under, if any. */
  parent?: string;
  /** Real-world institution this adapts, recorded for the DM. */
  basis: string;
  body: string;
};

const NEW_ENTRIES: NewEntry[] = [
  // -------------------------------------------------------------- Imperium --
  {
    slug: "the-annona",
    name: "The Annona",
    kind: "system",
    summary:
      "The Imperium's grain dole — the promise that fed the capital for a thousand years, and the promise it can no longer afford.",
    tags: ["Systems", "Invictian", "Economy"],
    fields: { category: "Economic" },
    basis: "The Roman annona, the state grain dole administered by the praefectus annonae.",
    body: `## Overview

The *Annona* is the Imperium's oldest promise: that no citizen of the capital
will starve while the state stands. Grain is levied from the provinces, shipped
under state contract, stored in the great horrea, and distributed by ticket to
every registered citizen of [[Aeterna City]].

It began as a hedge against bread riots during the early wars and hardened into
an entitlement that no *Dominus Militum* has dared touch. Feeding the capital is
not charity in the Imperium. It is the price of its quiet.

## How it works

- **The levy.** Each province owes a fixed measure of grain, assessed on
  cultivated land rather than harvest, so a bad year falls on the farmer and not
  on the treasury.
- **The ticket.** Registered citizens hold a *tessera*, an inscribed token
  claimed monthly at a distribution point. Tesserae are heritable, which means a
  great many are held by people who have never lived in the capital.
- **The prefect.** A single officer, answering to the *Dominus Militum*, holds
  the contracts, the granaries, and the shipping. It is the least glamorous and
  most quietly powerful appointment in the Imperium.

## Why it is breaking

The war ended and the arithmetic did not improve. Provincial levies now arrive
short, because the Legates who govern those provinces have learned that grain
retained is grain that feeds their own troops. Meanwhile the demobilised legions
described in [[Political]] were promised land, and land they have not received;
many have drifted to the capital instead, where a tessera is easier to obtain
than a farm.

The result is a dole feeding a swelling population from a shrinking levy, in a
treasury already debasing its coinage. The prefect has twice petitioned to cut
the ration. Both petitions were refused, and both refusals were correct: the
first thing a hungry capital does is remember that the Senate used to matter.

## At the table

Whoever controls the *Annona* controls whether Aeterna is calm. A Legate who
interrupts a grain convoy is not committing robbery — he is making an argument.`,
  },
  {
    slug: "the-vigiles",
    name: "The Vigiles",
    kind: "organization",
    summary:
      "Aeterna's night watch and fire brigade — seven cohorts of freedmen who are the only armed force permitted inside the capital's walls.",
    tags: ["Invictian", "The Impartial", "Military Order"],
    fields: {
      type: "Military Order",
      subcategory: "The Impartial",
      organization: "Invictian Organization",
      location: "Aeterna City",
      category: "KNOWN",
    },
    basis: "Rome's vigiles urbani, the freedman fire brigade and night watch of the capital.",
    body: `## Overview

Legions are forbidden inside the walls of [[Aeterna City]]. The compromise that
made that law survivable is the *Vigiles*: seven cohorts of freedmen who patrol
the capital by night, fight its fires, and hold the only legal weapons within
the pomerium — hand axes, buckets, and the authority to break down a door.

They are not soldiers and are careful to say so. They are also the only body of
armed men a Legate cannot lawfully command, which makes their prefect a figure
of far more consequence than his station suggests.

## Duties

- **Fire.** Aeterna is six storeys of timber above stone. The *Vigiles* keep
  siphons, vinegar-soaked blankets, and the right to demolish a neighbour's
  building to starve a blaze — a right exercised often and resented always.
- **The night.** Curfew enforcement, footpads, and the endless business of
  drunks. They may detain but not try; prisoners go to the urban prefect at dawn.
- **Water.** They inspect the cisterns and the outlets of the [[Aqua Aeterna]],
  and can close a bath-house that has been drawing more than its share.

## Now

The demobilised legionaries crowding the capital are the *Vigiles*' problem
every single night, and the cohorts are recruited from exactly the class those
veterans despise. Twice in the last year a patrol has been beaten by men who
outnumbered and outmatched them, and both times the Council of Legates declined
to intervene. The prefect has begun quietly recruiting veterans of his own.

The day the *Vigiles* stop being freedmen with axes and start being soldiers
with a grievance is the day the law that keeps legions out of Aeterna stops
meaning anything.`,
  },
  {
    slug: "aqua-aeterna",
    name: "The Aqua Aeterna",
    kind: "location",
    summary:
      "The aqueduct that carries the capital's water sixty miles from the Klynin springs — and the reason a siege of Aeterna has never once succeeded.",
    tags: ["Site", "Invictian"],
    fields: { tier: "site", region: "Latium Plains", type: "Aqueduct" },
    basis: "Rome's aqueducts and the cura aquarum that maintained them.",
    body: `## Overview

Sixty miles of channel, most of it underground, carrying spring water from the
Klynin foothills to the fountains of [[Aeterna City]]. Where the ground falls
away the *Aqua Aeterna* rides arcades of brick-faced concrete, and for the last
four miles into the city it runs on a double tier of arches tall enough to be
visible from the Latium road.

The gradient is the achievement. Over sixty miles the channel drops a little
under one part in four thousand, held to that line across three river valleys by
surveyors whose names are recorded nowhere.

## Why it matters

An army besieging Aeterna has always faced the same problem: cutting the
aqueduct does not take the city. The capital sits on cisterns, wells, and a
river, and the *Aqua* supplies the baths and the fountains rather than survival.
Severing it inconveniences the rich, ruins the poor, and hardens everyone.

Twice in the long war an Acheaorian force reached the arcades and broke a span.
Both times the channel was carrying again within the month, and both times the
siege ended in the same way sieges of Aeterna always end.

## Now

The maintenance office was funded out of the war budget, and the war budget no
longer exists. Three spans on the upper course are shored with timber that was
meant to last a season and has lasted four years. The water arrives brown after
rain, which the physicians of the capital have begun, cautiously, to write about.`,
  },

  // ------------------------------------------------------------ Hellenoria --
  {
    slug: "the-theoric-fund",
    name: "The Theoric Fund",
    kind: "system",
    summary:
      "The Hellenorian public purse that pays citizens to attend the festivals — untouchable by law, and the reason the League cannot fund a fleet.",
    tags: ["Systems", "Hellenorian", "Economy"],
    fields: { category: "Economic" },
    basis: "The Athenian theorikon, the festival fund that could not lawfully be spent on war.",
    body: `## Overview

Every surplus in a Hellenorian city-state's treasury flows first into the
*Theoric Fund*, which pays each citizen the price of a seat at the festivals and
the days' wages lost attending them. It is the most popular institution in
[[Hellenoria]] and, in the judgement of every admiral who has ever tried to
raise a fleet, the most ruinous.

The principle is that a citizen who cannot afford to attend the rites is a
citizen only in name. The consequence is that the money is spent before anything
else can claim it.

## The law

In most League cities it is a capital offence to propose moving theoric money to
military use. The prohibition was written during the war, when the assemblies
feared their generals more than they feared the enemy, and it has outlived the
fear that produced it.

There are ways around it, all of them slow: a city may vote a special levy, or
borrow against harbour dues, or accept a loan from the [[Mithril Reserve]] at
rates that assume — correctly — that it will struggle to repay.

## Now

The naval hegemon has spent five years arguing that the fund should be opened to
pay for the common fleet. The smaller city-states have spent five years noticing
that the common fleet is berthed in the hegemon's harbour and crewed by its
citizens.

So the fund stays shut, the festivals are magnificent, the ships rot at their
moorings, and the tyrants — who are not troubled by assemblies — build navies of
their own.`,
  },
  {
    slug: "the-amphictyony-of-delphara",
    name: "The Amphictyony of Delphara",
    kind: "organization",
    summary:
      "The league of cities that jointly governs the sanctuary at Delphara — the one Hellenorian body that still commands obedience, because it can close the oracle.",
    tags: ["Hellenorian", "The Impartial", "Religious Order"],
    fields: {
      type: "Religious Order",
      subcategory: "The Impartial",
      organization: "Hellenorian Organization",
      location: "Delphara City",
      category: "KNOWN",
    },
    basis:
      "The Delphic Amphictyonic League, the council of tribes that administered the sanctuary at Delphi and could declare sacred war.",
    body: `## Overview

Twelve cities send two delegates each to the council that administers the
sanctuary at [[Delphara City]]. The *Amphictyony* owns nothing else, governs
nothing else, and is the only Hellenorian institution whose rulings are still
obeyed without argument.

Its authority is narrow and absolute: it sets the calendar of the festival, it
audits the treasuries dedicated at the sanctuary, it fixes the boundaries of the
sacred land, and it decides who may consult the oracle.

## The oath

Every delegate swears the same oath their predecessors swore: not to raze an
Amphictyonic city, not to cut off its running water in war or peace, and to
march against any power that does. In fifteen centuries of continental war the
oath has been invoked four times. On each occasion the offending city was
brought to terms within a season, because a Hellenorian city denied water and
denied the oracle is a city that stops being able to govern itself.

## Sacred war

The council's ultimate sanction is to declare a *sacred war* against a member
that has profaned the sanctuary — cultivating the sacred plain, diverting its
springs, or plundering the dedications. Sacred wars are rare and unusually
final, since they oblige every other member to join.

Three tyrants have been removed this way. Two of them by their own citizens,
before the League's forces had finished mustering.

## Now

Two of the twelve seats are held by cities that have fallen to tyrants since the
Treaty, and the council has not decided whether a tyrant's delegate is a
delegate. Until it does, no ruling can command the full twelve, and both tyrants
know it. It is the cheapest and most effective attack anyone has yet made on the
one Hellenorian institution that works.`,
  },

  // ------------------------------------------------------------- Acheaoria --
  {
    slug: "the-qanat-network",
    name: "The Qanat Network",
    kind: "system",
    summary:
      "The underground channels that make an empire of deserts habitable — dug by hand, inherited by family, and the reason Acheaorian towns are built below ground.",
    tags: ["Systems", "Acheaorian", "Infrastructure"],
    fields: { category: "Infrastructure" },
    basis: "The Persian qanat, gently sloping underground aqueducts tapping mountain aquifers.",
    body: `## Overview

[[Acheaoria]] is mostly desert and has been prosperous for two thousand years,
and the reconciliation of those two facts is the *qanat*. A mother well is sunk
at the foot of the highlands until it strikes the water table; from it a tunnel
is driven, falling more gently than the land above, until it surfaces as a
stream in country where no stream should exist.

A line of spoil rings across the flats marks the shafts sunk every thirty paces
for air and for hauling. From the air an Acheaorian plain reads as a dotted line
drawn from the mountains to a town.

## Why it works

Water in a *qanat* never sees the sun, so almost none is lost to the heat. It
flows by gravity alone, needing no lifting and no fuel. And it cannot be
over-drawn: the tunnel takes only what the aquifer offers at that level, so the
network fails gradually and visibly rather than suddenly.

Nothing built above ground in a desert survives a siege. A *qanat* is invisible,
unburnable, and its shafts are too narrow for a man in armour.

## Ownership

A *qanat* belongs to the family that dug it, and shares in its water are
inherited, sold, and litigated over exactly as land is. The *muqanni* who
maintain the tunnels are a hereditary trade, well paid and short-lived; the work
is done lying down in the dark, and the tunnels collapse.

This is why so many Acheaorian settlements are cut into the rock beside their
own channels rather than built on the surface above them. Where the codex marks
an *Acheaorian Underground Town*, it is describing a town that followed its
water down.

## Now

The satrapies fund maintenance from tribute they are increasingly reluctant to
forward to the throne, and a *qanat* neglected for a decade is a *qanat* that
must be re-dug. Two towns on the northern route have already been abandoned. The
Magi call it a judgement. The *muqanni* call it a shortage of *muqanni*.`,
  },
  {
    slug: "the-ten-thousand",
    name: "The Ten Thousand",
    kind: "organization",
    summary:
      "The King of Kings' standing guard, kept at exactly ten thousand men — every casualty replaced the same day, so that the number never falls and the guard never dies.",
    tags: ["Acheaorian", "The Impartial", "Military Order"],
    fields: {
      type: "Military Order",
      subcategory: "The Impartial",
      organization: "Acheaorian Organization",
      location: "Persemenid City",
      category: "KNOWN",
    },
    basis:
      "The Achaemenid Immortals, the 10,000-strong royal guard whose strength was kept constant by immediate replacement.",
    body: `## Overview

The household guard of the King of Kings numbers ten thousand men and has
numbered ten thousand men for as long as [[Acheaoria]] has kept records. A
soldier who falls, sickens, or is dismissed is replaced from a standing roll
before the day is out. The strength on parade is therefore always exactly the
strength on the rolls, and the guard has never in its history been reported as
diminished.

The court makes rather more of this than the arrangement warrants. Common
Acheaorians will tell you the guard cannot die.

## Composition

- **The Thousand.** The first regiment, spear-butts capped in gold, quartered
  inside the palace precinct at [[Persemenid City]]. Recruited exclusively from
  the old Acheaorian nobility, which makes it a hostage-house as much as a guard.
- **The Nine.** Nine further regiments of a thousand, drawn from the empire's
  core provinces but never from the frontier satrapies — a distinction the
  frontier satrapies have not failed to notice.
- **The Roll.** The waiting list. A place on it is bought, inherited, or granted,
  and a man may wait his whole life on it without ever being called.

## The problem with never diminishing

A guard that is always at strength is a guard whose losses are invisible. During
the last decades of the war the replacement roll was drawn down almost to
nothing, and no report to the throne ever recorded a single gap. The court
believed it commanded ten thousand veterans. It commanded ten thousand uniforms,
an increasing number of them filled by boys.

Five years of peace have refilled the ranks with men who have never fought. The
guard is at full strength, magnificently equipped, and less use than at any point
in its history — and because of how it counts itself, there is no document
anywhere in [[Acheaoria]] that says so.`,
  },
  {
    slug: "the-paradise-of-persemenid",
    name: "The Paradise of Persemenid",
    kind: "location",
    summary:
      "The King of Kings' walled hunting garden — an artificial wilderness watered by qanat, where the empire's fitness to rule is demonstrated annually.",
    tags: ["Site", "Acheaorian"],
    fields: { tier: "site", region: "Acheaoria", type: "Royal Garden" },
    basis:
      "The Persian pairidaēza, the walled royal parks that gave us the word paradise.",
    body: `## Overview

A wall of fired brick eleven miles around, enclosing watered woodland in a
country that has none. Inside are cedar and plane and fruit trees in ranks,
streams led from the [[The Qanat Network]], and game — deer, boar, lion, and
onager — kept at numbers the land could never support unaided.

The word the Acheaorians use for it means simply *walled around*. Every
provincial satrap maintains a lesser one, and the size of a man's garden is
understood to be the size of his claim.

## The hunt

Once a year the King of Kings hunts here before the court. The performance is
the point: a king who can kill a lion is a king the gods still favour, and a
king who cannot is a king about whom things begin to be said.

The outcome is not left to chance. The beasts are driven, the ground is chosen,
and a man of the [[The Ten Thousand]] stands within a spear's throw throughout.
Everyone present understands this. It changes nothing — what is being
demonstrated is not the king's courage but the empire's ability to stage the
world exactly as it wishes it to be.

## As an idea

The garden is the Acheaorian theory of empire made literal. Wilderness is not
conquered but enclosed, watered, ordered, and stocked; the lion is not killed in
its own country but brought to a place where it can be killed correctly.

Every satrapy is meant to be a smaller version of the same operation. The
satrapies that are no longer sending tribute are, in this reading, not rebelling
so much as reverting.

## Now

The garden's water comes from three channels, and the westernmost has been
failing for two years. The trees on that side are being cut before they die
standing, which the court has ordered done at night.`,
  },

  // ------------------------------------------------------------ Continental --
  {
    slug: "the-cursus-honorum",
    name: "The Cursus Honorum",
    kind: "rule",
    summary:
      "The Imperium's ladder of offices — the sequence a man once climbed to rule, now a set of courtesies performed on the way to a military command.",
    tags: ["Invictian", "House Rule", "Politics"],
    fields: { category: "Politics" },
    basis: "Rome's cursus honorum, the fixed sequence of magistracies with minimum ages.",
    body: `## Overview

The *Cursus Honorum* is the fixed order in which a citizen of the
[[Imperium Invicta]] holds office: a minimum age for each post, a minimum
interval between them, and no man to hold the same office twice within ten
years. It was designed to stop any one family from owning the state.

It worked for four hundred years. It has not worked for a thousand.

## The ladder

| Office | Minimum age | What it actually does now |
| --- | --- | --- |
| Quaestor | 30 | Audits a provincial treasury. A real job, given to nobodies. |
| Aedile | 36 | Games, markets, and the streets of the capital. Bought, not earned. |
| Praetor | 39 | Judges. Still respected; still powerless against a Legate. |
| Consul | 42 | Presides over a Senate that decides nothing. One year, then a province. |

## Why it is hollow

Every office on the ladder is civil, and the Imperium has been governed by
soldiers since the *Dominus Militum* became permanent. A man who completes the
whole sequence has demonstrated that his family is wealthy and that he is
patient. He has not demonstrated that he commands anything.

The men who actually hold power — the Council of Legates described in
[[Political]] — climbed a different ladder entirely: tribune, prefect of a
cohort, legate of a legion, and command of a province with the troops still
loyal to them personally.

Ambitious young patricians now run the *Cursus* as fast as the law permits,
paying the fines for irregularities, purely to acquire the dignity before taking
a military post where the real advancement is.

## At the table

Useful for placing an NPC precisely. A man introduced as "praetorian" is
respectable, propertied, and almost certainly irrelevant to anything violent
that is about to happen — which is exactly why he may be worth talking to.`,
  },
];

async function main() {
  const slugs = NEW_ENTRIES.map((e) => e.slug);
  const already = await db
    .select({ slug: entries.slug })
    .from(entries)
    .where(inArray(entries.slug, slugs));
  const have = new Set(already.map((r) => r.slug));

  const todo = NEW_ENTRIES.filter((e) => !have.has(e.slug));

  console.log(`\n  defined : ${NEW_ENTRIES.length}`);
  console.log(`  existing: ${have.size} (skipped)`);
  console.log(`  to add  : ${todo.length}\n`);
  for (const e of todo) {
    console.log(`    ${e.name.padEnd(30)} ${e.kind.padEnd(13)} ${String(e.body.length).padStart(5)} chars`);
    console.log(`      basis: ${e.basis}`);
    console.log(`      tags : ${e.tags.join(", ")}`);
  }

  if (!APPLY) {
    console.log("\n  Dry run. Re-run with --apply to create these entries.\n");
    return;
  }

  for (const e of todo) {
    const [row] = await db
      .insert(entries)
      .values({
        slug: e.slug,
        kind: e.kind,
        name: e.name,
        summary: e.summary,
        body: e.body,
        dmNotes: `Adapted from: ${e.basis}`,
        fields: e.fields ?? {},
        tags: e.tags,
        visibility: "public",
      })
      .returning({ id: entries.id });

    if (e.parent) {
      const [p] = await db
        .select({ id: entries.id })
        .from(entries)
        .where(eq(entries.slug, e.parent));
      if (p) await db.update(entries).set({ parentId: p.id }).where(eq(entries.id, row.id));
    }

    // Resolve [[Wikilinks]] so the new pages join the cross-reference graph.
    for (const name of new Set([...e.body.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].trim()))) {
      const [t] = await db
        .select({ id: entries.id })
        .from(entries)
        .where(sql`lower(${entries.name}) = lower(${name}) and ${entries.archivedAt} is null`)
        .limit(1);
      if (!t) {
        console.log(`    ! unresolved wikilink in ${e.name}: [[${name}]]`);
        continue;
      }
      await db
        .insert(links)
        .values({ sourceId: row.id, targetId: t.id, relation: "mentions" })
        .onConflictDoNothing();
    }
  }

  console.log(`\n  Created ${todo.length} entries.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
