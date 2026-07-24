"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { KINDS, KIND_BY_KEY } from "@/lib/kinds";
import type { EntryKind } from "@/db/schema";

export type EntryFormValues = {
  id?: string;
  name: string;
  kind: EntryKind;
  summary: string;
  body: string;
  dmNotes: string;
  visibility: "public" | "secret" | "revealed";
  tags: string[];
  fields: Record<string, string>;
  parentId: string | null;
};

type ParentOption = { id: string; name: string; kind: EntryKind };

type ActionState = { error?: string } | undefined;

export function EntryForm({
  action,
  initial,
  parents,
  cancelHref,
  submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial: EntryFormValues;
  parents: ParentOption[];
  cancelHref: string;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    action,
    undefined,
  );
  const [kind, setKind] = useState<EntryKind>(initial.kind);
  const [showDmNotes, setShowDmNotes] = useState(
    Boolean(initial.dmNotes) || initial.visibility === "secret",
  );

  const def = KIND_BY_KEY[kind];

  // Properties captured on import that this kind doesn't define — surfaced so
  // they remain editable instead of being invisibly carried along.
  const extraFieldKeys = useMemo(() => {
    const known = new Set(def?.fields.map((f) => f.key) ?? []);
    return Object.keys(initial.fields).filter(
      (k) => !known.has(k) && initial.fields[k],
    );
  }, [def, initial.fields]);

  return (
    <form action={formAction} style={{ display: "grid", gap: "1.5rem" }}>
      {state?.error && (
        <p
          role="alert"
          style={{
            fontSize: "0.875rem",
            color: "var(--color-blood-400)",
            background:
              "color-mix(in srgb, var(--color-blood-400) 10%, transparent)",
            border:
              "1px solid color-mix(in srgb, var(--color-blood-400) 30%, transparent)",
            borderRadius: 8,
            padding: "0.7rem 0.85rem",
          }}
        >
          {state.error}
        </p>
      )}

      {/* ---- Identity ---- */}
      <fieldset
        className="card"
        style={{ padding: "1.15rem", display: "grid", gap: "1rem" }}
      >
        <legend className="label" style={{ padding: "0 0.4rem" }}>
          Identity
        </legend>

        <div
          style={{
            display: "grid",
            gap: "1rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 14rem), 1fr))",
          }}
        >
          <div>
            <label className="label" htmlFor="name">
              Name *
            </label>
            <input
              id="name"
              name="name"
              className="input"
              defaultValue={initial.name}
              required
              maxLength={300}
              autoFocus={!initial.id}
            />
          </div>

          <div>
            <label className="label" htmlFor="kind">
              Type
            </label>
            <select
              id="kind"
              name="kind"
              className="select"
              value={kind}
              onChange={(e) => setKind(e.target.value as EntryKind)}
            >
              {KINDS.map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.icon} {k.singular}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="summary">
            Summary
          </label>
          <input
            id="summary"
            name="summary"
            className="input"
            defaultValue={initial.summary}
            maxLength={600}
            placeholder="One line shown in lists and search results"
          />
        </div>

        <div
          style={{
            display: "grid",
            gap: "1rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 14rem), 1fr))",
          }}
        >
          <div>
            <label className="label" htmlFor="tags">
              Tags
            </label>
            <input
              id="tags"
              name="tags"
              className="input"
              defaultValue={initial.tags.join(", ")}
              placeholder="Comma separated"
            />
          </div>

          <div>
            <label className="label" htmlFor="parentId">
              Belongs to
            </label>
            <select
              id="parentId"
              name="parentId"
              className="select"
              defaultValue={initial.parentId ?? ""}
            >
              <option value="">— nothing —</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>

      {/* ---- Visibility ---- */}
      <fieldset
        className="card"
        style={{ padding: "1.15rem", display: "grid", gap: "0.75rem" }}
      >
        <legend className="label" style={{ padding: "0 0.4rem" }}>
          Who can see this
        </legend>
        {(
          [
            {
              value: "public",
              label: "Everyone",
              hint: "Players see this entry in their codex.",
            },
            {
              value: "secret",
              label: "DM only",
              hint: "Hidden from players everywhere — lists, search, and links.",
            },
            {
              value: "revealed",
              label: "Revealed",
              hint: "Was a secret, now deliberately shown to the party.",
            },
          ] as const
        ).map((opt) => (
          <label
            key={opt.value}
            style={{
              display: "flex",
              gap: "0.6rem",
              alignItems: "flex-start",
              cursor: "pointer",
              fontSize: "0.9375rem",
            }}
          >
            <input
              type="radio"
              name="visibility"
              value={opt.value}
              defaultChecked={initial.visibility === opt.value}
              style={{ marginTop: "0.25rem", accentColor: "var(--accent)" }}
            />
            <span>
              <span style={{ fontWeight: 500 }}>{opt.label}</span>
              <span
                style={{
                  display: "block",
                  fontSize: "0.8125rem",
                  color: "var(--text-muted)",
                }}
              >
                {opt.hint}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {/* ---- Kind-specific properties ---- */}
      {(def?.fields.length ?? 0) > 0 || extraFieldKeys.length > 0 ? (
        <fieldset
          className="card"
          style={{ padding: "1.15rem", display: "grid", gap: "1rem" }}
        >
          <legend className="label" style={{ padding: "0 0.4rem" }}>
            {def?.singular} details
          </legend>
          <div
            style={{
              display: "grid",
              gap: "1rem",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(min(100%, 14rem), 1fr))",
            }}
          >
            {def?.fields.map((f) => (
              <div
                key={f.key}
                style={f.type === "textarea" ? { gridColumn: "1 / -1" } : undefined}
              >
                <label className="label" htmlFor={`field-${f.key}`}>
                  {f.label}
                </label>
                {f.type === "textarea" ? (
                  <textarea
                    id={`field-${f.key}`}
                    name={`fields[${f.key}]`}
                    className="textarea"
                    style={{ minHeight: "5rem" }}
                    defaultValue={initial.fields[f.key] ?? ""}
                    placeholder={f.placeholder}
                  />
                ) : (
                  <input
                    id={`field-${f.key}`}
                    name={`fields[${f.key}]`}
                    className="input"
                    defaultValue={initial.fields[f.key] ?? ""}
                    placeholder={f.placeholder}
                  />
                )}
              </div>
            ))}

            {extraFieldKeys.map((k) => (
              <div key={k}>
                <label className="label" htmlFor={`field-${k}`}>
                  {k.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}
                  <span style={{ color: "var(--text-faint)" }}> (imported)</span>
                </label>
                <input
                  id={`field-${k}`}
                  name={`fields[${k}]`}
                  className="input"
                  defaultValue={initial.fields[k]}
                />
              </div>
            ))}
          </div>
        </fieldset>
      ) : null}

      {/* ---- Body ---- */}
      <fieldset
        className="card"
        style={{ padding: "1.15rem", display: "grid", gap: "0.6rem" }}
      >
        <legend className="label" style={{ padding: "0 0.4rem" }}>
          Description
        </legend>
        <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
          Markdown works. Type{" "}
          <code
            style={{
              background: "var(--bg-sunken)",
              padding: "0.05rem 0.3rem",
              borderRadius: 4,
            }}
          >
            [[Aeterna City]]
          </code>{" "}
          to link another entry — the link shows up on both pages.
        </p>
        <textarea
          id="body"
          name="body"
          className="textarea"
          style={{ minHeight: "22rem", fontFamily: "var(--font-prose)" }}
          defaultValue={initial.body}
        />
      </fieldset>

      {/* ---- DM notes ---- */}
      <fieldset
        className="card"
        style={{
          padding: "1.15rem",
          display: "grid",
          gap: "0.6rem",
          borderColor: "color-mix(in srgb, var(--secret) 35%, transparent)",
        }}
      >
        <legend
          className="label"
          style={{ padding: "0 0.4rem", color: "var(--secret)" }}
        >
          ⊘ DM notes
        </legend>
        {showDmNotes ? (
          <>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
              Never sent to a player, even when the entry itself is public.
            </p>
            <textarea
              id="dmNotes"
              name="dmNotes"
              className="textarea"
              style={{ minHeight: "9rem", fontFamily: "var(--font-prose)" }}
              defaultValue={initial.dmNotes}
              placeholder="The innkeeper is a doppelganger. The vault key is behind the painting."
            />
          </>
        ) : (
          <>
            <input type="hidden" name="dmNotes" value={initial.dmNotes} />
            <button
              type="button"
              className="btn"
              onClick={() => setShowDmNotes(true)}
              style={{ justifySelf: "start" }}
            >
              + Add private notes
            </button>
          </>
        )}
      </fieldset>

      <div
        style={{
          display: "flex",
          gap: "0.6rem",
          flexWrap: "wrap",
          position: "sticky",
          bottom: 0,
          background: "color-mix(in srgb, var(--bg) 92%, transparent)",
          backdropFilter: "blur(8px)",
          padding: "0.85rem 0",
          borderTop: "1px solid var(--border-soft)",
        }}
      >
        <SubmitButton label={submitLabel} />
        <Link href={cancelHref} className="btn">
          Cancel
        </Link>
      </div>
    </form>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Saving…" : label}
    </button>
  );
}
