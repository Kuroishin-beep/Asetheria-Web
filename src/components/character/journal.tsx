"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WORLD_LIMITS } from "@/lib/character/world-core";

export type ViewJournalEntry = { id: string; title: string; body: string; createdAt: string; updatedAt: string };

const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

/**
 * A character's private journal. Its player writes, edits and deletes; the DM only reads (and is told so).
 * Nothing here is on the party roster, and it is left out of the printed sheet.
 */
export function CharacterJournal({ characterId, entries, canWrite }: { characterId: string; entries: ViewJournalEntry[]; canWrite: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(url: string, method: "POST" | "PATCH", payload: { title: string; body: string }, done: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = (await res.json().catch(() => null)) as { error?: string; problems?: string[] } | null;
      if (!res.ok) {
        setError([data?.error, ...(data?.problems ?? [])].filter(Boolean).join(" "));
        return false;
      }
      toast.success(done);
      router.refresh();
      return true;
    } catch {
      setError("The entry could not be saved. Check your connection and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (await send(`/api/characters/${characterId}/journal`, "POST", { title, body }, "Entry added")) {
      setTitle("");
      setBody("");
    }
  }

  async function remove(id: string) {
    try {
      const res = await fetch(`/api/characters/${characterId}/journal/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("failed");
      toast.success("Entry deleted");
      router.refresh();
    } catch {
      toast.error("The entry could not be deleted. Try again.");
    }
  }

  return (
    <Card className="no-print" data-testid="journal">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display text-lg">
          <BookOpen aria-hidden="true" className="size-5 text-gold" />
          Journal
        </CardTitle>
        <p className="text-sm text-muted-foreground">{canWrite ? "Private: only you and the DM can read this." : "Private to this character's player and you."}</p>
      </CardHeader>
      <CardContent className="grid gap-5">
        {canWrite && (
          <form onSubmit={add} className="grid gap-3" aria-label="Add a journal entry">
            <div className="grid gap-1.5">
              <Label htmlFor="journal-title">Title (optional)</Label>
              <Input id="journal-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={WORLD_LIMITS.journalTitle} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="journal-body">What happened</Label>
              <Textarea id="journal-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={WORLD_LIMITS.journalBody} rows={4} />
              <p className="text-xs text-muted-foreground">
                {body.length} / {WORLD_LIMITS.journalBody}
              </p>
            </div>
            {error && editing === null && (
              <p role="alert" className="text-sm text-destructive" data-testid="journal-error">
                {error}
              </p>
            )}
            <div>
              <Button type="submit" disabled={busy || body.trim() === ""} data-testid="journal-add">
                <Plus aria-hidden="true" />
                Add entry
              </Button>
            </div>
          </form>
        )}

        {entries.length === 0 ? (
          <div className="grid justify-items-center gap-2 rounded-xl border border-dashed border-border p-6 text-center" data-testid="journal-empty">
            <BookOpen aria-hidden="true" className="size-8 text-muted-foreground" />
            <p className="font-display text-base font-bold">{canWrite ? "Your journal is empty" : "Nothing written yet"}</p>
            <p className="text-sm text-muted-foreground">{canWrite ? "Write down what your character did, saw and swore to do." : "When the player writes an entry it will appear here."}</p>
          </div>
        ) : (
          <ol className="grid gap-3" aria-label="Journal entries" data-testid="journal-entries">
            {entries.map((entry) => (
              <li key={entry.id} className="rounded-xl border border-border p-4" data-journal-entry={entry.id}>
                {editing === entry.id ? (
                  <EditEntry
                    entry={entry}
                    busy={busy}
                    error={error}
                    onCancel={() => {
                      setEditing(null);
                      setError(null);
                    }}
                    onSave={async (payload) => {
                      if (await send(`/api/characters/${characterId}/journal/${entry.id}`, "PATCH", payload, "Entry saved")) setEditing(null);
                    }}
                  />
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        {entry.title && <h3 className="font-display text-base font-bold">{entry.title}</h3>}
                        <p className="text-xs text-faint-foreground">{when(entry.createdAt)}</p>
                      </div>
                      {canWrite && (
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(entry.id)} aria-label={`Edit the entry ${entry.title || when(entry.createdAt)}`}>
                            <Pencil aria-hidden="true" />
                            Edit
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button type="button" variant="outline" size="sm" aria-label={`Delete the entry ${entry.title || when(entry.createdAt)}`}>
                                <Trash2 aria-hidden="true" />
                                Delete
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
                                <AlertDialogDescription>It is removed from your journal for good.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Keep it</AlertDialogCancel>
                                <AlertDialogAction onClick={() => remove(entry.id)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      )}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{entry.body}</p>
                  </>
                )}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function EditEntry({ entry, busy, error, onCancel, onSave }: { entry: ViewJournalEntry; busy: boolean; error: string | null; onCancel: () => void; onSave: (p: { title: string; body: string }) => void }) {
  const [title, setTitle] = useState(entry.title);
  const [body, setBody] = useState(entry.body);
  return (
    <form
      className="grid gap-3"
      aria-label="Edit the journal entry"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ title, body });
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor={`edit-title-${entry.id}`}>Title (optional)</Label>
        <Input id={`edit-title-${entry.id}`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={WORLD_LIMITS.journalTitle} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`edit-body-${entry.id}`}>What happened</Label>
        <Textarea id={`edit-body-${entry.id}`} value={body} onChange={(e) => setBody(e.target.value)} maxLength={WORLD_LIMITS.journalBody} rows={4} />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive" data-testid="journal-error">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || body.trim() === ""} data-testid="journal-save">
          Save
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
