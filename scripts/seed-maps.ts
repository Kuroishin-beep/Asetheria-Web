/**
 * Registers the maps shipped in public/maps/. Idempotent: an existing slug is
 * left alone. Needs scripts/sql/maps.sql applied first.
 *
 *   npx tsx scripts/seed-maps.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { connectScriptDb } from "./lib/script-db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");

for (const file of [".env.local", ".env"]) {
  const p = path.join(REPO, file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["'](.*)["']$/s, "$1");
  }
}

/** The first map (decision Q12): the work-in-progress continent map, 2250 x 1200. */
const MAPS = [
  { slug: "wip-map", name: "The Continent (work in progress)", imagePath: "/maps/wip-map.png", width: 2250, height: 1200 },
];

/** A PNG's pixel size, read from its header, so the registered size can never disagree with the file. */
function pngSize(file: string): { width: number; height: number } {
  const buf = fs.readFileSync(file);
  if (buf.toString("ascii", 1, 4) !== "PNG") throw new Error(`${file} is not a PNG`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

(async () => {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) {
    console.error("\n  DATABASE_URL is not set.\n");
    process.exit(1);
  }
  const db = connectScriptDb(url);
  for (const m of MAPS) {
    const size = pngSize(path.join(REPO, "public", m.imagePath));
    if (size.width !== m.width || size.height !== m.height) {
      throw new Error(`${m.imagePath} is ${size.width}x${size.height}, expected ${m.width}x${m.height}`);
    }
    await db.execute(
      sql`INSERT INTO maps (slug, name, image_path, width, height) VALUES (${m.slug}, ${m.name}, ${m.imagePath}, ${m.width}, ${m.height}) ON CONFLICT (slug) DO NOTHING`,
    );
    console.log(`  map "${m.slug}" ready (${m.width}x${m.height})`);
  }
  process.exit(0);
})();
