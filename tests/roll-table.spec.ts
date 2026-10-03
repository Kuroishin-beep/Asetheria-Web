import { test, expect } from "@playwright/test";
import {
  checkCoverage,
  diceSpan,
  parseRollTable,
  serializeRollTable,
  type RollRow,
} from "../src/lib/roll-table";

test.describe("roll table format (pure logic, no browser needed)", () => {
  test("diceSpan reports the lowest and highest possible total", () => {
    expect(diceSpan("1d20")).toEqual({ min: 1, max: 20 });
    expect(diceSpan("d100")).toEqual({ min: 1, max: 100 });
    expect(diceSpan("2d6")).toEqual({ min: 2, max: 12 });
    expect(diceSpan("2d6+1")).toEqual({ min: 3, max: 13 });
    expect(diceSpan("1d8-1")).toEqual({ min: 0, max: 7 });
  });

  test("diceSpan rejects anything that is not simple dice notation", () => {
    expect(diceSpan("")).toBeNull();
    expect(diceSpan("banana")).toBeNull();
    expect(diceSpan("1d1")).toBeNull();
    expect(diceSpan("0d6")).toBeNull();
    expect(diceSpan("1d20kh1")).toBeNull();
  });

  test("serialize then parse returns exactly the rows it was given", () => {
    const rows: RollRow[] = [
      { min: 1, max: 3, result: "A copper ring" },
      { min: 4, max: 4, result: "A | pipe and a \\ backslash" },
      { min: 5, max: 6, result: "Two lines\nof text" },
    ];
    const body = serializeRollTable(rows);
    expect(body.split("\n")[0]).toBe("| Roll | Result |");
    expect(parseRollTable(body)).toEqual({ rows, problems: [] });
  });

  test("round-trips 300 randomly generated tables with awkward characters", () => {
    const alphabet = ["a", "Z", " ", "|", "\\", "-", "1", "é", "\n", "*", "[", "]", "#", ":"];
    let seed = 12345;
    const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
    for (let t = 0; t < 300; t++) {
      const rows: RollRow[] = [];
      let n = 1;
      const count = 1 + (next() % 8);
      for (let r = 0; r < count; r++) {
        const width = next() % 4;
        let result = "x";
        const length = next() % 12;
        for (let c = 0; c < length; c++) result += alphabet[next() % alphabet.length];
        result = result.trim();
        rows.push({ min: n, max: n + width, result });
        n += width + 1;
      }
      const parsed = parseRollTable(serializeRollTable(rows));
      expect(parsed.problems).toEqual([]);
      expect(parsed.rows).toEqual(rows);
    }
  });

  test("prose around the table is ignored and an en dash range is read", () => {
    const body = ["The old herbalist's guide.", "", "| Roll | Result |", "|:--|--:|", "| 1–2 | Moss |", "| 3 | Lichen |", "", "Trailing note."].join("\n");
    expect(parseRollTable(body)).toEqual({
      rows: [
        { min: 1, max: 2, result: "Moss" },
        { min: 3, max: 3, result: "Lichen" },
      ],
      problems: [],
    });
  });

  test("a malformed row is reported, never silently dropped", () => {
    const body = "| Roll | Result |\n|---|---|\n| 1 | Fine |\n| soon | Bad range |\n| 3 | |\n| 4 |";
    const { rows, problems } = parseRollTable(body);
    expect(rows).toEqual([{ min: 1, max: 1, result: "Fine" }]);
    expect(problems).toHaveLength(3);
    expect(problems[0]).toContain("soon");
  });

  test("coverage passes when every roll lands on exactly one row", () => {
    const rows: RollRow[] = [
      { min: 1, max: 10, result: "a" },
      { min: 11, max: 20, result: "b" },
    ];
    expect(checkCoverage("1d20", rows)).toEqual([]);
  });

  test("coverage names the gap, the overlap, the overrun and the backwards range", () => {
    expect(checkCoverage("1d6", [{ min: 1, max: 2, result: "a" }, { min: 5, max: 6, result: "b" }])).toEqual([
      "No row covers 3-4.",
    ]);
    expect(checkCoverage("1d6", [{ min: 1, max: 4, result: "a" }, { min: 4, max: 6, result: "b" }])).toEqual([
      "Roll 4 is in more than one row.",
    ]);
    expect(checkCoverage("1d6", [{ min: 1, max: 7, result: "a" }])[0]).toContain("outside 1d6");
    expect(checkCoverage("1d6", [{ min: 4, max: 2, result: "a" }])[0]).toContain("runs backwards");
    expect(checkCoverage("nope", [{ min: 1, max: 1, result: "a" }])[0]).toContain("not dice notation");
    expect(checkCoverage("1d6", [])).toEqual(["The table has no rows."]);
  });
});
