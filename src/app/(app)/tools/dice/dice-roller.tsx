"use client";

import { useEffect, useRef, useState } from "react";
import { DiceError, rollMany, type RollResult } from "@/lib/dice";

const PRESETS = [
  "1d20",
  "1d20adv",
  "1d20dis",
  "1d4",
  "1d6",
  "1d8",
  "1d10",
  "1d12",
  "2d6",
  "1d100",
  "4d6kh3",
  "6x4d6kh3",
];

type LogEntry = {
  id: number;
  at: string;
  results: RollResult[];
};

export function DiceRoller() {
  const [expr, setExpr] = useState("1d20");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const nextId = useRef(1);
  const inputRef = useRef<HTMLInputElement>(null);

  // Restore the log so a refresh mid-session doesn't lose the history.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("asetheria-dice-log");
      if (saved) {
        const parsed = JSON.parse(saved) as LogEntry[];
        setLog(parsed);
        nextId.current = (parsed[0]?.id ?? 0) + 1;
      }
    } catch {
      // Nothing worth surfacing — start with an empty log.
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem("asetheria-dice-log", JSON.stringify(log.slice(0, 50)));
    } catch {
      // Storage full or blocked; the log just won't persist.
    }
  }, [log]);

  function doRoll(expression: string) {
    try {
      const results = rollMany(expression);
      setError(null);
      setLog((prev) =>
        [
          {
            id: nextId.current++,
            at: new Date().toLocaleTimeString(),
            results,
          },
          ...prev,
        ].slice(0, 50),
      );
    } catch (e) {
      setError(e instanceof DiceError ? e.message : "That roll didn't work.");
    }
  }

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          doRoll(expr);
        }}
        style={{ display: "flex", gap: "0.6rem", marginBottom: "0.85rem" }}
      >
        <input
          ref={inputRef}
          className="input"
          value={expr}
          onChange={(e) => setExpr(e.target.value)}
          placeholder="1d20+5, 4d6kh3, 6x4d6kh3…"
          aria-label="Dice expression"
          style={{ fontFamily: "ui-monospace, monospace", fontSize: "1rem" }}
        />
        <button type="submit" className="btn btn-primary">
          Roll
        </button>
      </form>

      <div
        style={{
          display: "flex",
          gap: "0.35rem",
          flexWrap: "wrap",
          marginBottom: "1.5rem",
        }}
      >
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            className="chip"
            onClick={() => {
              setExpr(p);
              doRoll(p);
            }}
            style={{ cursor: "pointer", fontFamily: "ui-monospace, monospace" }}
          >
            {p}
          </button>
        ))}
      </div>

      {error && (
        <p
          role="alert"
          style={{
            fontSize: "0.875rem",
            color: "var(--color-blood-400)",
            marginBottom: "1rem",
          }}
        >
          {error}
        </p>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.6rem",
        }}
      >
        <h2 className="label" style={{ margin: 0 }}>
          Rolls
        </h2>
        {log.length > 0 && (
          <button
            type="button"
            className="btn"
            style={{ padding: "0.25rem 0.55rem", fontSize: "0.75rem" }}
            onClick={() => setLog([])}
          >
            Clear
          </button>
        )}
      </div>

      {log.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
          Nothing rolled yet.
        </p>
      ) : (
        <ul style={{ display: "grid", gap: "0.5rem" }}>
          {log.map((entry) => (
            <li key={entry.id} className="card" style={{ padding: "0.8rem 1rem" }}>
              {entry.results.map((r, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: "0.75rem",
                    flexWrap: "wrap",
                    paddingTop: i > 0 ? "0.5rem" : 0,
                    marginTop: i > 0 ? "0.5rem" : 0,
                    borderTop:
                      i > 0 ? "1px solid var(--border-soft)" : undefined,
                  }}
                >
                  <span
                    style={{
                      fontSize: "1.5rem",
                      fontWeight: 700,
                      fontFamily: "var(--font-display)",
                      color:
                        r.crit === "hit"
                          ? "var(--color-patina-400)"
                          : r.crit === "miss"
                            ? "var(--color-blood-400)"
                            : "var(--accent)",
                      minWidth: "2.5rem",
                    }}
                  >
                    {r.total}
                  </span>

                  <span style={{ flex: 1, minWidth: "10rem" }}>
                    <span
                      style={{
                        fontFamily: "ui-monospace, monospace",
                        fontSize: "0.8125rem",
                        color: "var(--text-muted)",
                      }}
                    >
                      {r.expression}
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontSize: "0.8125rem",
                        color: "var(--text-faint)",
                        marginTop: "0.15rem",
                      }}
                    >
                      {r.groups.map((g, gi) => (
                        <span key={gi} style={{ marginRight: "0.6rem" }}>
                          {g.notation}: [
                          {g.kept.join(", ")}
                          {g.dropped.length > 0 && (
                            <span style={{ textDecoration: "line-through", opacity: 0.55 }}>
                              {" "}
                              {g.dropped.join(", ")}
                            </span>
                          )}
                          ]
                        </span>
                      ))}
                      {r.modifier !== 0 && (
                        <span>
                          {r.modifier > 0 ? "+" : ""}
                          {r.modifier}
                        </span>
                      )}
                    </span>
                  </span>

                  {r.crit === "hit" && (
                    <span
                      className="chip"
                      style={{
                        borderColor: "var(--color-patina-400)",
                        color: "var(--color-patina-400)",
                      }}
                    >
                      critical
                    </span>
                  )}
                  {r.crit === "miss" && (
                    <span
                      className="chip"
                      style={{
                        borderColor: "var(--color-blood-400)",
                        color: "var(--color-blood-400)",
                      }}
                    >
                      fumble
                    </span>
                  )}
                  {i === 0 && (
                    <span
                      style={{ fontSize: "0.6875rem", color: "var(--text-faint)" }}
                    >
                      {entry.at}
                    </span>
                  )}
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}

      <details className="card" style={{ padding: "0.85rem 1rem", marginTop: "1.5rem" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "0.875rem" }}>
          Notation reference
        </summary>
        <dl
          style={{
            marginTop: "0.85rem",
            display: "grid",
            gap: "0.4rem",
            fontSize: "0.875rem",
            gridTemplateColumns: "auto 1fr",
            columnGap: "1rem",
          }}
        >
          {[
            ["2d6+3", "two six-sided dice, plus three"],
            ["1d20adv", "advantage (roll twice, keep the best)"],
            ["1d20dis", "disadvantage"],
            ["4d6kh3", "roll four, keep the highest three"],
            ["2d20kl1", "roll two, keep the lowest"],
            ["3d6!", "exploding — max rolls again"],
            ["6x4d6kh3", "repeat the roll six times"],
            ["1d8+2d6-1", "combine any number of terms"],
          ].map(([code, desc]) => (
            <div key={code} style={{ display: "contents" }}>
              <dt
                style={{
                  fontFamily: "ui-monospace, monospace",
                  color: "var(--accent)",
                }}
              >
                {code}
              </dt>
              <dd style={{ color: "var(--text-muted)" }}>{desc}</dd>
            </div>
          ))}
        </dl>
      </details>
    </>
  );
}
