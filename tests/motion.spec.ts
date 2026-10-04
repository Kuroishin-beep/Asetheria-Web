import { expect, test } from "@playwright/test";

/**
 * Motion presets and reduced-motion handling: content must always settle fully
 * visible and in place, and a visitor who asked for less motion must never see
 * it slide.
 */

test.use({ storageState: "tests/.auth/dm.json" });

const PAGE_WRAPPER = "main > div";

test("with prefers-reduced-motion the page content is never visible while offset, and ends fully visible", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce", storageState: "tests/.auth/dm.json" });
  const page = await context.newPage();
  await page.goto("/codex/npcs", { waitUntil: "domcontentloaded" });

  // Before hydration the server HTML carries the initial (hidden, offset) state, but the
  // element is fully transparent then. What matters is that nothing is ever visible
  // while offset: any sample with visible content must already be in place.
  const samples: { opacity: number; transform: string }[] = [];
  for (let i = 0; i < 20; i++) {
    samples.push(
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return { opacity: 0, transform: "missing" };
        const s = getComputedStyle(el);
        return { opacity: Number(s.opacity), transform: s.transform };
      }, PAGE_WRAPPER),
    );
    await page.waitForTimeout(25);
  }
  expect(samples.some((s) => s.opacity > 0.05)).toBe(true);
  expect(samples.filter((s) => s.opacity > 0.05 && s.transform !== "none")).toEqual([]);

  await expect
    .poll(() => page.evaluate((sel) => getComputedStyle(document.querySelector(sel)!).opacity, PAGE_WRAPPER), { timeout: 4000 })
    .toBe("1");
  await context.close();
});

test("with normal motion the page content settles at full opacity, in place", async ({ page }) => {
  await page.goto("/codex/npcs");
  await expect
    .poll(
      () =>
        page.evaluate((sel) => {
          const s = getComputedStyle(document.querySelector(sel)!);
          return `${s.opacity}|${s.transform}`;
        }, PAGE_WRAPPER),
      { timeout: 4000 },
    )
    .toBe("1|none");
});

test("cards in a list finish their staggered entrance (none is left invisible)", async ({ page }) => {
  await page.goto("/codex/npcs");
  await page.waitForTimeout(1500);
  const hidden = await page.evaluate(() =>
    [...document.querySelectorAll('a[href^="/codex/entry/"]')].filter((a) => {
      let el: Element | null = a;
      while (el && el !== document.body) {
        if (getComputedStyle(el).opacity === "0") return true;
        el = el.parentElement;
      }
      return false;
    }).length,
  );
  expect(hidden).toBe(0);
});
