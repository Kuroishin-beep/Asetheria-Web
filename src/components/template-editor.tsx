"use client";

import { useState } from "react";
import { toast } from "sonner";
import { RotateCcw, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

type Template = {
  kind: string;
  label: string;
  singular: string;
  body: string;
  dmNotes: string;
  custom: boolean;
  defaultBody: string;
  defaultDmNotes: string;
};

const LIMIT = 20_000;

/**
 * The DM's editor for what a new page of each kind starts with. The built-in default is always one click
 * away ("Reset to default"), and nothing here touches a page that already exists.
 */
export function TemplateEditor({ templates: initial, initialKind }: { templates: Template[]; initialKind: string }) {
  const [templates, setTemplates] = useState(initial);
  const [kind, setKind] = useState(initialKind);
  const current = templates.find((t) => t.kind === kind) ?? templates[0];
  const [body, setBody] = useState(current.body);
  const [dmNotes, setDmNotes] = useState(current.dmNotes);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const changed = body !== current.body || dmNotes !== current.dmNotes;

  function choose(next: string) {
    const t = templates.find((x) => x.kind === next);
    if (!t) return;
    setKind(next);
    setBody(t.body);
    setDmNotes(t.dmNotes);
    setError(null);
  }

  async function send(method: "PUT" | "DELETE") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/templates/${kind}`, {
        method,
        headers: { "content-type": "application/json" },
        body: method === "PUT" ? JSON.stringify({ body, dmNotes }) : undefined,
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "Could not save the template.");
        return;
      }
      if (method === "PUT") {
        setTemplates((all) => all.map((t) => (t.kind === kind ? { ...t, body, dmNotes, custom: true } : t)));
        toast.success(`New ${current.singular} pages will start with this text`);
      } else {
        setTemplates((all) => all.map((t) => (t.kind === kind ? { ...t, body: t.defaultBody, dmNotes: t.defaultDmNotes, custom: false } : t)));
        setBody(current.defaultBody);
        setDmNotes(current.defaultDmNotes);
        toast.success(`Back to the default for ${current.singular} pages`);
      }
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="grid gap-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className="grid gap-1">
            <Label htmlFor="template-kind">Kind of page</Label>
            <NativeSelect id="template-kind" value={kind} onChange={(e) => choose(e.target.value)} disabled={busy}>
              {templates.map((t) => (
                <NativeSelectOption key={t.kind} value={t.kind}>
                  {t.singular}
                  {t.custom ? " (yours)" : ""}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <Badge variant={current.custom ? "default" : "secondary"} data-testid="template-state">
            {current.custom ? "Your version" : "Built-in default"}
          </Badge>
        </div>

        <div className="grid gap-1">
          <Label htmlFor="template-body">Description (shown to players who can read the page)</Label>
          <Textarea id="template-body" value={body} onChange={(e) => setBody(e.target.value)} className="min-h-48 font-mono text-sm" maxLength={LIMIT * 2} />
          <p className="text-[13px] text-muted-foreground">
            Markdown. A passage between <code className="rounded bg-muted px-1">:::secret</code> and <code className="rounded bg-muted px-1">:::</code> becomes
            a secret block on every new page. {body.length.toLocaleString("en")} of {LIMIT.toLocaleString("en")} characters.
          </p>
        </div>

        <div className="grid gap-1">
          <Label htmlFor="template-notes">DM notes (never shown to players)</Label>
          <Textarea id="template-notes" value={dmNotes} onChange={(e) => setDmNotes(e.target.value)} className="min-h-32 font-mono text-sm" maxLength={LIMIT * 2} />
          <p className="text-[13px] text-muted-foreground">{dmNotes.length.toLocaleString("en")} of {LIMIT.toLocaleString("en")} characters.</p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive" data-testid="template-error">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => send("PUT")} disabled={busy || !changed} data-testid="template-save">
            <Save aria-hidden="true" />
            Save template
          </Button>
          <Button type="button" variant="outline" onClick={() => send("DELETE")} disabled={busy || !current.custom} data-testid="template-reset">
            <RotateCcw aria-hidden="true" />
            Reset to default
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
