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
}
