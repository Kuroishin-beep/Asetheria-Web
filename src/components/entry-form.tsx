"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { EyeOff, Loader2, Plus } from "lucide-react";
import type { EntryKind } from "@/db/schema";
import { MarkdownEditor, clearDraft } from "@/components/markdown-editor";
import { FormMessage } from "@/components/shared/form-message";
import { FormSection } from "@/components/shared/form-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { KINDS, KIND_BY_KEY } from "@/lib/kinds";

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

const VISIBILITY_OPTIONS = [
  { value: "public", label: "Everyone", hint: "Players see this entry in their codex." },
  { value: "secret", label: "DM only", hint: "Hidden from players everywhere: lists, search, and links." },
  { value: "revealed", label: "Revealed", hint: "Was a secret, now deliberately shown to the party." },
] as const;

const TWO_COLUMN_GRID = "grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-4";

function Field({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

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
  const [state, formAction] = useActionState<ActionState, FormData>(action, undefined);
  const [kind, setKind] = useState<EntryKind>(initial.kind);
  const [showDmNotes, setShowDmNotes] = useState(
    Boolean(initial.dmNotes) || initial.visibility === "secret",
  );

  const def = KIND_BY_KEY[kind];
  const formRef = useRef<HTMLFormElement>(null);
  const draftKey = initial.id ?? "new";

  // Ctrl/Cmd+S saves, the way every editor people already use does.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Properties captured on import that this kind doesn't define are surfaced so
  // they remain editable instead of being invisibly carried along. `aliases`
  // has its own input under Identity.
  const extraFieldKeys = useMemo(() => {
    const known = new Set([...(def?.fields.map((f) => f.key) ?? []), "aliases"]);
    return Object.keys(initial.fields).filter((k) => !known.has(k) && initial.fields[k]);
  }, [def, initial.fields]);

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={() => clearDraft(draftKey)}
      className="grid gap-6"
    >
      {state?.error && <FormMessage>{state.error}</FormMessage>}

      {/* ---- Identity ---- */}
      <FormSection title="Identity">
        <div className={TWO_COLUMN_GRID}>
          <Field label="Name *" htmlFor="name">
            <Input
              id="name"
              name="name"
              defaultValue={initial.name}
              required
              maxLength={300}
              autoFocus={!initial.id}
            />
          </Field>

          <Field label="Type" htmlFor="kind">
            <NativeSelect
              id="kind"
              name="kind"
              className="w-full"
              value={kind}
              onChange={(e) => setKind(e.target.value as EntryKind)}
            >
              {KINDS.map((k) => (
                <NativeSelectOption key={k.kind} value={k.kind}>
                  {k.singular}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </div>

        <Field label="Also known as" htmlFor="aliases">
          <Input
            id="aliases"
            name="fields[aliases]"
            defaultValue={initial.fields.aliases ?? ""}
            maxLength={600}
            placeholder="Other spellings or names, comma separated. [[links]] to any of them resolve here"
          />
        </Field>

        <Field label="Summary" htmlFor="summary">
          <Input
            id="summary"
            name="summary"
            defaultValue={initial.summary}
            maxLength={600}
            placeholder="One line shown in lists and search results"
          />
        </Field>

        <div className={TWO_COLUMN_GRID}>
          <Field label="Tags" htmlFor="tags">
            <Input id="tags" name="tags" defaultValue={initial.tags.join(", ")} placeholder="Comma separated" />
          </Field>

          <Field label="Belongs to" htmlFor="parentId">
            <NativeSelect id="parentId" name="parentId" className="w-full" defaultValue={initial.parentId ?? ""}>
              <NativeSelectOption value="">Nothing</NativeSelectOption>
              {parents.map((p) => (
                <NativeSelectOption key={p.id} value={p.id}>
                  {p.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </div>
      </FormSection>

      {/* ---- Visibility ---- */}
      <FormSection title="Who can see this">
        <RadioGroup name="visibility" defaultValue={initial.visibility} className="gap-3">
          {VISIBILITY_OPTIONS.map((opt) => (
            <div key={opt.value} className="flex items-start gap-3">
              <RadioGroupItem
                id={`visibility-${opt.value}`}
                value={opt.value}
                aria-describedby={`visibility-${opt.value}-hint`}
                className="mt-0.5"
              />
              <div className="grid gap-0.5">
                <Label htmlFor={`visibility-${opt.value}`} className="text-[15px] font-medium">
                  {opt.label}
                </Label>
                <p id={`visibility-${opt.value}-hint`} className="text-[13px] text-muted-foreground">
                  {opt.hint}
                </p>
              </div>
            </div>
          ))}
        </RadioGroup>
      </FormSection>

      {/* ---- Kind-specific properties ---- */}
      {(def?.fields.length ?? 0) > 0 || extraFieldKeys.length > 0 ? (
        <FormSection title={`${def?.singular} details`}>
          <div className={TWO_COLUMN_GRID}>
            {def?.fields.map((f) => (
              <div key={f.key} className={f.type === "textarea" ? "col-span-full" : undefined}>
                <Field label={f.label} htmlFor={`field-${f.key}`}>
                  {f.type === "textarea" ? (
                    <Textarea
                      id={`field-${f.key}`}
                      name={`fields[${f.key}]`}
                      className="min-h-20"
                      defaultValue={initial.fields[f.key] ?? ""}
                      placeholder={f.placeholder}
                    />
                  ) : (
                    <Input
                      id={`field-${f.key}`}
                      name={`fields[${f.key}]`}
                      defaultValue={initial.fields[f.key] ?? ""}
                      placeholder={f.placeholder}
                    />
                  )}
                </Field>
              </div>
            ))}

            {extraFieldKeys.map((k) => (
              <Field
                key={k}
                label={`${k.replace(/([A-Z])/g, " $1").replace(/_/g, " ")} (imported)`}
                htmlFor={`field-${k}`}
              >
                <Input id={`field-${k}`} name={`fields[${k}]`} defaultValue={initial.fields[k]} />
              </Field>
            ))}
          </div>
        </FormSection>
      ) : null}

      {/* ---- Body ---- */}
      <FormSection title="Description">
        <p className="text-[13px] text-muted-foreground">
          Markdown works. Type <code className="rounded bg-muted px-1">[[Aeterna City]]</code> to link another
          entry; suggestions appear as you type, and the link shows up on both pages. Ctrl+S saves.
        </p>
        <MarkdownEditor id="body" name="body" defaultValue={initial.body} draftKey={draftKey} />
      </FormSection>

      {/* ---- DM notes ---- */}
      <FormSection
        tone="secret"
        title={
          <>
            <EyeOff aria-hidden="true" className="size-4" />
            DM notes
          </>
        }
      >
        {showDmNotes ? (
          <>
            <p className="text-[13px] text-muted-foreground">
              Never sent to a player, even when the entry itself is public.
            </p>
            <Textarea
              id="dmNotes"
              name="dmNotes"
              aria-label="DM notes"
              className="min-h-36 font-prose text-base"
              defaultValue={initial.dmNotes}
              placeholder="The innkeeper is a doppelganger. The vault key is behind the painting."
            />
          </>
        ) : (
          <>
            <input type="hidden" name="dmNotes" value={initial.dmNotes} />
            <Button type="button" variant="outline" className="justify-self-start" onClick={() => setShowDmNotes(true)}>
              <Plus aria-hidden="true" />
              Add private notes
            </Button>
          </>
        )}
      </FormSection>

      <div className="sticky bottom-0 flex flex-wrap gap-3 border-t border-border bg-background/90 py-3 backdrop-blur-md">
        <SubmitButton label={submitLabel} />
        <Button asChild variant="outline">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 aria-hidden="true" className="animate-spin" />}
      {pending ? "Saving…" : label}
    </Button>
  );
}
