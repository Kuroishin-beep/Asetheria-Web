import fs from "node:fs";
import path from "node:path";

/**
 * Minimal .env.local loader for the Playwright process (Next's own dotenv
 * loading only applies inside the `next dev` process, not this one).
 * Mirrors the loader in scripts/create-user.ts.
 */
export function loadEnv() {
  const repoRoot = path.resolve(__dirname, "..");
  for (const file of [".env.local", ".env"]) {
    const p = path.join(repoRoot, file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["'](.*)["']$/s, "$1");
      }
    }
  }
  assertNotProduction();
}

/**
 * The suite creates and deletes users, entries and secrets. It must only ever
 * run against the disposable local Postgres, never the Neon production
 * database, so a Neon URL stops the run before anything connects.
 * Set ALLOW_NEON=1 only if you truly mean it (you almost certainly do not).
 */
export function assertNotProduction() {
  const url = process.env.DATABASE_URL ?? "";
  if (/neon\.(tech|build)/i.test(url) && process.env.ALLOW_NEON !== "1") {
    throw new Error("Refusing to run tests: DATABASE_URL points at Neon (production). Point it at the local test Postgres instead.");
  }
}
