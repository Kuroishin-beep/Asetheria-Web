import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

const ROUTES: [string, string, string | null][] = [
  ["front", "/", "dm"],
  ["list", "/codex/npcs", "dm"],
  ["entry", "/codex/entry/corinth-city", "dm"],
  ["form", "/codex/new?kind=npc", "dm"],
  ["graph", "/graph", "dm"],
  ["player-front", "/", "player"],
];

(async () => {
  const b = await chromium.launch();
  const seen = new Map<string, string>();
  for (const theme of ["dark", "light"]) {
    for (const [name, url, auth] of ROUTES) {
      const ctx = await b.newContext({
        storageState: auth ? `tests/.auth/${auth}.json` : undefined,
        viewport: { width: 1280, height: 900 },
      });
      await ctx.addInitScript((t) => localStorage.setItem("asetheria-theme", t), theme);
      const page = await ctx.newPage();
      await page.goto(`http://localhost:3000${url}`, { waitUntil: "networkidle" });
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      for (const v of r.violations.filter((x) => x.impact === "serious" || x.impact === "critical")) {
        const key = `${v.id}`;
        for (const n of v.nodes.slice(0, 3)) {
          const data = (n.any[0]?.data ?? {}) as Record<string, unknown>;
          const detail = v.id === "color-contrast" ? ` fg=${data.fgColor} bg=${data.bgColor} ratio=${data.contrastRatio} size=${data.fontSize}` : "";
          const k = `${key} | ${theme} ${name} | ${n.target.join(" ").slice(-110)}${detail}`;
          if (!seen.has(k)) seen.set(k, "");
        }
      }
      await ctx.close();
    }
  }
  for (const k of seen.keys()) console.log(k);
  await b.close();
})();
