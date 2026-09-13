import { test, expect } from "@playwright/test";
import { roll, rollMany, rollOnTable, DiceError } from "../src/lib/dice";

test.describe("dice engine (pure logic, no browser needed)", () => {
  test("simple die roll stays within bounds", () => {
    for (let i = 0; i < 200; i++) {
      const r = roll("1d20");
      expect(r.total).toBeGreaterThanOrEqual(1);
      expect(r.total).toBeLessThanOrEqual(20);
    }
  });

  test("modifiers add correctly", () => {
    for (let i = 0; i < 50; i++) {
      const r = roll("2d6+3");
      expect(r.total).toBeGreaterThanOrEqual(5);
      expect(r.total).toBeLessThanOrEqual(15);
    }
  });

  test("advantage keeps the higher of two d20s", () => {
    for (let i = 0; i < 50; i++) {
      const r = roll("1d20adv");
      expect(r.groups[0].kept).toHaveLength(1);
      expect(r.groups[0].kept[0]).toBeGreaterThanOrEqual(Math.max(...r.groups[0].dropped, 0));
    }
  });

  test("a lone unmodified d20 flags crit hit/miss correctly", () => {
    let sawHit = false;
    let sawMiss = false;
    for (let i = 0; i < 500 && !(sawHit && sawMiss); i++) {
      const r = roll("1d20");
      if (r.total === 20) {
        expect(r.crit).toBe("hit");
        sawHit = true;
      } else if (r.total === 1) {
        expect(r.crit).toBe("miss");
        sawMiss = true;
      } else {
        expect(r.crit).toBeNull();
      }
    }
  });

  test("rejects malformed expressions instead of throwing an unrelated error", () => {
    expect(() => roll("not-dice")).toThrow(DiceError);
    expect(() => roll("")).toThrow(DiceError);
    expect(() => roll("999d999999")).toThrow(DiceError);
  });

  test("rollMany repeats the same expression the requested number of times", () => {
    const results = rollMany("5x1d6");
    expect(results).toHaveLength(5);
    for (const r of results) {
      expect(r.total).toBeGreaterThanOrEqual(1);
      expect(r.total).toBeLessThanOrEqual(6);
    }
  });

  test("rollOnTable picks the row whose bounds contain the roll", () => {
    const items = [
      { min: 1, max: 2, result: "Sword" },
      { min: 3, max: 4, result: "Shield" },
    ];
    for (let i = 0; i < 50; i++) {
      const { roll: value, result } = rollOnTable("1d4", items);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(4);
      expect(result).toBe(value <= 2 ? "Sword" : "Shield");
    }
  });
});
