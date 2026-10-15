import { expect, test } from "@playwright/test";
import { checkJournalEntry, checkWorldPatch, linkWorship, WORLD_LIMITS } from "../src/lib/character/world-core";

/** The rules for linking a character to the world, with no browser and no database. */

const GODS = new Map([
  ["zeus", "/codex/entry/zeus"],
  ["hera", "/codex/entry/hera"],
  ["adamus", "/codex/entry/adamus"],
  ["adamus, the earth keeper", "/codex/entry/adamus-the-earth-keeper"],
  ["anchiale, the flame artisan", "/codex/entry/anchiale"],
]);

const joined = (parts: { text: string }[]) => parts.map((p) => p.text).join("");

test.describe("worship line", () => {
  test("[TC-CWCO-001] a god named in the line becomes a link; the words around it stay plain", () => {
    expect(linkWorship("Zeus", GODS)).toEqual([{ text: "Zeus", href: "/codex/entry/zeus" }]);
    expect(linkWorship("Zeus and Hera", GODS)).toEqual([
      { text: "Zeus", href: "/codex/entry/zeus" },
      { text: " and ", href: null },
      { text: "Hera", href: "/codex/entry/hera" },
    ]);
    expect(linkWorship("I follow zeus, mostly", GODS)).toEqual([
      { text: "I follow ", href: null },
      { text: "zeus", href: "/codex/entry/zeus" },
      { text: ", mostly", href: null },
    ]);
  });

  test("[TC-CWCO-002] a god whose name has a comma is one god, and the longest name wins over a shorter one it starts with", () => {
    expect(linkWorship("Adamus, The Earth Keeper", GODS)).toEqual([{ text: "Adamus, The Earth Keeper", href: "/codex/entry/adamus-the-earth-keeper" }]);
    expect(linkWorship("Adamus", GODS)).toEqual([{ text: "Adamus", href: "/codex/entry/adamus" }]);
    expect(linkWorship("adamus, THE EARTH KEEPER; Hera", GODS)).toEqual([
      { text: "adamus, THE EARTH KEEPER", href: "/codex/entry/adamus-the-earth-keeper" },
      { text: "; ", href: null },
      { text: "Hera", href: "/codex/entry/hera" },
    ]);
  });

  test("[TC-CWCO-003] a name inside a longer word is not a god, and a god the viewer cannot read is plain text", () => {
    expect(linkWorship("Zeusian", GODS)).toEqual([{ text: "Zeusian", href: null }]);
    expect(linkWorship("antiZeus", GODS)).toEqual([{ text: "antiZeus", href: null }]);
    expect(linkWorship("Hecate", GODS)).toEqual([{ text: "Hecate", href: null }]);
    expect(linkWorship("Zeus", new Map())).toEqual([{ text: "Zeus", href: null }]);
  });

  test("[TC-CWCO-004] the pieces always join back into exactly the line, for blank lines, odd spacing and unicode too", () => {
    for (const line of ["", " ", "Zeus", "  Zeus  &  Hera  ", "Zeus,Hera;Zeus", "Ζεύς and Zeus", "zeus\nhera", "Adamus, The Earth Keeper, Hera", "a".repeat(200), "Zeus ".repeat(40)]) {
      expect(joined(linkWorship(line, GODS)), JSON.stringify(line)).toBe(line);
    }
    expect(linkWorship("", GODS)).toEqual([]);
  });

  test("[TC-CWCO-005] a line of 200 characters made only of god names links every one", () => {
    const line = "Zeus, ".repeat(32) + "Hera";
    const parts = linkWorship(line, GODS);
    expect(line.length).toBeLessThanOrEqual(200);
    expect(parts.filter((p) => p.href).length).toBe(33);
  });

  test("[TC-CWCO-006] an empty name in the table never matches (and cannot loop)", () => {
    expect(linkWorship("Zeus", new Map([["", "/x"], ["zeus", "/z"]]))).toEqual([{ text: "Zeus", href: "/z" }]);
  });
});

test.describe("journal entries", () => {
  test("[TC-CWCO-007] a good entry is trimmed and kept; the title is optional", () => {
    expect(checkJournalEntry({ title: "  Day one  ", body: "  We left the port.  " })).toEqual({ ok: true, value: { title: "Day one", body: "We left the port." } });
    expect(checkJournalEntry({ body: "No title." })).toEqual({ ok: true, value: { title: "", body: "No title." } });
  });

  test("[TC-CWCO-008] the limits hold at the boundary: 4000 characters of body and 120 of title are fine, one more is not", () => {
    expect(checkJournalEntry({ body: "x".repeat(WORLD_LIMITS.journalBody) }).ok).toBe(true);
    const over = checkJournalEntry({ body: "x".repeat(WORLD_LIMITS.journalBody + 1) });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.problems.join(" ")).toMatch(/at most 4000 characters/);
    expect(checkJournalEntry({ title: "t".repeat(WORLD_LIMITS.journalTitle), body: "ok" }).ok).toBe(true);
    const longTitle = checkJournalEntry({ title: "t".repeat(WORLD_LIMITS.journalTitle + 1), body: "ok" });
    expect(longTitle.ok).toBe(false);
    if (!longTitle.ok) expect(longTitle.problems.join(" ")).toMatch(/at most 120 characters/);
  });

  test("[TC-CWCO-009] characters are counted as people see them: 4000 emoji are fine, 4001 are not", () => {
    expect(checkJournalEntry({ body: "😀".repeat(4000) }).ok).toBe(true);
    expect(checkJournalEntry({ body: "😀".repeat(4001) }).ok).toBe(false);
  });

  test("[TC-CWCO-010] an empty or blank body, the wrong types, extra keys and non-objects are refused with the reason", () => {
    for (const bad of [{ body: "" }, { body: "   \n " }, { title: "t" }, { body: 5 }, { body: "ok", title: 5 }, { body: "ok", extra: 1 }, null, "text", ["a"], 7, undefined]) {
      const r = checkJournalEntry(bad);
      expect(r.ok, JSON.stringify(bad)).toBe(false);
      if (!r.ok) expect(r.problems.length).toBeGreaterThan(0);
    }
  });

  test("[TC-CWCO-011] markup is kept as typed, not rewritten (it is escaped where it is shown)", () => {
    expect(checkJournalEntry({ body: "<script>alert(1)</script> & more" })).toEqual({ ok: true, value: { title: "", body: "<script>alert(1)</script> & more" } });
  });
});

test.describe("sharing and home changes", () => {
  test("[TC-CWCO-012] shared and homeSlug are the only things that can change, alone or together", () => {
    expect(checkWorldPatch({ shared: true })).toEqual({ ok: true, value: { shared: true } });
    expect(checkWorldPatch({ shared: false })).toEqual({ ok: true, value: { shared: false } });
    expect(checkWorldPatch({ homeSlug: "helarchon" })).toEqual({ ok: true, value: { homeSlug: "helarchon" } });
    expect(checkWorldPatch({ homeSlug: null })).toEqual({ ok: true, value: { homeSlug: null } });
    expect(checkWorldPatch({ shared: true, homeSlug: "helarchon" })).toEqual({ ok: true, value: { shared: true, homeSlug: "helarchon" } });
  });

  test("[TC-CWCO-013] anything else is refused: other keys, wrong types, an empty or over-long address, an empty change, non-objects", () => {
    for (const bad of [{}, { name: "Other" }, { shared: "yes" }, { shared: 1 }, { shared: null }, { homeSlug: 5 }, { homeSlug: "" }, { homeSlug: "x".repeat(201) }, { shared: true, userId: "x" }, null, "x", [], 3]) {
      expect(checkWorldPatch(bad).ok, JSON.stringify(bad)).toBe(false);
    }
    expect(checkWorldPatch({ homeSlug: "x".repeat(200) }).ok).toBe(true);
  });
});

test.describe("limits", () => {
  test("[TC-CWCO-014] the numbers the plan names", () => {
    expect(WORLD_LIMITS).toEqual({ journalEntries: 200, journalTitle: 120, journalBody: 4000, roster: 100 });
  });
});
