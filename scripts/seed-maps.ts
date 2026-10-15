/**
 * Registers the maps in public/maps/. Idempotent: a map already registered (by slug or by image) is left
 * alone. Needs scripts/sql/maps.sql applied first.
 *
 *   npx tsx scripts/seed-maps.ts
 *
 * To add a map (for example a city's own map, which a pin on another map can then open): put the image in
 * public/maps/ (PNG or JPEG), run this, and it is registered with its real pixel size and a name taken from
 * the file name ("port-city.png" becomes "Port City"). Rename it afterwards in the database if you like.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { connectScriptDb } from "./lib/script-db";
import { imageSize, slugFromFile, titleFromFile } from "./lib/image-size";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");
const MAPS_DIR = path.join(REPO, "public", "maps");

for (const file of [".env.local", ".env"]) {
  const p = path.join(REPO, file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["'](.*)["']$/s, "$1");
  }
}

/** The first map (decision Q12): the work-in-progress continent map, 2250 x 1200. Checked against its file. */
const FIRST = { slug: "wip-map", name: "The Continent (work in progress)", file: "wip-map.png", width: 2250, height: 1200 };

(async () => {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) {
    console.error("\n  DATABASE_URL is not set.\n");
    process.exit(1);
  }
  const db = connectScriptDb(url);

  const known = await db.execute<{ slug: string; image_path: string }>(sql`SELECT slug, image_path FROM maps`);
  const slugs = new Set(known.rows.map((r) => r.slug));
  const images = new Set(known.rows.map((r) => r.image_path));

  const files = fs.existsSync(MAPS_DIR) ? fs.readdirSync(MAPS_DIR).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort() : [];
  let added = 0;
  for (const file of files) {
    const imagePath = `/maps/${file}`;
    const size = imageSize(fs.readFileSync(path.join(MAPS_DIR, file)));
    if (!size) {
      console.error(`  skipped ${file}: not a PNG or JPEG it can read`);
      continue;
    }
    const first = file === FIRST.file;
    if (first && (size.width !== FIRST.width || size.height !== FIRST.height)) {
      throw new Error(`${imagePath} is ${size.width}x${size.height}, expected ${FIRST.width}x${FIRST.height}`);
    }
    const slug = first ? FIRST.slug : slugFromFile(file);
    if (images.has(imagePath) || slugs.has(slug)) {
      console.log(`  map "${slug}" already registered`);
      continue;
    }
    const name = first ? FIRST.name : titleFromFile(file);
    await db.execute(sql`INSERT INTO maps (slug, name, image_path, width, height) VALUES (${slug}, ${name}, ${imagePath}, ${size.width}, ${size.height}) ON CONFLICT (slug) DO NOTHING`);
    slugs.add(slug);
    images.add(imagePath);
    added++;
    console.log(`  map "${slug}" registered (${size.width}x${size.height}) as "${name}"`);
  }
  console.log(added === 0 ? "  nothing new to register" : `  ${added} map${added === 1 ? "" : "s"} registered`);
  process.exit(0);
})();
