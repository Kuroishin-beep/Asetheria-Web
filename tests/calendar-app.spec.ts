import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { Client } from "pg";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { closeDbHelpers, createTestPlayer, deleteTestUser, query } from "./db-helpers";
import { tc } from "./case-id";
import { formatDate, monthGrid, weekdayIndex, type CalendarConfig, type CalendarDate } from "../src/lib/calendar";

/**
 * Phase 15: the Asetheria calendar. The DM defines the months and weekdays (nothing is invented for them),
 * everyone signed in can read it, only the DM can change it, and every date is checked.
 * The names below are labels invented for these tests, not content.
 */

const ROOT = path.join(__dirname, "..");
const PASSWORD = "correct horse battery staple 42";
const users: string[] = [];

const CFG: CalendarConfig = {
  months: [{ name: "Alpha", days: 30 }, { name: "Beta", days: 28 }, { name: "Gamma", days: 31 }],
  weekdays: ["One", "Two", "Three", "Four", "Five"],
  yearLabel: "TT",
  firstWeekday: 2,
};
const START: CalendarDate = { year: 1042, month: 2, day: 9 };

test.use({ storageState: "tests/.auth/dm.json" });

test.beforeEach(async () => {
  await query(`DELETE FROM calendar_config`);
});
test.afterAll(async () => {
  await query(`DELETE FROM calendar_config`);
  for (const id of users) await deleteTestUser(id);
  await closeDbHelpers();
});

const body = (cfg: CalendarConfig = CFG, current: CalendarDate = START) => ({ ...cfg, current });
const put = (request: APIRequestContext, data: unknown) => request.put("/api/calendar", { data });
const seed = async (request: APIRequestContext, cfg = CFG, current = START) => expect((await put(request, body(cfg, current))).status()).toBe(200);

async function player(browser: Browser) {
  const username = `zz-cal-${randomUUID().slice(0, 6)}`;
  const id = await createTestPlayer(username, PASSWORD);
  users.push(id);
  await query(`UPDATE users SET display_name = $2 WHERE id = $1`, [id, `Zz ${username.slice(-4)}`]);
  const context = await browser.newContext();
  const page = await context.newPage();
  const res = await page.request.post("/api/auth/login", { data: { username, password: PASSWORD }, headers: { "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.7.${Math.floor(Math.random() * 250)}` } });
  expect(res.ok()).toBe(true);
  return { context, page };
}

async function open(page: Page, url = "/calendar") {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

test.describe("migration", () => {
  test("[TC-CALP-001] the table holds one row with its checks, and the migration is idempotent", async () => {
    expect((await query<{ t: string }>(`SELECT to_regclass('calendar_config')::text AS t`))[0].t).toBe("calendar_config");
    const insert = (id: number, months: unknown, weekdays: unknown = ["A"]) =>
      query(`INSERT INTO calendar_config (id, months, weekdays, current_year, current_month, current_day) VALUES ($1, $2::jsonb, $3::jsonb, 1, 1, 1)`, [id, JSON.stringify(months), JSON.stringify(weekdays)]);
    await expect(insert(2, [{ name: "A", days: 1 }])).rejects.toThrow(/calendar_config_single_row/);
    await expect(insert(1, [])).rejects.toThrow(/calendar_config_months_array/);
    await expect(insert(1, Array.from({ length: 61 }, (_, i) => ({ name: `M${i}`, days: 1 })))).rejects.toThrow(/calendar_config_months_array/);
    await expect(insert(1, [{ name: "A", days: 1 }], [])).rejects.toThrow(/calendar_config_weekdays_array/);
    await expect(insert(1, "not an array")).rejects.toThrow(/calendar_config_months_array/);
    await insert(1, [{ name: "A", days: 1 }]);
    await expect(insert(1, [{ name: "B", days: 1 }])).rejects.toThrow(/duplicate key/);
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      const sql = fs.readFileSync(path.join(ROOT, "scripts", "sql", "calendar.sql"), "utf8");
      await client.query(sql);
      await client.query(sql);
    } finally {
      await client.end();
    }
  });

  test("[TC-CALP-002] the rollback drops only the calendar table (run inside a transaction that is rolled back)", async () => {
    expect(process.env.DATABASE_URL ?? "").not.toMatch(/neon\.tech|neon\.build/);
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query("BEGIN");
      const entries = Number((await client.query(`SELECT count(*)::int AS n FROM entries`)).rows[0].n);
      await client.query(fs.readFileSync(path.join(ROOT, "scripts", "sql", "calendar-rollback.sql"), "utf8"));
      expect((await client.query(`SELECT to_regclass('calendar_config')::text AS t`)).rows[0].t).toBeNull();
      expect(Number((await client.query(`SELECT count(*)::int AS n FROM entries`)).rows[0].n)).toBe(entries);
      expect((await client.query(`SELECT to_regclass('page_templates')::text AS t`)).rows[0].t).toBe("page_templates");
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
    expect((await query<{ t: string }>(`SELECT to_regclass('calendar_config')::text AS t`))[0].t).toBe("calendar_config");
  });
});

test.describe("before the calendar is set up", () => {
  test("[TC-CALP-003] the DM sees an empty state with a way to set it up, and a player sees that the DM has not; no names are invented", async ({ page, browser }) => {
    await open(page);
    await expect(page.getByText("The calendar has not been set up yet")).toBeVisible();
    await expect(page.getByRole("link", { name: "Set up the calendar" })).toHaveAttribute("href", "/calendar/setup");
    await expect(page.getByTestId("calendar-grid")).toHaveCount(0);
    expect(await query(`SELECT 1 FROM calendar_config`)).toHaveLength(0);

    const { context, page: pp } = await player(browser);
    try {
      await open(pp);
      await expect(pp.getByText("The calendar has not been set up yet")).toBeVisible();
      await expect(pp.getByText(/The DM has not set up the calendar yet/)).toBeVisible();
      await expect(pp.getByRole("link", { name: "Set up the calendar" })).toHaveCount(0);
      expect(await (await pp.request.get("/api/calendar")).json()).toEqual({ calendar: null });
    } finally {
      await context.close();
    }
  });

  test("[TC-CALP-004] the sidebar has a Calendar link for everyone", async ({ page, browser }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Calendar", exact: true }).first()).toBeVisible();
    const { context, page: pp } = await player(browser);
    try {
      await pp.goto("/");
      await expect(pp.getByRole("link", { name: "Calendar", exact: true }).first()).toBeVisible();
    } finally {
      await context.close();
    }
  });
});

test.describe("setting it up (DM)", () => {
  test("[TC-CALP-005] the DM names the months and weekdays, picks the first weekday and today, and the calendar shows exactly that", async ({ page }) => {
    test.slow();
    await open(page, "/calendar/setup");
    await page.locator("#month-name-0").fill("Alpha");
    await page.locator("#month-days-0").fill("30");
    for (const [i, [name, days]] of [["Beta", "28"], ["Gamma", "31"]].entries()) {
      await page.getByTestId("add-month").click();
      await page.locator(`#month-name-${i + 1}`).fill(name);
      await page.locator(`#month-days-${i + 1}`).fill(days);
    }
    await expect(page.getByText("89 days so far")).toBeVisible();
    await page.locator("#weekday-0").fill("One");
    for (const [i, name] of ["Two", "Three", "Four", "Five"].entries()) {
      await page.getByTestId("add-weekday").click();
      await page.locator(`#weekday-${i + 1}`).fill(name);
    }
    await page.locator("#year-label").fill("TT");
    await page.locator("#first-weekday").selectOption("2");
    await page.locator("#current-year").fill("1042");
    await page.locator("#current-month").selectOption("2");
    await page.locator("#current-day").fill("9");
    await page.getByTestId("setup-save").click();
    await page.waitForURL((u) => u.pathname === "/calendar");

    await expect(page.getByTestId("calendar-today")).toContainText(formatDate(CFG, START, { weekday: true }));
    await expect(page.getByTestId("calendar-heading")).toHaveText("Beta, 1042 TT");
    const [row] = await query<{ months: unknown; weekdays: unknown; year_label: string; first_weekday: number; current_year: number; current_month: number; current_day: number }>(`SELECT * FROM calendar_config`);
    expect(row.months).toEqual(CFG.months);
    expect(row.weekdays).toEqual(CFG.weekdays);
    expect([row.year_label, row.first_weekday, row.current_year, row.current_month, row.current_day]).toEqual(["TT", 2, 1042, 2, 9]);
  });

  test("[TC-CALP-006] a setup with blank or repeated names, no days, or a date that does not exist is refused with every reason, and nothing is saved", async ({ page }) => {
    await open(page, "/calendar/setup");
    await page.locator("#month-days-0").fill("0");
    await page.getByTestId("add-month").click();
    await page.locator("#month-name-1").fill("Same");
    await page.locator("#month-days-1").fill("10");
    await page.getByTestId("add-month").click();
    await page.locator("#month-name-2").fill("same");
    await page.locator("#month-days-2").fill("10");
    await page.getByTestId("setup-save").click();
    const errors = page.getByTestId("setup-errors");
    await expect(errors).toContainText("Month 1 needs a name");
    await expect(errors).toContainText("Month 1 must have from 1 to 400 days");
    await expect(errors).toContainText('Two months are called "same"');
    await expect(errors).toContainText("Weekday 1 needs a name");
    expect(await query(`SELECT 1 FROM calendar_config`)).toHaveLength(0);
  });

  test("[TC-CALP-007] changing the setup so that today no longer exists is refused and the old setup stays", async ({ page }) => {
    test.slow();
    await seed(page.request);
    await open(page, "/calendar/setup");
    await expect(page.locator("#month-name-1")).toHaveValue("Beta");
    await page.locator("#month-days-1").fill("5"); // today is Beta 9
    await page.getByTestId("setup-save").click();
    await expect(page.getByTestId("setup-errors")).toContainText("not a real date");
    const [row] = await query<{ months: { days: number }[] }>(`SELECT months FROM calendar_config`);
    expect(row.months[1].days).toBe(28);
  });

  test("[TC-CALP-008] the setup form starts from the saved calendar, and months and weekdays can be removed but never the last one", async ({ page }) => {
    test.slow();
    await seed(page.request);
    await open(page, "/calendar/setup");
    await expect(page.locator("#month-name-0")).toHaveValue("Alpha");
    await expect(page.locator("#weekday-4")).toHaveValue("Five");
    await page.getByRole("button", { name: "Remove month 3" }).click();
    await expect(page.locator("#month-name-2")).toHaveCount(0);
    await page.getByRole("button", { name: "Remove month 2" }).click();
    await expect(page.getByRole("button", { name: "Remove month 1" })).toBeDisabled();
    await expect(page.getByText("30 days so far")).toBeVisible();
  });
});

test.describe("reading it", () => {
  test("[TC-CALP-009] the month grid shows the month under the right weekdays, with today marked", async ({ page }) => {
    test.slow();
    await seed(page.request);
    await open(page);
    await expect(page.getByTestId("calendar-heading")).toHaveText("Beta, 1042 TT");
    await expect(page.locator("thead th")).toHaveText(CFG.weekdays);
    const cells = page.locator("td[data-day]");
    await expect(cells).toHaveCount(28);
    const grid = monthGrid(CFG, 1042, 2);
    const firstRow = page.locator("tbody tr").first().locator("td");
    for (let i = 0; i < CFG.weekdays.length; i++) {
      const expected = grid.weeks[0][i];
      if (expected === null) await expect(firstRow.nth(i)).toHaveAttribute("aria-hidden", "true");
      else await expect(firstRow.nth(i)).toHaveAttribute("data-day", String(expected));
    }
    expect(grid.leadingBlanks).toBe(weekdayIndex(CFG, { year: 1042, month: 2, day: 1 }));
    await expect(page.locator('td[aria-current="date"]')).toHaveCount(1);
    await expect(page.locator('td[aria-current="date"]')).toHaveAttribute("data-day", "9");
    await expect(page.locator('td[aria-current="date"]')).toContainText("Today");
  });

  test("[TC-CALP-010] next and previous month cross the year edge both ways, and a way back to today's month appears", async ({ page }) => {
    test.slow();
    await seed(page.request, CFG, { year: 7, month: 1, day: 1 });
    await open(page);
    await page.getByRole("link", { name: "Previous month" }).click();
    await expect(page.getByTestId("calendar-heading")).toHaveText("Gamma, 6 TT");
    await expect(page.locator('td[aria-current="date"]')).toHaveCount(0);
    await expect(page).toHaveURL(/y=6&m=3/);
    await page.getByRole("link", { name: "Next month" }).click();
    await expect(page.getByTestId("calendar-heading")).toHaveText("Alpha, 7 TT"); // wait for the first move before the second
    await page.getByRole("link", { name: "Next month" }).click();
    await expect(page.getByTestId("calendar-heading")).toHaveText("Beta, 7 TT");
    await page.getByRole("link", { name: /Back to Alpha, 7 TT/ }).click();
    await expect(page).toHaveURL((u) => u.pathname === "/calendar" && u.search === "");
    await expect(page.locator('td[aria-current="date"]')).toHaveCount(1);
  });

  test("[TC-CALP-011] an address with a nonsense year or month falls back to the current month instead of failing", async ({ page }) => {
    await seed(page.request);
    for (const q of ["y=abc&m=2", "y=1042&m=99", "y=1042&m=0", "y=99999999&m=1", "y=1.5&m=1", "m=2", "y=%27%3B--&m=1", "y=-9999999&m=1"]) {
      const res = await page.goto(`/calendar?${q}`);
      expect(res?.status(), q).toBe(200);
      await expect(page.getByTestId("calendar-heading"), q).toHaveText("Beta, 1042 TT");
    }
  });

  test("[TC-CALP-012] negative and zero years read correctly, with a true minus sign", async ({ page }) => {
    await seed(page.request, CFG, { year: -12, month: 3, day: 31 });
    await open(page);
    await expect(page.getByTestId("calendar-today")).toContainText("Gamma 31, −12 TT");
    await expect(page.getByTestId("calendar-heading")).toHaveText("Gamma, −12 TT");
  });

  test("[TC-CALP-013] the keyboard moves around the month: arrows, Home and End, one tab stop, and Page Up and Page Down change the month", async ({ page }) => {
    test.slow();
    await seed(page.request);
    await open(page);
    await expect(page.locator("td[data-day][tabindex='0']")).toHaveCount(1);
    await expect(page.locator("td[data-day='9']")).toHaveAttribute("tabindex", "0");
    const focused = () => page.evaluate(() => document.activeElement?.getAttribute("data-day"));
    await page.locator("td[data-day='9']").focus();
    await page.keyboard.press("ArrowRight");
    expect(await focused()).toBe("10");
    await page.keyboard.press("ArrowDown");
    expect(await focused()).toBe("15");
    await page.keyboard.press("ArrowLeft");
    expect(await focused()).toBe("14");
    await page.keyboard.press("ArrowUp");
    expect(await focused()).toBe("9");
    const column = (await page.locator("td[data-day='9']").evaluate((el) => (el as HTMLTableCellElement).cellIndex)) as number;
    await page.keyboard.press("Home");
    expect(await focused()).toBe(String(9 - column));
    await page.keyboard.press("End");
    expect(await focused()).toBe(String(9 - column + (CFG.weekdays.length - 1)));
    // The ends of the month hold still.
    await page.locator("td[data-day='1']").focus();
    await page.keyboard.press("ArrowLeft");
    expect(await focused()).toBe("1");
    await page.keyboard.press("ArrowUp");
    expect(await focused()).toBe("1");
    await page.locator("td[data-day='28']").focus();
    await page.keyboard.press("ArrowRight");
    expect(await focused()).toBe("28");
    await page.keyboard.press("ArrowDown");
    expect(await focused()).toBe("28");
    // Only the focused day is a tab stop.
    await expect(page.locator("td[data-day][tabindex='0']")).toHaveCount(1);
    await expect(page.locator("td[data-day='28']")).toHaveAttribute("tabindex", "0");
    await page.keyboard.press("PageDown");
    await expect(page.getByTestId("calendar-heading")).toHaveText("Gamma, 1042 TT");
    await page.locator("td[data-day='5']").focus();
    await page.keyboard.press("PageUp");
    await expect(page.getByTestId("calendar-heading")).toHaveText("Beta, 1042 TT");
  });
});

test.describe("moving the date (DM)", () => {
  const today = (d: CalendarDate) => formatDate(CFG, d, { weekday: true });

  test("[TC-CALP-014] a day on, a day back, and a week on change today, across the end of a month", async ({ page }) => {
    test.slow();
    await seed(page.request, CFG, { year: 1042, month: 1, day: 30 });
    await open(page);
    await page.getByTestId("day-next").click();
    await expect(page.getByTestId("calendar-today")).toContainText(today({ year: 1042, month: 2, day: 1 }));
    await page.getByTestId("day-back").click();
    await expect(page.getByTestId("calendar-today")).toContainText(today({ year: 1042, month: 1, day: 30 }));
    await page.getByTestId("week-next").click();
    await expect(page.getByTestId("calendar-today")).toContainText(today({ year: 1042, month: 2, day: 5 }));
    expect((await query<{ current_month: number; current_day: number }>(`SELECT current_month, current_day FROM calendar_config`))[0]).toEqual({ current_month: 2, current_day: 5 });
  });

  test("[TC-CALP-015] moving by a typed number of days works forwards and back, across a year", async ({ page }) => {
    test.slow();
    await seed(page.request, CFG, { year: 1042, month: 3, day: 31 });
    await open(page);
    await page.locator("#advance-days").fill("1");
    await page.getByTestId("advance-go").click();
    await expect(page.getByTestId("calendar-today")).toContainText(today({ year: 1043, month: 1, day: 1 }));
    await page.locator("#advance-days").fill("-89");
    await page.getByTestId("advance-go").click();
    await expect(page.getByTestId("calendar-today")).toContainText(today({ year: 1042, month: 1, day: 1 }));
  });

  test("[TC-CALP-016] a typed number that is empty, zero, fractional or not a number is refused in plain words and moves nothing", async ({ page }) => {
    await seed(page.request);
    await open(page);
    for (const v of ["", "0", "1.5", "abc", "1e3"]) {
      await page.locator("#advance-days").fill(v);
      await page.getByTestId("advance-go").click();
      await expect(page.getByTestId("calendar-error"), JSON.stringify(v)).toContainText("whole number of days");
    }
    expect((await query<{ current_day: number }>(`SELECT current_day FROM calendar_config`))[0].current_day).toBe(9);
  });

  test("[TC-CALP-017] the advance API: 3,650 days either way is allowed, 3,651 and zero and fractions are refused, and a bad body is a 400", async ({ request }) => {
    await seed(request, CFG, { year: 100, month: 1, day: 1 });
    const adv = (days: unknown) => request.post("/api/calendar/advance", { data: { days } });
    expect((await adv(3650)).status()).toBe(200);
    expect((await adv(-3650)).status()).toBe(200);
    for (const bad of [3651, -3651, 0, 1.5, 1e9]) expect((await adv(bad)).status(), String(bad)).toBe(400);
    expect((await adv("5")).status()).toBe(400);
    expect((await request.post("/api/calendar/advance", { data: { days: 1, extra: 1 } })).status()).toBe(400);
    expect((await request.post("/api/calendar/advance", { data: {} })).status()).toBe(400);
    expect((await query<{ current_year: number; current_month: number; current_day: number }>(`SELECT current_year, current_month, current_day FROM calendar_config`))[0]).toEqual({ current_year: 100, current_month: 1, current_day: 1 });
  });

  test("[TC-CALP-018] advancing before the calendar exists, or past the last supported year, is refused", async ({ request }) => {
    expect((await request.post("/api/calendar/advance", { data: { days: 1 } })).status()).toBe(400);
    expect((await request.put("/api/calendar/date", { data: { year: 1, month: 1, day: 1 } })).status()).toBe(400);
    await seed(request, CFG, { year: 100000, month: 3, day: 31 });
    const res = await request.post("/api/calendar/advance", { data: { days: 1 } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/past the years/);
  });

  test("[TC-CALP-019] setting the date directly checks it: the last day of a month is fine, one past it, day zero and a missing month are not", async ({ request }) => {
    await seed(request);
    const set = (d: unknown) => request.put("/api/calendar/date", { data: d });
    expect((await set({ year: 5, month: 2, day: 28 })).status()).toBe(200);
    expect((await set({ year: 5, month: 2, day: 29 })).status()).toBe(400);
    expect((await set({ year: 5, month: 2, day: 0 })).status()).toBe(400);
    expect((await set({ year: 5, month: 4, day: 1 })).status()).toBe(400);
    expect((await set({ year: 5.5, month: 1, day: 1 })).status()).toBe(400);
    expect((await set({ year: 100001, month: 1, day: 1 })).status()).toBe(400);
    expect((await set({ year: 5, month: 1 })).status()).toBe(400);
    expect((await query<{ current_year: number; current_month: number; current_day: number }>(`SELECT current_year, current_month, current_day FROM calendar_config`))[0]).toEqual({ current_year: 5, current_month: 2, current_day: 28 });
  });
});

test.describe("the setup API: what is refused, and the boundaries", () => {
  test("[TC-CALP-020] 60 months, 400 days a month, 30 weekdays and 40-character names are accepted; one more of each is refused with the reason", async ({ request }) => {
    const months = (n: number, days = 1) => Array.from({ length: n }, (_, i) => ({ name: `M${i}`, days }));
    const weekdays = (n: number) => Array.from({ length: n }, (_, i) => `W${i}`);
    const base = { yearLabel: "", firstWeekday: 0, current: { year: 1, month: 1, day: 1 } };
    expect((await put(request, { ...base, months: months(60), weekdays: weekdays(30) })).status()).toBe(200);
    const m61 = await put(request, { ...base, months: months(61), weekdays: weekdays(2) });
    expect(m61.status()).toBe(400);
    expect((await m61.json()).error).toMatch(/at most 60 months/);
    expect((await put(request, { ...base, months: months(1, 400), weekdays: weekdays(1) })).status()).toBe(200);
    expect((await (await put(request, { ...base, months: months(1, 401), weekdays: weekdays(1) })).json()).error).toMatch(/from 1 to 400 days/);
    expect((await (await put(request, { ...base, months: months(1), weekdays: weekdays(31) })).json()).error).toMatch(/at most 30 days/);
    expect((await put(request, { ...base, months: [{ name: "x".repeat(40), days: 5 }], weekdays: weekdays(1) })).status()).toBe(200);
    expect((await (await put(request, { ...base, months: [{ name: "x".repeat(41), days: 5 }], weekdays: weekdays(1) })).json()).error).toMatch(/longer than 40/);
  });

  test("[TC-CALP-021] a date that does not exist, a bad first weekday, a wrong shape and extra keys are refused, and the saved calendar is untouched", async ({ request }) => {
    await seed(request);
    const before = JSON.stringify(await query(`SELECT * FROM calendar_config`));
    const bads: unknown[] = [
      body(CFG, { year: 1, month: 2, day: 29 }),
      body({ ...CFG, firstWeekday: 9 }),
      body({ ...CFG, firstWeekday: -1 }),
      body({ ...CFG, months: [] }),
      { ...body(), extra: true },
      { ...body(), months: [{ name: "A", days: 5, extra: 1 }] },
      { months: "no" },
      {},
      "text",
    ];
    for (const b of bads) expect((await put(request, b)).status(), JSON.stringify(b).slice(0, 60)).toBe(400);
    expect(JSON.stringify(await query(`SELECT * FROM calendar_config`))).toBe(before);
  });

  test("[TC-CALP-022] saving twice keeps a single row, and the second save replaces the first", async ({ request }) => {
    await seed(request);
    await seed(request, { ...CFG, yearLabel: "ZZ" }, START);
    const rows = await query<{ year_label: string }>(`SELECT year_label FROM calendar_config`);
    expect(rows).toEqual([{ year_label: "ZZ" }]);
  });

  test("[TC-CALP-023] whitespace around names is trimmed when saved", async ({ request }) => {
    await expect(async () => {
      expect((await put(request, body({ ...CFG, months: [{ name: "  Alpha  ", days: 30 }, { name: " Beta ", days: 28 }, { name: "Gamma", days: 31 }] }))).status()).toBe(200);
    }).toPass();
    expect((await query<{ months: { name: string }[] }>(`SELECT months FROM calendar_config`))[0].months.map((m) => m.name)).toEqual(["Alpha", "Beta", "Gamma"]);
  });
});

test.describe("who can read and who can change", () => {
  test("[TC-CALP-024] a player reads the calendar and the page, with no controls, no setup link, and no way in to the setup screen or the write API", async ({ request, browser }) => {
    test.slow();
    await seed(request);
    const { context, page } = await player(browser);
    try {
      await open(page);
      await expect(page.getByTestId("calendar-today")).toContainText(formatDate(CFG, START, { weekday: true }));
      await expect(page.getByTestId("calendar-grid")).toBeVisible();
      await expect(page.getByTestId("day-next")).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Calendar setup" })).toHaveCount(0);
      expect((await (await page.request.get("/api/calendar")).json()).calendar.current).toEqual(START);

      await page.goto("/calendar/setup");
      await expect(page).toHaveURL((u) => u.pathname === "/calendar");

      expect((await page.request.put("/api/calendar", { data: body() })).status()).toBe(403);
      expect((await page.request.post("/api/calendar/advance", { data: { days: 1 } })).status()).toBe(403);
      expect((await page.request.put("/api/calendar/date", { data: START })).status()).toBe(403);
      expect((await query<{ current_day: number }>(`SELECT current_day FROM calendar_config`))[0].current_day).toBe(9);
    } finally {
      await context.close();
    }
  });

  test("[TC-CALP-025] signed out: every calendar route is 401", async ({ browser }) => {
    const anon = await browser.newContext({ storageState: undefined });
    try {
      expect((await anon.request.get("/api/calendar")).status()).toBe(401);
      expect((await anon.request.put("/api/calendar", { data: body() })).status()).toBe(401);
      expect((await anon.request.post("/api/calendar/advance", { data: { days: 1 } })).status()).toBe(401);
      expect((await anon.request.put("/api/calendar/date", { data: START })).status()).toBe(401);
      expect(await query(`SELECT 1 FROM calendar_config`)).toHaveLength(0);
    } finally {
      await anon.close();
    }
  });
});

test.describe("accessibility and small screens", () => {
  for (const theme of ["dark", "light"] as const) {
    test(tc("calendar-app.spec.ts", "accessibility and small screens", `the calendar and its setup have no serious axe violations (${theme})`), async ({ page, request }) => {
      test.slow();
      await page.addInitScript((t) => localStorage.setItem("asetheria-theme", t), theme);
      await seed(request);
      for (const url of ["/calendar", "/calendar/setup"]) {
        await open(page, url);
        await page.waitForTimeout(300);
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help} -> ${v.nodes[0]?.target.join(" ")}`);
        expect(serious, url).toEqual([]);
      }
    });
  }

  test("[TC-CALP-028] at 375px neither the calendar nor the setup scrolls the page sideways, even with a 12-day week", async ({ browser, request }) => {
    test.slow();
    const wide: CalendarConfig = { ...CFG, weekdays: Array.from({ length: 12 }, (_, i) => `Weekday ${i + 1}`), firstWeekday: 0 };
    await seed(request, wide, START);
    const context = await browser.newContext({ storageState: "tests/.auth/dm.json", viewport: { width: 375, height: 800 } });
    const page = await context.newPage();
    try {
      for (const url of ["/calendar", "/calendar/setup"]) {
        await open(page, url);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), url).toBeLessThanOrEqual(0);
      }
    } finally {
      await context.close();
    }
  });

  test("[TC-CALP-029] a one-day week and a one-day month still draw a grid", async ({ page, request }) => {
    await seed(request, { months: [{ name: "Solo", days: 1 }], weekdays: ["Only"], yearLabel: "", firstWeekday: 0 }, { year: 3, month: 1, day: 1 });
    await open(page);
    await expect(page.locator("td[data-day]")).toHaveCount(1);
    await expect(page.getByTestId("calendar-today")).toContainText("Only, Solo 1, 3");
  });
});
