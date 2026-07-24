"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveRollTableAction, saveRollTableAction } from "@/lib/actions";
import { DiceError, rollOnTable } from "@/lib/dice";

type Item = { min: number; max: number; result: string };
type Table = {
  id: string;
  name: string;
  description: string;
  dice: string;
  items: Item[];
  visibility: string;
};

export function TableManager({
  tables,
  isDM,
}: {
  tables: Table[];
  isDM: boolean;
}) {
  const [editing, setEditing] = useState<Table | "new" | null>(null);

  return (
    <>
      {isDM && !editing && (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setEditing("new")}
          style={{ marginBottom: "1.5rem" }}
        >
          + New table
        </button>
      )}

      {editing && (
        <TableEditor
          table={editing === "new" ? null : editing}
          onDone={() => setEditing(null)}
        />
      )}

      {tables.length === 0 && !editing ? (
        <p style={{ color: "var(--text-muted)" }}>
          No tables yet.{" "}
          {isDM && "Create one to roll for names, loot, or encounters."}
        </p>
      ) : (
        <div style={{ display: "grid", gap: "0.85rem" }}>
          {tables.map((t) => (
            <TableCard
              key={t.id}
              table={t}
              isDM={isDM}
              onEdit={() => setEditing(t)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function TableCard({
  table,
  isDM,
  onEdit,
}: {
  table: Table;
  isDM: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [result, setResult] = useState<{ roll: number; result: string | null } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="card" style={{ padding: "1rem 1.15rem" }}>
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          alignItems: "baseline",
          flexWrap: "wrap",
        }}
      >
        <h2
          className="font-display"
          style={{ fontWeight: 600, fontSize: "1.05rem", flex: 1, minWidth: "10rem" }}
        >
          {table.name}
        </h2>
        {table.visibility === "secret" && (
          <span className="chip chip-secret">DM only</span>
        )}
        <span
          className="chip"
          style={{ fontFamily: "ui-monospace, monospace" }}
        >
          {table.dice}
        </span>
        <button
          type="button"
          className="btn"
          onClick={() => {
            try {
              setResult(rollOnTable(table.dice, table.items));
              setError(null);
            } catch (e) {
              setError(e instanceof DiceError ? e.message : "Roll failed.");
            }
          }}
        >
          🎲 Roll
        </button>
        {isDM && (
          <>
            <button type="button" className="btn" onClick={onEdit}>
              ✎
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={pending}
              title="Archive this table"
              onClick={() =>
                startTransition(async () => {
                  await archiveRollTableAction(table.id);
                  router.refresh();
                })
              }
            >
              🗄
            </button>
          </>
        )}
      </div>

      {table.description && (
        <p
          style={{
            fontSize: "0.875rem",
            color: "var(--text-muted)",
            marginTop: "0.35rem",
          }}
        >
          {table.description}
        </p>
      )}

      {error && (
        <p style={{ color: "var(--color-blood-400)", fontSize: "0.8125rem" }}>
          {error}
        </p>
      )}

      {result && (
        <div
          style={{
            marginTop: "0.85rem",
            padding: "0.75rem 1rem",
            borderRadius: 8,
            background: "var(--bg-sunken)",
            border: "1px solid var(--border-soft)",
          }}
        >
          <span
            className="font-display"
            style={{
              fontSize: "1.35rem",
              fontWeight: 700,
              color: "var(--accent)",
              marginRight: "0.75rem",
            }}
          >
            {result.roll}
          </span>
          <span>{result.result ?? "— nothing on that number —"}</span>
        </div>
      )}

      <details style={{ marginTop: "0.75rem" }}>
        <summary
          style={{
            cursor: "pointer",
            fontSize: "0.8125rem",
            color: "var(--text-muted)",
          }}
        >
          {table.items.length} rows
        </summary>
        <div className="table-scroll" style={{ marginTop: "0.6rem" }}>
          <table style={{ width: "100%", fontSize: "0.875rem" }}>
            <thead>
              <tr>
                <th style={{ width: "5rem" }}>Roll</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {table.items.map((it, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: "ui-monospace, monospace" }}>
                    {it.min === it.max ? it.min : `${it.min}–${it.max}`}
                  </td>
                  <td>{it.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function TableEditor({
  table,
  onDone,
}: {
  table: Table | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(
    table?.items?.length ? table.items : [{ min: 1, max: 1, result: "" }],
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function updateItem(idx: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  return (
    <form
      className="card"
      style={{ padding: "1.15rem", marginBottom: "1.5rem", display: "grid", gap: "1rem" }}
      action={(formData) => {
        // Rows with no text are dropped rather than saved empty.
        const clean = items.filter((it) => it.result.trim());
        formData.set("items", JSON.stringify(clean));
        startTransition(async () => {
          const res = await saveRollTableAction(table?.id ?? null, undefined, formData);
          if (res && "error" in res && res.error) setError(res.error);
          else {
            onDone();
            router.refresh();
          }
        });
      }}
    >
      <h2 className="label" style={{ margin: 0 }}>
        {table ? "Edit table" : "New table"}
      </h2>

      <div
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 12rem), 1fr))",
        }}
      >
        <div>
          <label className="label" htmlFor="t-name">
            Name *
          </label>
          <input
            id="t-name"
            name="name"
            className="input"
            defaultValue={table?.name ?? ""}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="t-dice">
            Dice
          </label>
          <input
            id="t-dice"
            name="dice"
            className="input"
            defaultValue={table?.dice ?? "1d20"}
            style={{ fontFamily: "ui-monospace, monospace" }}
          />
        </div>
        <div>
          <label className="label" htmlFor="t-vis">
            Visible to
          </label>
          <select
            id="t-vis"
            name="visibility"
            className="select"
            defaultValue={table?.visibility ?? "secret"}
          >
            <option value="secret">DM only</option>
            <option value="public">Everyone</option>
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="t-desc">
          Description
        </label>
        <input
          id="t-desc"
          name="description"
          className="input"
          defaultValue={table?.description ?? ""}
        />
      </div>

      <div>
        <span className="label">Rows</span>
        <div style={{ display: "grid", gap: "0.4rem" }}>
          {items.map((it, i) => (
            <div key={i} style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
              <input
                type="number"
                className="input"
                value={it.min}
                onChange={(e) => updateItem(i, { min: Number(e.target.value) })}
                aria-label={`Row ${i + 1} minimum`}
                style={{ width: "5rem" }}
              />
              <span style={{ color: "var(--text-faint)" }}>–</span>
              <input
                type="number"
                className="input"
                value={it.max}
                onChange={(e) => updateItem(i, { max: Number(e.target.value) })}
                aria-label={`Row ${i + 1} maximum`}
                style={{ width: "5rem" }}
              />
              <input
                className="input"
                value={it.result}
                onChange={(e) => updateItem(i, { result: e.target.value })}
                aria-label={`Row ${i + 1} result`}
                placeholder="Result"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => setItems((p) => p.filter((_, x) => x !== i))}
                aria-label={`Remove row ${i + 1}`}
                style={{ padding: "0.4rem 0.6rem" }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn"
          style={{ marginTop: "0.5rem" }}
          onClick={() =>
            setItems((p) => {
              const next = (p[p.length - 1]?.max ?? 0) + 1;
              return [...p, { min: next, max: next, result: "" }];
            })
          }
        >
          + Add row
        </button>
      </div>

      {error && (
        <p role="alert" style={{ color: "var(--color-blood-400)", fontSize: "0.875rem" }}>
          {error}
        </p>
      )}

      <div style={{ display: "flex", gap: "0.6rem" }}>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save table"}
        </button>
        <button type="button" className="btn" onClick={onDone} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}
