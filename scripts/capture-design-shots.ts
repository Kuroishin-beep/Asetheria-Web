/**
 * Captures the key pages at 375 / 768 / 1280px in both themes, for design
 * review. Used to produce the before/after sets of the design migration.
 *
 *   npx tsx scripts/capture-design-shots.ts before
 *   npx tsx scripts/capture-design-shots.ts after
 *
 * Output: test-results/design/<label>/<page>-<width>-<theme>.png
 * Needs the app running on http://localhost:3000 and the saved sessions in
 * tests/.auth (written by any Playwright run's global setup).
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const label = process.argv[2];
if (!label) {
  console.error("\n  Usage: tsx scripts/capture-design-shots.ts <before|after|label>\n");
  process.exit(1);
}

const OUT = path.resolve(__dirname, "..", "test-results", "design", label);
fs.mkdirSync(OUT, { recursive: true });

const PAGES: { name: string; url: string; auth: "dm" | "player" | null }[] = [
  { name: "welcome", url: "/welcome", auth: null },
  { name: "login", url: "/login", auth: null },
  { name: "home", url: "/", auth: "dm" },
  { name: "kind-list", url: "/codex/npcs", auth: "dm" },
  { name: "entry", url: "/codex/entry/corinth-city", auth: "dm" },
];
const WIDTHS = [375, 768, 1280];
const THEMES = ["dark", "light"] as const;

async function main() {
  const browser = await chromium.launch();
  let count = 0;
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      for (const p of PAGES) {
        const storageState = p.auth
          ? path.resolve(__dirname, "..", "tests", ".auth", `${p.auth}.json`)
          : undefined;
        const context = await browser.newContext({
          viewport: { width, height: width === 375 ? 812 : 900 },
          storageState,
        });
        await context.addInitScript((t) => {
          try {
            localStorage.setItem("asetheria-theme", t);
          } catch {
            /* private mode */
          }
        }, theme);
        const page = await context.newPage();
        await page.goto(`${BASE}${p.url}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(400);
        await page.screenshot({
          path: path.join(OUT, `${p.name}-${width}-${theme}.png`),
          fullPage: false,
        });
        await context.close();
        count++;
      }
    }
  }
  await browser.close();
  console.log(`  ${count} screenshots written to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
