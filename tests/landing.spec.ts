import fs from "node:fs";
import { tc } from "./case-id";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { closeDbHelpers, query } from "./db-helpers";

/**
 * Phase 9: the public landing page. It must be a cinematic front door that is
 * also quiet when asked (reduced motion), fast under load, borrowed from no one,
 * and, being public, must show a stranger nothing from the codex.
 */

const ROOT = path.join(__dirname, "..");

/** Protected titles and names: none may appear in the page's text, alt text or art source. */
const PROTECTED = [
  "tolkien", "hobbit", "middle-earth", "middle earth", "mordor", "gandalf", "frodo", "bilbo", "baggins", "rivendell", "gondor", "shire", "lothlorien", "rohan", "sauron", "gollum",
  "percy jackson", "riordan", "camp half-blood", "half-blood", "lightning thief", "olympians",
  "hogwarts", "narnia", "westeros", "forgotten realms", "faerun", "waterdeep",
];

test.afterAll(async () => {
  await closeDbHelpers();
});

async function seeLanding(page: Page, url = "/welcome") {
  const res = await page.goto(url);
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "The Continent of Asetheria" })).toBeVisible();
}

test.describe("what a stranger sees", () => {
  test("[TC-LAND-001] /welcome and / (signed out) are the landing: one h1, five scenes, and both calls to action", async ({ page }) => {
    await seeLanding(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    expect(await page.locator("[data-scene]").count()).toBeGreaterThanOrEqual(5);
    for (const scene of ["road", "hearth", "seagate", "empires", "map"]) await expect(page.locator(`[data-scene="${scene}"]`)).toHaveCount(1);
    await expect(page.getByTestId("cta-enter")).toBeVisible();
    await expect(page.getByTestId("cta-forge")).toBeVisible();

    await page.goto("/");
    await page.waitForURL(/\/welcome/);
    await expect(page.getByRole("heading", { level: 1, name: "The Continent of Asetheria" })).toBeVisible();
  });

  test("[TC-LAND-002] it reads nothing from the codex: no API calls, and none of the codex's own entry names in the page", async ({ page }) => {
    const api: string[] = [];
    page.on("request", (r) => {
      const p = new URL(r.url()).pathname;
      if (p.startsWith("/api/")) api.push(p);
    });
    await seeLanding(page);
    await page.waitForTimeout(800);
    expect(api).toEqual([]);
    const html = (await page.content()).toLowerCase();
    const names = await query<{ name: string }>(
      `SELECT name FROM entries WHERE archived_at IS NULL AND kind IN ('deity','npc','location','organization','quest','faction') AND length(name) > 7 AND name NOT IN ('Imperium Invicta','Hellenoria','Acheaoria') ORDER BY random() LIMIT 80`, // the three empires are named on the page on purpose, as constants
    );
    for (const { name } of names) expect(html.includes(name.toLowerCase()), `leaked: ${name}`).toBe(false);
  });

  test("[TC-LAND-003] a signed-in visitor is sent on to the codex, not shown the landing", async ({ browser }) => {
    const context = await browser.newContext({ storageState: "tests/.auth/dm.json" });
    const page = await context.newPage();
    try {
      await page.goto("/welcome");
      await expect(page).toHaveURL((u) => u.pathname === "/");
    } finally {
      await context.close();
    }
  });
});

test.describe("calls to action", () => {
  test("[TC-LAND-004] Forge a hero opens the public creator without signing in", async ({ page }) => {
    await seeLanding(page);
    await page.getByTestId("cta-forge").click();
    await expect(page).toHaveURL(/\/create-character$/);
    await expect(page.getByRole("heading", { level: 1, name: "Forge a hero" })).toBeVisible();
  });

  test("[TC-LAND-005] Enter the codex goes to the door, where both ways in are still offered", async ({ page }) => {
    await seeLanding(page);
    await page.getByTestId("cta-enter").click();
    await expect(page).toHaveURL(/#door$/);
    await expect(page.getByRole("button", { name: "Enter as a player" })).toBeVisible();
    await expect(page.getByLabel("Party password")).toBeVisible();
    await expect(page.getByRole("link", { name: /sign in/i }).first()).toHaveAttribute("href", "/login");
  });

  test("[TC-LAND-006] the door keeps the next path through the landing", async ({ page }) => {
    await seeLanding(page, "/welcome?next=%2Fsearch");
    await expect(page.getByRole("link", { name: /sign in/i }).first()).toHaveAttribute("href", "/login?next=%2Fsearch");
  });

  test("[TC-LAND-007] keyboard only: the skip link and both calls to action are reachable in order", async ({ page }) => {
    await seeLanding(page);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to the door" })).toBeFocused();
    await expect(page.getByRole("link", { name: "Skip to the door" })).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("cta-enter")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("cta-forge")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/create-character$/);
  });

  test("[TC-LAND-008] the skip link lands on the door", async ({ page }) => {
    await seeLanding(page);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#door$/);
  });
});

/** The numbers an element is drawn with right now, for telling whether anything moves. */
async function pose(page: Page, selector: string, count = 6) {
  return page.locator(selector).evaluateAll(
    (els, n) => els.slice(0, n).map((e) => `${getComputedStyle(e).transform}|${getComputedStyle(e).opacity}`).join(";"),
    count,
  );
}

test.describe("motion", () => {
  test("[TC-LAND-009] by default the scenes move once on screen: the fireflies drift", async ({ page }) => {
    await seeLanding(page);
    await page.locator('[data-scene="hearth"]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1200);
    const a = await pose(page, '[data-scene="hearth"] g, [data-scene="hearth"] circle.fill-primary', 30);
    await page.waitForTimeout(1800);
    const b = await pose(page, '[data-scene="hearth"] g, [data-scene="hearth"] circle.fill-primary', 30);
    expect(a).not.toBe(b);
  });

  test("[TC-LAND-010] a scene that is off screen is not animating (nothing runs where nobody is looking)", async ({ page }) => {
    await seeLanding(page);
    await page.waitForTimeout(1200);
    const before = await pose(page, '[data-scene="seagate"] g', 30);
    await page.waitForTimeout(2000);
    const after = await pose(page, '[data-scene="seagate"] g', 30);
    expect(after).toBe(before);
  });

  test("[TC-LAND-011] with reduced motion nothing animates, no parallax follows the scroll, and every word and button is still there", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await seeLanding(page);
    await page.locator('[data-scene="hearth"]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1200);
    const a = await pose(page, '[data-scene="hearth"] g, [data-scene="hearth"] circle.fill-primary', 40);
    const layersA = await pose(page, '[data-scene="road"] g', 4);
    await page.waitForTimeout(2000);
    expect(await pose(page, '[data-scene="hearth"] g, [data-scene="hearth"] circle.fill-primary', 40)).toBe(a);

    await page.evaluate(() => window.scrollTo(0, 0));
    const top = await pose(page, '[data-scene="road"] g', 4);
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(500);
    expect(await pose(page, '[data-scene="road"] g', 4)).toBe(top);
    void layersA;

    const running = await page.evaluate(() => document.getAnimations().filter((x) => x.playState === "running" && (x.effect?.getTiming().iterations ?? 1) === Infinity).length);
    expect(running).toBe(0);
    for (const text of ["Every road starts somewhere", "Somewhere warm to come back to", "The sea has opinions", "Three empires, one continent", "Your road is not drawn yet", "The door is open"]) {
      await expect(page.getByRole("heading", { name: text })).toBeVisible();
    }
    await expect(page.getByTestId("cta-forge")).toBeVisible();
    await expect(page.getByTestId("cta-enter")).toBeVisible();
  });

  test("[TC-LAND-012] the parallax follows the scroll when motion is allowed", async ({ page }) => {
    await seeLanding(page);
    await page.waitForTimeout(800);
    const a = await pose(page, '[data-scene="road"] g', 4);
    await page.mouse.wheel(0, 260);
    await page.waitForTimeout(600);
    expect(await pose(page, '[data-scene="road"] g', 4)).not.toBe(a);
  });
});

test.describe("performance budget", () => {
  test("[TC-LAND-013] layout does not jump: cumulative layout shift stays under 0.05 while the whole page is scrolled", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __cls: number };
      w.__cls = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as { hadRecentInput: boolean; value: number }[]) if (!e.hadRecentInput) w.__cls += e.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    await seeLanding(page);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < height; y += 500) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.waitForTimeout(120);
    }
    const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
    test.info().annotations.push({ type: "cumulative layout shift", description: cls.toFixed(4) });
    expect(cls).toBeLessThan(0.05);
  });

  test("[TC-LAND-014] scrolling the whole page under a 4x CPU throttle keeps 90% of frames within 33 ms and never freezes", async ({ page }) => {
    test.setTimeout(120000);
    await seeLanding(page);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1200);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    try {
      await page.evaluate(() => {
        const w = window as unknown as { __frames: number[] };
        w.__frames = [];
        const tick = (t: number) => {
          w.__frames.push(t);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < height; y += 180) {
        await page.evaluate((top) => window.scrollTo(0, top), y);
        await page.waitForTimeout(60);
      }
      const frames = await page.evaluate(() => (window as unknown as { __frames: number[] }).__frames);
      const gaps = frames.slice(1).map((t, i) => t - frames[i]).sort((a, b) => a - b);
      const pct = (p: number) => gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * p))];
      const result = { page: "/welcome", cpuThrottle: "4x", frames: frames.length, medianFrameMs: Number(pct(0.5).toFixed(1)), p90FrameMs: Number(pct(0.9).toFixed(1)), p99FrameMs: Number(pct(0.99).toFixed(1)), worstFrameMs: Number(gaps[gaps.length - 1].toFixed(1)) };
      fs.mkdirSync(path.join(ROOT, "test-results"), { recursive: true });
      fs.writeFileSync(path.join(ROOT, "test-results", "landing-fps.json"), JSON.stringify(result, null, 2));
      test.info().annotations.push({ type: "landing frame times", description: JSON.stringify(result) });
      console.log(`LANDING FPS ${JSON.stringify(result)}`);
      // Frames land on the display's 16.7 ms steps, so two steps is 33.4 plus a float rounding error; compare at the precision that is measured.
      expect(Number(pct(0.9).toFixed(1))).toBeLessThanOrEqual(33.4);
      expect(gaps[gaps.length - 1]).toBeLessThan(1000);
    } finally {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    }
  });

  test("[TC-LAND-015] the art stays small: the landing's source is under 150 KB in total", () => {
    const dir = path.join(ROOT, "src", "components", "landing");
    const bytes = fs.readdirSync(dir).reduce((sum, f) => sum + fs.statSync(path.join(dir, f)).size, 0);
    test.info().annotations.push({ type: "landing source size", description: `${(bytes / 1024).toFixed(1)} KB` });
    expect(bytes).toBeLessThan(150 * 1024);
  });

  test("[TC-LAND-016] it ships no image, video or font files of its own: the art is inline vector", () => {
    const dir = path.join(ROOT, "src", "components", "landing");
    for (const f of fs.readdirSync(dir)) expect(f, f).toMatch(/\.(tsx|ts)$/);
    const source = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
    expect(source).not.toMatch(/\.(png|jpe?g|gif|webp|avif|mp4|webm|woff2?)["'`]/i);
    expect(source).not.toMatch(/<(video|audio|iframe|img)\b/i);
  });
});

test.describe("licence guard: borrowed from no one", () => {
  test("[TC-LAND-017] no protected title or name appears in the rendered text, the alt text, the page title or the art's source", async ({ page }) => {
    await seeLanding(page);
    const rendered = ((await page.content()) + " " + (await page.title())).toLowerCase();
    for (const word of PROTECTED) expect(rendered.includes(word), `page contains "${word}"`).toBe(false);
    const dir = path.join(ROOT, "src", "components", "landing");
    const source = [...fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), "utf8")), fs.readFileSync(path.join(ROOT, "src", "app", "welcome", "page.tsx"), "utf8")].join("\n").toLowerCase();
    for (const word of PROTECTED) expect(source.includes(word), `source contains "${word}"`).toBe(false);
  });

  test("[TC-LAND-018] the guard itself works: a protected word would be caught", () => {
    const sample = "a hobbit-hole near mordor".toLowerCase();
    expect(PROTECTED.filter((w) => sample.includes(w)).sort()).toEqual(["hobbit", "mordor"]);
  });

  test("[TC-LAND-019] the licence ledger records the landing art as original", () => {
    const ledger = fs.readFileSync(path.join(ROOT, "docs", "content-licences.md"), "utf8");
    expect(ledger).toMatch(/landing page/i);
    expect(ledger).toMatch(/original/i);
  });
});

test.describe("accessibility and small screens", () => {
  test("[TC-LAND-020] every scene is decoration: its art is hidden from assistive technology, and the page has the right landmarks", async ({ page }) => {
    await seeLanding(page);
    const scenes = page.locator("[data-scene] svg");
    const n = await scenes.count();
    expect(n).toBeGreaterThanOrEqual(5);
    for (let i = 0; i < n; i++) expect(await scenes.nth(i).getAttribute("aria-hidden"), `svg ${i}`).toBe("true");
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("contentinfo")).toHaveCount(1);
    // Each section is named by its own heading.
    for (const name of ["Every road starts somewhere", "Somewhere warm to come back to", "The sea has opinions", "Three empires, one continent", "Your road is not drawn yet", "The door is open"]) {
      await expect(page.getByRole("region", { name })).toHaveCount(1);
    }
  });

  for (const [label, width, height] of [["phone", 375, 800], ["tablet", 768, 1000], ["desktop", 1280, 900]] as const) {
    test(tc("landing.spec.ts", "accessibility and small screens", `no sideways scroll at ${label} width (${width}px)`), async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height } });
      const page = await context.newPage();
      try {
        await seeLanding(page);
        await page.evaluate(async () => {
          for (let y = 0; y < document.documentElement.scrollHeight; y += 400) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 40));
          }
        });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);
      } finally {
        await context.close();
      }
    });
  }
});
