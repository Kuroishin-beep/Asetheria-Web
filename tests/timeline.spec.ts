import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { Client } from "pg";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { closeDbHelpers, createTestPlayer, deleteTestUser, query } from "./db-helpers";
import { tc } from "./case-id";
import type { CalendarConfig } from "../src/lib/calendar";

/**
 * Phase 16: the timeline. Events are ordinary pages of a new kind with a date in the world's own calendar,
 * so who may read one is decided by the usual rules; the timeline orders them, groups them by era, filters
 * them, and the calendar shows them on their days. The calendar names are labels invented for these tests.
 */

const ROOT = path.join(__dirname, "..");
const PASSWORD = "correct horse battery staple 42";
const tag = randomUUID().slice(0, 6);
const users: string[] = [];

const CFG: CalendarConfig = {
  months: [{ name: "Alpha", days: 30 }, { name: "Beta", days: 28 }, { name: "Gamma", days: 31 }],
  weekdays: ["One", "Two", "Three", "Four", "Five"],
  yearLabel: "TT",
  firstWeekday: 0,
};

test.use({ storageState: "tests/.auth/dm.json" });

test.beforeEach(async () => {
  await query(`DELETE FROM calendar_config`);
  // Each test starts with none of the events earlier tests made, so orders and counts are its own.
  await query(`DELETE FROM entries WHERE name LIKE 'zz-playwright-ev-%'`);
});
test.afterAll(async () => {
  await query(`DELETE FROM entries WHERE name LIKE 'zz-playwright-ev-%'`);
  await query(`DELETE FROM calendar_config`);
  for (const id of users) await deleteTestUser(id);
  await closeDbHelpers();
});

const name = (label: string) => `zz-playwright-ev-${label}-${tag}`;

async function seedCalendar(request: APIRequestContext, cfg = CFG) {
  const res = await request.put("/api/calendar", { data: { ...cfg, current: { year: 1042, month: 2, day: 9 } } });
  expect(res.status()).toBe(200);
}

type EventSeed = { label: string; year?: number; month?: number; day?: number; endYear?: number; endMonth?: number; endDay?: number; era?: string; tags?: string[]; visibility?: "public" | "secret"; summary?: string; kind?: string };

async function insertEvent(e: EventSeed): Promise<{ id: string; name: string }> {
  const fields: Record<string, string> = {};
  if (e.year !== undefined) Object.assign(fields, { year: String(e.year), month: String(e.month), day: String(e.day) });
  if (e.endYear !== undefined) Object.assign(fields, { endYear: String(e.endYear), endMonth: String(e.endMonth), endDay: String(e.endDay) });
  if (e.era) fields.era = e.era;
  const n = name(e.label);
  const [row] = await query<{ id: string }>(
    `INSERT INTO entries (slug, kind, name, summary, fields, tags, visibility, source_path) VALUES ($1, $2::entry_kind, $3, $4, $5::jsonb, $6::text[], $7::visibility, 'test: timeline') RETURNING id`,
    [n, e.kind ?? "event", n, e.summary ?? "", JSON.stringify(fields), e.tags ?? [], e.visibility ?? "public"],
  );
  return { id: row.id, name: n };
}

async function link(fromId: string, toId: string) {
  await query(`INSERT INTO links (source_id, target_id) VALUES ($1, $2)`, [fromId, toId]);
}

async function reader(browser: Browser, kinds: string[] = ["event", "location"]) {
  const username = `zz-tl-${randomUUID().slice(0, 6)}`;
  const id = await createTestPlayer(username, PASSWORD);
  users.push(id);
  await query(`UPDATE users SET display_name = $2 WHERE id = $1`, [id, `Zz ${username.slice(-4)}`]);
  for (const k of kinds) await query(`INSERT INTO entry_grants (user_id, kind, granted) VALUES ($1, $2::entry_kind, true)`, [id, k]);
  const context = await browser.newContext();
  const page = await context.newPage();
  const res = await page.request.post("/api/auth/login", { data: { username, password: PASSWORD }, headers: { "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.6.${Math.floor(Math.random() * 250)}` } });
  expect(res.ok()).toBe(true);
  return { context, page };
}

const names = (page: Page) => page.getByTestId("timeline-event").locator("p a");
const whens = (page: Page) => page.getByTestId("timeline-when").allTextContents();

async function open(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

async function fillEvent(page: Page, label: string, f: { year?: string; month?: string; day?: string; endYear?: string; endMonth?: string; endDay?: string; era?: string }) {
  await open(page, "/codex/new?kind=event");
  await page.fill("#name", name(label));
  if (f.era !== undefined) await page.fill("#field-era", f.era);
  if (f.year !== undefined) await page.fill("#event-year", f.year);
  if (f.month !== undefined) await page.locator("#event-month").selectOption(f.month);
  if (f.day !== undefined) await page.fill("#event-day", f.day);
  if (f.endYear !== undefined) await page.fill("#event-end-year", f.endYear);
  if (f.endMonth !== undefined) await page.locator("#event-end-month").selectOption(f.endMonth);
  if (f.endDay !== undefined) await page.fill("#event-end-day", f.endDay);
}
const submit = (page: Page) => page.getByRole("button", { name: "Create entry" }).click();

test.describe("the new kind", () => {
  test("[TC-TIME-001] the event kind exists, the migration is idempotent and removes nothing, and the section appears for the DM", async ({ page }) => {
    const kinds = (await query<{ v: string }>(`SELECT unnest(enum_range(NULL::entry_kind))::text AS v`)).map((r) => r.v);
    expect(kinds).toContain("event");
    expect(kinds).toHaveLength(21);
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      const entries = Number((await client.query(`SELECT count(*)::int AS n FROM entries`)).rows[0].n);
      for (const file of ["events.sql", "events.sql", "events-rollback.sql"]) await client.query(fs.readFileSync(path.join(ROOT, "scripts", "sql", file), "utf8"));
      expect(Number((await client.query(`SELECT count(*)::int AS n FROM entries`)).rows[0].n)).toBe(entries);
      expect((await client.query(`SELECT unnest(enum_range(NULL::entry_kind))::text AS v`)).rows.map((r) => r.v)).toContain("event");
    } finally {
      await client.end();
    }
    await page.goto("/codex/chronicle");
    await expect(page.getByRole("heading", { level: 1, name: "Chronicle" })).toBeVisible();
    await page.goto("/");
    await expect(page.getByRole("link", { name: /^Chronicle/ }).first()).toBeVisible();
  });
});

test.describe("writing an event (DM)", () => {
  test("[TC-TIME-002] with no calendar the When section says so and the event is saved undated", async ({ page }) => {
    test.slow();
    await open(page, "/codex/new?kind=event");
    await expect(page.getByTestId("event-no-calendar")).toContainText("only be dated once the calendar is set up");
    await expect(page.getByRole("link", { name: "Set up the calendar" })).toHaveAttribute("href", "/calendar/setup");
    await expect(page.locator("#event-year")).toHaveCount(0);
    await page.fill("#name", name("nocal"));
    await submit(page);
    await page.waitForURL(/\/codex\/entry\/[^/]+$/);
    await expect(page.getByTestId("event-when")).toContainText("Undated");
  });

  test("[TC-TIME-003] a dated event saves, shows its date in the world's calendar on its page, and stores the parts as text", async ({ page, request }) => {
    test.slow();
    await seedCalendar(request);
    await fillEvent(page, "dated", { era: "The Long Dusk", year: "1042", month: "2", day: "9" });
    await submit(page);
    await page.waitForURL(/\/codex\/entry\/[^/]+$/);
    await expect(page.getByTestId("event-when")).toContainText("Beta 9, 1042 TT");
    await expect(page.getByText("The Long Dusk")).toBeVisible();
    const [row] = await query<{ fields: Record<string, string> }>(`SELECT fields FROM entries WHERE name = $1`, [name("dated")]);
    expect(row.fields).toMatchObject({ year: "1042", month: "2", day: "9", era: "The Long Dusk" });
    // The date parts are not listed a second time as loose properties.
    await expect(page.locator("dt", { hasText: /^year$/i })).toHaveCount(0);
  });

  test("[TC-TIME-004] an event with an end date shows its span, and the editor opens with the dates and the month filled in", async ({ page, request }) => {
    test.slow();
    await seedCalendar(request);
    await fillEvent(page, "span", { year: "1042", month: "2", day: "9", endYear: "1042", endMonth: "3", endDay: "3" });
    await submit(page);
    await page.waitForURL(/\/codex\/entry\/[^/]+$/);
    await expect(page.getByTestId("event-when")).toContainText("Beta 9, 1042 TT to Gamma 3, 1042 TT");
    const slug = decodeURIComponent(new URL(page.url()).pathname.split("/").pop() as string);
    await open(page, `/codex/entry/${slug}/edit`);
    await expect(page.locator("#event-year")).toHaveValue("1042");
    await expect(page.locator("#event-month")).toHaveValue("2");
    await expect(page.locator("#event-day")).toHaveValue("9");
    await expect(page.locator("#event-end-month")).toHaveValue("3");
  });

  test("[TC-TIME-005] clearing the date in the editor makes the event undated again", async ({ page, request }) => {
    test.slow();
    await seedCalendar(request);
    await fillEvent(page, "clear", { year: "5", month: "1", day: "1" });
    await submit(page);
    await page.waitForURL(/\/codex\/entry\/[^/]+$/);
    const slug = decodeURIComponent(new URL(page.url()).pathname.split("/").pop() as string);
    await open(page, `/codex/entry/${slug}/edit`);
    await page.fill("#event-year", "");
    await page.locator("#event-month").selectOption("");
    await page.fill("#event-day", "");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.waitForURL((u) => /^\/codex\/entry\/[^/]+$/.test(u.pathname));
    await expect(page.getByTestId("event-when")).toContainText("Undated");
  });

  test("[TC-TIME-006] a part of a date, a day that does not exist, an end before the start and an over-long era are each refused with the reason, and nothing is created", async ({ page, request }) => {
    test.slow();
    await seedCalendar(request);
    const refuse = async (label: string, f: Parameters<typeof fillEvent>[2], message: RegExp) => {
      await fillEvent(page, label, f);
      await submit(page);
      await expect(page.locator('p[role="alert"]')).toContainText(message);
      await expect(page).toHaveURL(/\/codex\/new/);
      expect(await query(`SELECT 1 FROM entries WHERE name = $1`, [name(label)])).toHaveLength(0);
    };
    await refuse("part", { year: "5" }, /needs a year, a month and a day/);
    await refuse("day", { year: "5", month: "2", day: "29" }, /Beta has 28 days/);
    await refuse("end", { year: "5", month: "2", day: "10", endYear: "5", endMonth: "2", endDay: "9" }, /end is before the start/);
    await refuse("era", { era: "e".repeat(81) }, /era name is longer than 80/);
  });

  test("[TC-TIME-007] the limits hold at the boundary: the first and last day of a month, year zero and a negative year, and an 80-character era all save", async ({ page, request }) => {
    test.slow();
    await seedCalendar(request);
    for (const [label, f, when] of [
      ["first", { year: "7", month: "1", day: "1" }, "Alpha 1, 7 TT"],
      ["last", { year: "7", month: "3", day: "31" }, "Gamma 31, 7 TT"],
      ["zero", { year: "0", month: "2", day: "28" }, "Beta 28, 0 TT"],
      ["neg", { year: "-12", month: "1", day: "1" }, "Alpha 1, −12 TT"],
      ["era80", { era: "e".repeat(80) }, "Undated"],
    ] as const) {
      await fillEvent(page, label, f);
      await submit(page);
      await page.waitForURL(/\/codex\/entry\/[^/]+$/);
      await expect(page.getByTestId("event-when"), label).toContainText(when);
    }
  });

  test("[TC-TIME-008] if the calendar is taken away after the form is open, a dated event is refused rather than saved unchecked", async ({ page, request }) => {
    test.slow();
    await seedCalendar(request);
    await fillEvent(page, "late", { year: "5", month: "1", day: "1" });
    await query(`DELETE FROM calendar_config`);
    await submit(page);
    await expect(page.locator('p[role="alert"]')).toContainText(/Set up the calendar/);
    expect(await query(`SELECT 1 FROM entries WHERE name = $1`, [name("late")])).toHaveLength(0);
  });
});

test.describe("the timeline (DM)", () => {
  test("[TC-TIME-009] events are in date order across years including zero and negative years, grouped by era, with undated last", async ({ page, request }) => {
    test.slow();
    await seedCalendar(request);
    await insertEvent({ label: "c-late", year: 300, month: 1, day: 1, era: "Age of Ash" });
    await insertEvent({ label: "a-founding", year: 1, month: 1, day: 1, era: "Age of Dawn" });
    await insertEvent({ label: "b-before", year: -40, month: 2, day: 3, era: "Age of Dawn" });
    await insertEvent({ label: "d-early-ash", year: 250, month: 3, day: 31, era: "Age of Ash" });
    await insertEvent({ label: "e-noera", year: 2, month: 1, day: 1 });
    await insertEvent({ label: "f-undated", era: "Age of Dawn" });
    await open(page, "/timeline");
    const eras = await page.locator("[data-testid=timeline-era] h2").allTextContents();
    expect(eras).toEqual(["Age of Dawn", "Age of Ash", "No era", "Undated"]);
    const order = (await names(page).allTextContents()).filter((n) => n.includes(tag));
    expect(order).toEqual([name("b-before"), name("a-founding"), name("d-early-ash"), name("c-late"), name("e-noera"), name("f-undated")]);
    expect(await whens(page)).toEqual(expect.arrayContaining(["Beta 3, −40 TT", "Alpha 1, 1 TT", "Gamma 31, 250 TT", "Undated"]));
    await expect(page.getByTestId("timeline-count")).toContainText("6 of 6 events");
  });

  test("[TC-TIME-010] a span shows as a range, and a one-day span as a single date", async ({ page, request }) => {
    test.slow();
    await seedCalendar(request);
    await insertEvent({ label: "span", year: 10, month: 1, day: 28, endYear: 10, endMonth: 2, endDay: 3 });
    await insertEvent({ label: "same", year: 11, month: 1, day: 1, endYear: 11, endMonth: 1, endDay: 1 });
    await open(page, "/timeline");
    expect(await whens(page)).toEqual(["Alpha 28, 10 TT to Beta 3, 10 TT", "Alpha 1, 11 TT"]);
  });

  test("[TC-TIME-011] each event links to its own page and names the pages it links to", async ({ page, request }) => {
    test.slow();
    await seedCalendar(request);
    const ev = await insertEvent({ label: "linked", year: 5, month: 1, day: 1 });
    const place = await insertEvent({ label: "place", kind: "location" });
    await link(ev.id, place.id);
    await open(page, "/timeline");
    await expect(page.getByTestId("timeline-linked")).toHaveText([place.name]);
    await page.getByTestId("timeline-event").getByRole("link", { name: ev.name }).click();
    await expect(page).toHaveURL(new RegExp(`/codex/entry/${ev.name}$`));
  });

  test("[TC-TIME-012] the filters narrow by era, tag, kind of linked page and years, and combine; counts say how many remain", async ({ page, request }) => {
    test.slow();
    await seedCalendar(request);
    const a = await insertEvent({ label: "f1", year: 10, month: 1, day: 1, era: "Dawn", tags: [`war-${tag}`] });
    const b = await insertEvent({ label: "f2", year: 20, month: 1, day: 1, era: "Dawn" });
    const c = await insertEvent({ label: "f3", year: 30, month: 1, day: 1, era: "Ash", tags: [`war-${tag}`], endYear: 35, endMonth: 1, endDay: 1 });
    await insertEvent({ label: "f4", era: "Ash" });
    const place = await insertEvent({ label: "fplace", kind: "location" });
    await link(b.id, place.id);
    void a;
    const run = async (q: string) => {
      await open(page, `/timeline?${q}`);
      return (await names(page).allTextContents()).filter((n) => n.includes(tag));
    };
    expect(await run("era=Dawn")).toEqual([a.name, b.name]);
    expect(await run(`tag=war-${tag}`)).toEqual([a.name, c.name]);
    expect(await run("kind=location")).toEqual([b.name]);
    expect(await run("from=15&to=25")).toEqual([b.name]);
    expect(await run("from=34")).toEqual([c.name]); // a span that runs into the range counts
    expect(await run("to=9")).toEqual([]);
    expect(await run(`era=Ash&tag=war-${tag}`)).toEqual([c.name]);
    await open(page, "/timeline?era=Dawn");
    await expect(page.getByTestId("timeline-count")).toContainText("2 of 4 events");
    // The undated event is in no range.
    expect(await run("from=-100000&to=100000")).not.toContain(name("f4"));
  });

  test("[TC-TIME-013] a filter that matches nothing says so and offers the way back; nonsense in the address is ignored", async ({ page, request }) => {
    test.slow();
    await seedCalendar(request);
    await insertEvent({ label: "only", year: 5, month: 1, day: 1 });
    await open(page, "/timeline?era=Nothing");
    await expect(page.getByText("No events match those filters")).toBeVisible();
    await page.getByRole("link", { name: "Clear filters" }).first().click();
    await expect(page.getByTestId("timeline-event")).toHaveCount(1);
    for (const q of ["kind=not-a-kind", "from=abc&to=1e9", "era=%27%3B--", "tag=" + "x".repeat(500), "from=1.5"]) {
      const res = await page.goto(`/timeline?${q}`);
      expect(res?.status(), q).toBe(200);
      await expect(page.getByRole("heading", { level: 1, name: "Timeline" })).toBeVisible();
    }
  });

  test("[TC-TIME-014] with no events the DM sees a way to add the first, and with events but no calendar is told to set one up", async ({ page }) => {
    await open(page, "/timeline");
    await expect(page.getByText("No events yet")).toBeVisible();
    await expect(page.getByRole("link", { name: "New event" }).first()).toHaveAttribute("href", "/codex/new?kind=event");
    await insertEvent({ label: "nocal-tl", year: 5, month: 1, day: 1 });
    await open(page, "/timeline");
    await expect(page.getByText("Events can only be put in order once the calendar is set up")).toBeVisible();
  });
});

test.describe("who sees which event", () => {
  test("[TC-TIME-015] a player sees only the events they may read, never a secret one or its name, and no page a linked event points to that they cannot read", async ({ page, request, browser }) => {
    test.slow();
    await seedCalendar(request);
    const open1 = await insertEvent({ label: "open", year: 5, month: 1, day: 1, era: "Dawn" });
    const secret = await insertEvent({ label: "hidden", year: 6, month: 1, day: 1, era: "Dawn", visibility: "secret", summary: `canary-${tag}` });
    const visiblePlace = await insertEvent({ label: "pub-place", kind: "location" });
    const secretPlace = await insertEvent({ label: "sec-place", kind: "location", visibility: "secret" });
    await link(open1.id, visiblePlace.id);
    await link(open1.id, secretPlace.id);
    const { context, page: pp } = await reader(browser);
    try {
      await open(pp, "/timeline");
      const html = await pp.content();
      expect(html).not.toContain(secret.name);
      expect(html).not.toContain(`canary-${tag}`);
      expect(html).not.toContain(secretPlace.name);
      await expect(names(pp).filter({ hasText: open1.name })).toHaveCount(1);
      await expect(pp.getByTestId("timeline-linked")).toHaveText([visiblePlace.name]);
      await expect(pp.getByTestId("timeline-count")).not.toContainText("of 2");
      await expect(pp.getByRole("link", { name: "New event" })).toHaveCount(0);
      expect(await (await pp.request.get(`/api/find?q=${encodeURIComponent(secret.name)}`)).text()).not.toContain(secret.name);
      expect((await pp.goto(`/codex/entry/${secret.name}`))?.status()).toBe(404);
    } finally {
      await context.close();
    }
    // The DM sees both, and the linked secret page.
    await open(page, "/timeline");
    await expect(names(page).filter({ hasText: secret.name })).toHaveCount(1);
    await expect(page.getByTestId("timeline-linked").filter({ hasText: secretPlace.name })).toHaveCount(1);
  });

  test("[TC-TIME-016] a player with no grant on events sees an empty timeline that gives away nothing: no names, no counts", async ({ request, browser }) => {
    test.slow();
    await seedCalendar(request);
    const ev = await insertEvent({ label: "ungranted", year: 5, month: 1, day: 1, summary: `canary2-${tag}` });
    const { context, page } = await reader(browser, []);
    try {
      await open(page, "/timeline");
      await expect(page.getByText("No events yet")).toBeVisible();
      await expect(page.getByText("Nothing has been revealed to you on the timeline yet.")).toBeVisible();
      const html = await page.content();
      expect(html).not.toContain(ev.name);
      expect(html).not.toContain(`canary2-${tag}`);
      await expect(page.getByTestId("timeline-count")).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("[TC-TIME-017] granting events to a player reveals public ones at once", async ({ request, browser }) => {
    test.slow();
    await seedCalendar(request);
    const ev = await insertEvent({ label: "grant", year: 5, month: 1, day: 1 });
    const { context, page } = await reader(browser, []);
    try {
      await open(page, "/timeline");
      await expect(page.getByTestId("timeline-event")).toHaveCount(0);
      const [u] = await query<{ id: string }>(`SELECT id FROM users WHERE id = ANY($1::uuid[]) ORDER BY created_at DESC LIMIT 1`, [users]);
      await query(`INSERT INTO entry_grants (user_id, kind, granted) VALUES ($1, 'event', true)`, [u.id]);
      await open(page, "/timeline");
      await expect(names(page)).toHaveText([ev.name]);
    } finally {
      await context.close();
    }
  });
});

test.describe("on the calendar", () => {
  test("[TC-TIME-018] an event shows on its day, a span on every day it covers, and the month lists each event once with its date", async ({ page, request }) => {
    test.slow();
    await seedCalendar(request);
    await insertEvent({ label: "cal-one", year: 1042, month: 2, day: 9 });
    await insertEvent({ label: "cal-span", year: 1042, month: 1, day: 29, endYear: 1042, endMonth: 2, endDay: 2 });
    await open(page, "/calendar");
    await expect(page.locator("td[data-day='9']")).toContainText(name("cal-one"));
    for (const d of [1, 2]) await expect(page.locator(`td[data-day='${d}']`)).toContainText(name("cal-span"));
    await expect(page.locator("td[data-day='3']")).not.toContainText(name("cal-span"));
    await expect(page.locator("td[data-day='9']")).toHaveAttribute("aria-label", new RegExp(`Day 9, today, 1 event: ${name("cal-one")}`));
    const list = page.getByTestId("month-events").locator("li");
    await expect(list).toHaveCount(2);
    await expect(list.filter({ hasText: name("cal-span") })).toContainText("Alpha 29, 1042 TT to Beta 2, 1042 TT");
    await page.getByTestId("month-events").getByRole("link", { name: name("cal-one") }).click();
    await expect(page).toHaveURL(new RegExp(`/codex/entry/${name("cal-one")}$`));
  });

  test("[TC-TIME-019] more than two events on one day shows two and a count; a month with none shows no list", async ({ page, request }) => {
    test.slow();
    await seedCalendar(request);
    for (const l of ["m1", "m2", "m3", "m4"]) await insertEvent({ label: `crowd-${l}`, year: 1042, month: 2, day: 20 });
    await open(page, "/calendar");
    await expect(page.locator("td[data-day='20'] [data-testid=calendar-event]")).toHaveCount(2);
    await expect(page.locator("td[data-day='20']")).toContainText("+2 more");
    await expect(page.locator("td[data-day='20']")).toHaveAttribute("aria-label", /4 events/);
    await open(page, "/calendar?y=1042&m=3");
    await expect(page.getByTestId("month-events")).toHaveCount(0);
  });

  test("[TC-TIME-020] a player sees on the calendar only the events they may read", async ({ page, request, browser }) => {
    test.slow();
    await seedCalendar(request);
    const open1 = await insertEvent({ label: "pc-open", year: 1042, month: 2, day: 9 });
    const secret = await insertEvent({ label: "pc-secret", year: 1042, month: 2, day: 9, visibility: "secret" });
    const { context, page: pp } = await reader(browser);
    try {
      await open(pp, "/calendar");
      const html = await pp.content();
      expect(html).toContain(open1.name);
      expect(html).not.toContain(secret.name);
      await expect(pp.locator("td[data-day='9']")).toHaveAttribute("aria-label", /1 event:/);
    } finally {
      await context.close();
    }
    await open(page, "/calendar");
    await expect(page.locator("td[data-day='9']")).toHaveAttribute("aria-label", /2 events/);
  });
});

test.describe("accessibility and small screens", () => {
  for (const theme of ["dark", "light"] as const) {
    test(tc("timeline.spec.ts", "accessibility and small screens", `the timeline, an event and the event editor have no serious axe violations (${theme})`), async ({ page, request }) => {
      test.slow();
      await page.addInitScript((t) => localStorage.setItem("asetheria-theme", t), theme);
      await seedCalendar(request);
      const ev = await insertEvent({ label: `ax-${theme}`, year: 5, month: 1, day: 1, era: "Dawn", tags: ["a-tag"], summary: "A summary." });
      const place = await insertEvent({ label: `axp-${theme}`, kind: "location" });
      await link(ev.id, place.id);
      for (const url of ["/timeline", `/codex/entry/${ev.name}`, "/codex/new?kind=event", "/calendar"]) {
        await open(page, url);
        await page.waitForTimeout(300);
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help} -> ${v.nodes[0]?.target.join(" ")}`);
        expect(serious, url).toEqual([]);
      }
    });
  }

  test("[TC-TIME-023] at 375px the timeline, the event editor and the calendar do not scroll the page sideways", async ({ browser, request }) => {
    test.slow();
    await seedCalendar(request);
    await insertEvent({ label: "small", year: 5, month: 1, day: 1, era: "Dawn", summary: "x ".repeat(80) });
    const context = await browser.newContext({ storageState: "tests/.auth/dm.json", viewport: { width: 375, height: 800 } });
    const page = await context.newPage();
    try {
      for (const url of ["/timeline", "/codex/new?kind=event", "/calendar?y=5&m=1"]) {
        await open(page, url);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), url).toBeLessThanOrEqual(0);
      }
    } finally {
      await context.close();
    }
  });

  test("[TC-TIME-024] every filter on the timeline has a visible label and the form can be used by keyboard alone", async ({ page, request }) => {
    test.slow();
    await seedCalendar(request);
    await insertEvent({ label: "kbd", year: 5, month: 1, day: 1, era: "Dawn" });
    await open(page, "/timeline");
    for (const label of ["Era", "Tag", "Involves", "From year", "To year"]) await expect(page.getByLabel(label)).toBeVisible();
    await page.getByLabel("From year").focus();
    await page.keyboard.type("1");
    await page.keyboard.press("Tab");
    await page.keyboard.type("10");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/from=1&to=10/);
    await expect(page.getByTestId("timeline-event")).toHaveCount(1);
  });
});
