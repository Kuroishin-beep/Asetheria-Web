/**
 * Brings the Foundry campaign's players into the web app: the DM account, one
 * player account per Foundry player, and each player's character with its real
 * numbers (scores, skills, AC, HP), written background, spells and gear.
 *
 * The Foundry world (its LevelDB) is the source of truth: it is read from a
 * copy, never written. Players are Foundry users with the PLAYER role and an
 * assigned character.
 *
 *   $env:DM_USERNAME="..."; $env:DM_PASSWORD="..."; $env:PLAYER_PASSWORD="..."
 *   npx tsx scripts/import-foundry-players.ts --target local|neon [--dry-run]
 *       [--world E:/FoundryVTT/Data/worlds/asetheria] [--exclude Test,Other]
 *       [--reset-passwords]
 *
 * --target picks the env file (.env.local or .env.neon); nothing runs without it.
 * Idempotent. Existing accounts keep their password (and their sessions) unless
 * --reset-passwords is passed. Characters are matched by their Foundry actor id,
 * so a re-import updates the sheet instead of adding a second one.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { sql } from "drizzle-orm";
import { connectScriptDb } from "./lib/script-db";
import { characters, entries, entryGrants, users } from "../src/db/schema";
import { hashPassword, passwordProblem } from "../src/lib/password";
import { validateAndDerive, type CharacterInput, type Sheet } from "../src/lib/character/engine";
import { parseCharacterInput } from "../src/lib/character/schema";
import { toCharacterInput, type FoundryActor, type FoundryItem, type FoundryPlayer } from "../src/lib/character/foundry";

const REPO = path.resolve(__dirname, "..");
const PLAYER_ROLE = 1; // Foundry CONST.USER_ROLES.PLAYER

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (n: string) => process.argv.includes(`--${n}`);

const target = arg("target");
const world = arg("world") ?? process.env.FOUNDRY_WORLD_PATH ?? "E:/FoundryVTT/Data/worlds/asetheria";
const exclude = new Set((arg("exclude") ?? "Test").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
const dryRun = flag("dry-run");
const resetPasswords = flag("reset-passwords");

function loadEnv(file: string) {
  const p = path.join(REPO, file);
  if (!fs.existsSync(p)) throw new Error(`${file} not found`);
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    // The env file wins over the shell for the database, so --target is never silently overridden.
    if (m && (m[1] === "DATABASE_URL" || process.env[m[1]] === undefined)) process.env[m[1]] = m[2].replace(/^["'](.*)["']$/s, "$1");
  }
}

type Doc = Record<string, unknown> & { _id: string; name: string };

/** Reads one of the world's LevelDB stores from a temporary copy (Foundry may hold the lock). */
async function readStore(name: string): Promise<[string, Doc][]> {
  const src = path.join(world, "data", name);
  if (!fs.existsSync(src)) throw new Error(`No "${name}" store in ${world}`);
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), `foundry-${name}-`));
  try {
    fs.cpSync(src, copy, { recursive: true });
    fs.rmSync(path.join(copy, "LOCK"), { force: true });
    const db = new ClassicLevel<string, Doc>(copy, { valueEncoding: "json" });
    await db.open();
    const rows: [string, Doc][] = [];
    for await (const [k, v] of db.iterator()) rows.push([k, v]);
    await db.close();
    return rows;
  } finally {
    fs.rmSync(copy, { recursive: true, force: true });
  }
}

/** Each Foundry player with the character Foundry assigns them. */
async function readPlayers(): Promise<FoundryPlayer[]> {
  const [userRows, actorRows] = await Promise.all([readStore("users"), readStore("actors")]);
  const items = new Map<string, FoundryItem[]>();
  const effects = new Map<string, Record<string, unknown>[]>();
  const actors = new Map<string, Doc>();
  for (const [k, v] of actorRows) {
    if (k.startsWith("!actors!")) actors.set(v._id, v);
    const item = k.match(/^!actors\.items!(\w+)\.(\w+)$/);
    if (item) items.set(item[1], [...(items.get(item[1]) ?? []), v as unknown as FoundryItem]);
    const effect = k.match(/^!actors\.items\.effects!(\w+)\.(\w+)\.\w+$/);
    if (effect) effects.set(`${effect[1]}.${effect[2]}`, [...(effects.get(`${effect[1]}.${effect[2]}`) ?? []), v]);
  }
  const players: FoundryPlayer[] = [];
  for (const [, u] of userRows) {
    if (u.role !== PLAYER_ROLE || typeof u.character !== "string" || exclude.has(u.name.toLowerCase())) continue;
    const actor = actors.get(u.character);
    if (!actor) throw new Error(`Foundry user "${u.name}" points at a character that does not exist`);
    const own = (items.get(actor._id) ?? []).map((i) => ({ ...i, effects: effects.get(`${actor._id}.${i._id}`) ?? [] }));
    players.push({ username: u.name, actor: { ...(actor as unknown as FoundryActor), items: own } });
  }
  return players.sort((a, b) => a.username.localeCompare(b.username));
}

type Built = { player: FoundryPlayer; input: CharacterInput; sheet: Sheet };

function build(players: FoundryPlayer[]): Built[] {
  const syncedAt = new Date().toISOString();
  return players.map((player) => {
    const input = toCharacterInput(player, syncedAt);
    // The same shape check the API runs, then the engine: the import obeys the app's own contract.
    const parsed = parseCharacterInput(input);
    if (!parsed.ok) throw new Error(`${input.name}: ${parsed.problems.join("; ")}`);
    const result = validateAndDerive(parsed.value);
    if (!result.ok || !result.sheet) throw new Error(`${input.name}: ${result.problems.join(" ")}`);
    return { player, input: parsed.value, sheet: result.sheet };
  });
}

function report(built: Built[]) {
  for (const { player, sheet } of built) {
    const s = sheet.scores;
    const skills = sheet.skills.filter((k) => k.proficient).map((k) => k.name).join(", ");
    console.log(`  ${player.username.padEnd(9)} ${sheet.name}: ${sheet.heritage} ${sheet.className} ${sheet.level}, AC ${sheet.armorClass}, ${sheet.hitPoints} HP, ${sheet.size}, speed ${sheet.speed}`);
    console.log(`  ${"".padEnd(9)} STR ${s.str} DEX ${s.dex} CON ${s.con} INT ${s.int} WIS ${s.wis} CHA ${s.cha} | ${skills}`);
  }
}

async function main() {
  if (target !== "local" && target !== "neon") throw new Error("Pass --target local or --target neon.");
  loadEnv(target === "neon" ? ".env.neon" : ".env.local");
  const dmUser = process.env.DM_USERNAME;
  const dmPass = process.env.DM_PASSWORD;
  const playerPass = process.env.PLAYER_PASSWORD;
  if (!dmUser || !dmPass || !playerPass) throw new Error("Set DM_USERNAME, DM_PASSWORD and PLAYER_PASSWORD.");
  for (const pw of [dmPass, playerPass]) {
    const problem = passwordProblem(pw);
    if (problem) throw new Error(problem);
  }

  const players = await readPlayers();
  if (players.length === 0) throw new Error("No Foundry players with a character were found.");
  const built = build(players);
  console.log(`\n  ${built.length} Foundry players (target: ${target})\n`);
  report(built);
  if (dryRun) return console.log("\n  Dry run: nothing written.\n");

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const db = connectScriptDb(url);

  async function upsertUser(username: string, password: string, role: "dm" | "player", displayName: string | null) {
    const [existing] = await db.select({ id: users.id, displayName: users.displayName }).from(users).where(sql`lower(${users.username}) = lower(${username})`).limit(1);
    if (!existing) {
      const [row] = await db.insert(users).values({ username, passwordHash: await hashPassword(password), role, displayName }).returning({ id: users.id });
      return { id: row.id, state: "created" };
    }
    const patch: Partial<typeof users.$inferInsert> = { role, displayName: existing.displayName ?? displayName };
    if (resetPasswords) Object.assign(patch, { passwordHash: await hashPassword(password), sessionEpoch: sql`${users.sessionEpoch} + 1` });
    await db.update(users).set(patch).where(sql`id = ${existing.id}`);
    return { id: existing.id, state: resetPasswords ? "password reset" : "kept" };
  }

  const dm = await upsertUser(dmUser, dmPass, "dm", null);
  console.log(`\n  DM "${dmUser}": ${dm.state}`);

  const majorCities = await db.select({ id: entries.id }).from(entries).where(sql`'major-city' = ANY(${entries.tags}) AND ${entries.archivedAt} IS NULL`);

  for (const { player, input, sheet } of built) {
    const account = await upsertUser(player.username, playerPass, "player", player.username);
    // The defaults /onboarding grants (empires + major cities); onboarding is skipped because the display name is set.
    await db.insert(entryGrants).values({ userId: account.id, kind: "empire", granted: true }).onConflictDoNothing();
    for (const c of majorCities) await db.insert(entryGrants).values({ userId: account.id, entryId: c.id, granted: true }).onConflictDoNothing();

    // Match by Foundry actor id; fall back to the name for sheets saved before ids were recorded.
    const [have] = await db
      .select({ id: characters.id })
      .from(characters)
      .where(sql`${characters.userId} = ${account.id} AND (${characters.input}->'imported'->>'sourceId' = ${player.actor._id} OR ${characters.name} = ${sheet.name})`)
      .orderBy(sql`(${characters.input}->'imported'->>'sourceId' = ${player.actor._id}) DESC NULLS LAST`)
      .limit(1);
    const values = { name: sheet.name, input, sheet, schemaVersion: input.schemaVersion, archivedAt: null, updatedAt: new Date() };
    if (have) await db.update(characters).set(values).where(sql`id = ${have.id}`);
    else await db.insert(characters).values({ userId: account.id, ...values, shared: true });
    console.log(`  player "${player.username}" (${account.state}): "${sheet.name}" ${have ? "updated" : "created"}`);
  }
  console.log("");
}

main().catch((e) => {
  console.error(`\n  ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
