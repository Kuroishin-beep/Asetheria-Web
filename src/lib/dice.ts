/**
 * Dice notation parser and roller.
 *
 * Supports: `2d6`, `d20`, `4d6kh3` (keep highest 3), `2d20kl1` (keep lowest),
 * `d20adv` / `d20dis`, exploding dice `3d6!`, arithmetic `1d8+2d6+3`, and
 * multiple rolls `6x4d6kh3`.
 */

export type DieGroup = {
  notation: string;
  rolls: number[];
  kept: number[];
  dropped: number[];
  sides: number;
  total: number;
};

export type RollResult = {
  expression: string;
  groups: DieGroup[];
  modifier: number;
  total: number;
  /** True when a plain single d20 came up 20 or 1 — worth calling out. */
  crit: "hit" | "miss" | null;
};

const MAX_DICE = 500;
const MAX_SIDES = 1000;

/** Uses the platform CSPRNG so results aren't predictable from a seed. */
function rollDie(sides: number): number {
  const buf = new Uint32Array(1);
  // Rejection sampling keeps the distribution uniform.
  const limit = Math.floor(0xffffffff / sides) * sides;
  let value: number;
  do {
    crypto.getRandomValues(buf);
    value = buf[0];
  } while (value >= limit);
  return (value % sides) + 1;
}

export class DiceError extends Error {}

function parseGroup(token: string): DieGroup {
  const m = token.match(
    /^(\d*)d(\d+)(?:(kh|kl|dh|dl)(\d*))?(adv|dis)?(!)?$/i,
  );
  if (!m) throw new DiceError(`Cannot read "${token}".`);

  let count = m[1] ? parseInt(m[1], 10) : 1;
  const sides = parseInt(m[2], 10);
  const keepMode = m[3]?.toLowerCase();
  const keepCount = m[4] ? parseInt(m[4], 10) : 1;
  const advantage = m[5]?.toLowerCase();
  const exploding = Boolean(m[6]);

  if (sides < 2 || sides > MAX_SIDES) {
    throw new DiceError(`A die needs between 2 and ${MAX_SIDES} sides.`);
  }
  if (count < 1 || count > MAX_DICE) {
    throw new DiceError(`Roll between 1 and ${MAX_DICE} dice at a time.`);
  }
  // advantage/disadvantage is shorthand for 2dN keep highest/lowest 1.
  if (advantage) count = 2;

  const rolls: number[] = [];
  for (let i = 0; i < count; i++) {
    let value = rollDie(sides);
    rolls.push(value);
    if (exploding) {
      let guard = 0;
      while (value === sides && guard++ < 50) {
        value = rollDie(sides);
        rolls.push(value);
      }
    }
  }

  const sorted = [...rolls].sort((a, b) => b - a);
  let kept = rolls;
  let dropped: number[] = [];

  if (advantage === "adv") {
    kept = [sorted[0]];
    dropped = sorted.slice(1);
  } else if (advantage === "dis") {
    kept = [sorted[sorted.length - 1]];
    dropped = sorted.slice(0, -1);
  } else if (keepMode) {
    const n = Math.min(keepCount, rolls.length);
    if (keepMode === "kh" || keepMode === "dl") {
      const take = keepMode === "kh" ? n : rolls.length - n;
      kept = sorted.slice(0, take);
      dropped = sorted.slice(take);
    } else {
      const take = keepMode === "kl" ? n : rolls.length - n;
      kept = sorted.slice(-take);
      dropped = sorted.slice(0, sorted.length - take);
    }
  }

  return {
    notation: token,
    rolls,
    kept,
    dropped,
    sides,
    total: kept.reduce((a, b) => a + b, 0),
  };
}

export function roll(expression: string): RollResult {
  const expr = expression.trim().toLowerCase().replace(/\s+/g, "");
  if (!expr) throw new DiceError("Type something like 1d20+5.");
  if (expr.length > 100) throw new DiceError("That expression is too long.");

  // Split into signed terms: 2d6+3-1d4 -> ["+2d6", "+3", "-1d4"]
  const terms = expr.match(/[+-]?[^+-]+/g);
  if (!terms) throw new DiceError(`Cannot read "${expression}".`);

  const groups: DieGroup[] = [];
  let modifier = 0;
  let total = 0;

  for (const raw of terms) {
    const sign = raw.startsWith("-") ? -1 : 1;
    const token = raw.replace(/^[+-]/, "");
    if (!token) continue;

    if (/^\d+$/.test(token)) {
      const value = parseInt(token, 10) * sign;
      modifier += value;
      total += value;
      continue;
    }
    const group = parseGroup(token);
    groups.push(group);
    total += group.total * sign;
  }

  if (groups.length === 0 && modifier === 0) {
    throw new DiceError(`Cannot read "${expression}".`);
  }

  // Only flag a crit on a lone, unmodified d20 — that's the case it means something.
  let crit: RollResult["crit"] = null;
  if (groups.length === 1 && groups[0].sides === 20 && groups[0].kept.length === 1) {
    if (groups[0].kept[0] === 20) crit = "hit";
    else if (groups[0].kept[0] === 1) crit = "miss";
  }

  return { expression, groups, modifier, total, crit };
}

/** Rolls `NxEXPR` (e.g. `6x4d6kh3`) and returns each result. */
export function rollMany(expression: string): RollResult[] {
  const m = expression.trim().match(/^(\d+)\s*x\s*(.+)$/i);
  if (!m) return [roll(expression)];
  const times = Math.min(parseInt(m[1], 10), 50);
  if (times < 1) throw new DiceError("Roll at least once.");
  return Array.from({ length: times }, () => roll(m[2]));
}

/** Picks a row from a rollable table using its own dice expression. */
export function rollOnTable(
  dice: string,
  items: { min: number; max: number; result: string }[],
): { roll: number; result: string | null } {
  const value = roll(dice).total;
  const hit = items.find((i) => value >= i.min && value <= i.max);
  return { roll: value, result: hit?.result ?? null };
}
