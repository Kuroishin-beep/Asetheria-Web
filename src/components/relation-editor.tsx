"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { RELATION_LIMITS, RELATION_TYPES, RELATION_TYPE_KEYS, type RelationType } from "@/lib/relations-core";

type Found = { id: string; slug: string; name: string; kind: string };

/** Every way a relation can be read from this page: "Parent of" and "Child of" are one relation seen from either end. */
const PHRASES = RELATION_TYPE_KEYS.flatMap((type) => {
  const def = RELATION_TYPES[type];
  return def.reverse
    ? [
        { value: `${type}:fwd`, label: def.label, type, flip: false },
        { value: `${type}:rev`, label: def.reverse, type, flip: true },
      ]
    : [{ value: `${type}:fwd`, label: def.label, type, flip: false }];
});

/** The DM's form for adding a relation from this page to another, and a button to remove one. */
export function RelationEditor({ entryId }: { entryId: string }) {
  const router = useRouter();
  const [phrase, setPhrase] = useState(PHRASES[0].value);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  const [other, setOther] = useState<Found | null>(null);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const request = useRef(0);

  useEffect(() => {
    if (other || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const id = ++request.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/find?q=${encodeURIComponent(query.trim())}`);
        const data = (await res.json()) as { results?: Found[] };
        if (id === request.current) setResults((data.results ?? []).filter((r) => r.id !== entryId).slice(0, 8));
      } catch {
        if (id === request.current) setResults([]);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [query, other, entryId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!other) {
      setErrors(["Choose the other page first: type its name and pick it from the list."]);
      return;
    }
    const p = PHRASES.find((x) => x.value === phrase) ?? PHRASES[0];
    setBusy(true);
    setErrors([]);
    try {
      const res = await fetch("/api/relations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fromId: p.flip ? other.id : entryId, toId: p.flip ? entryId : other.id, type: p.type satisfies RelationType, note }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; errors?: string[] } | null;
      if (!res.ok) {
        setErrors(data?.errors ?? [data?.error ?? "Could not add the relation."]);
        return;
      }
      toast.success("Relation added");
      setOther(null);
      setQuery("");
      setNote("");
      router.refresh();
    } catch {
      setErrors(["Could not reach the server. Check your connection and try again."]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="no-print mt-4 grid gap-3 rounded-lg border border-dashed border-border p-3" aria-label="Add a relation" noValidate>
      <div className="grid gap-1">
        <Label htmlFor="relation-phrase">This page is</Label>
        <NativeSelect id="relation-phrase" value={phrase} onChange={(e) => setPhrase(e.target.value)}>
          {PHRASES.map((p) => (
            <NativeSelectOption key={p.value} value={p.value}>
              {p.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="relation-find">The other page</Label>
        {other ? (
          <div className="flex items-center gap-2" data-testid="relation-chosen">
            <span className="rounded-md bg-muted px-2 py-1 text-sm">
              {other.name} <span className="text-muted-foreground">({other.kind})</span>
            </span>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Choose a different page" onClick={() => setOther(null)}>
              <X aria-hidden="true" />
            </Button>
          </div>
        ) : (
          <>
            <Input id="relation-find" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Start typing a name" autoComplete="off" />
            {results.length > 0 && (
              <ul className="grid gap-1" role="listbox" aria-label="Matching pages">
                {results.map((r) => (
                  <li key={r.id} role="option" aria-selected={false}>
                    <Button type="button" variant="outline" size="sm" className="w-full justify-start" onClick={() => setOther(r)} data-testid="relation-result">
                      {r.name} <span className="text-muted-foreground">({r.kind})</span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      <div className="grid gap-1">
        <Label htmlFor="relation-note">Note (optional)</Label>
        <Input id="relation-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={RELATION_LIMITS.noteLength + 50} />
      </div>
      {errors.length > 0 && (
        <ul role="alert" className="list-disc pl-5 text-sm text-destructive" data-testid="relation-errors">
          {errors.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      <div>
        <Button type="submit" size="sm" disabled={busy} data-testid="relation-add">
          <Plus aria-hidden="true" />
          Add relation
        </Button>
      </div>
    </form>
  );
}

export function RemoveRelationButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/relations/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Could not remove the relation.");
        return;
      }
      toast.success("Relation removed");
      router.refresh();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove: ${label}`} disabled={busy} onClick={remove} data-testid="relation-remove">
      <X aria-hidden="true" />
    </Button>
  );
}
