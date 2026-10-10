"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Download, FileUp, Printer, Save, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CharacterSheetView } from "@/components/character/sheet-view";
import {
  LearnMore,
  StepBackground,
  StepCitizenship,
  StepClass,
  StepEquipment,
  StepHeritage,
  StepHp,
  StepPersonality,
  StepScores,
  StepSkills,
  StepWho,
  StepWorship,
  type EmpireInfo,
} from "@/components/character/steps";
import { validateAndDerive, type CharacterInput } from "@/lib/character/engine";
import { emptyDraft, fromInput, furthestStep, loadDraft, stepProblems, STEPS, toInput, type Draft } from "@/lib/character/draft";
import { STEP_LINKS } from "@/lib/character/links";
import { parseCharacterInput } from "@/lib/character/schema";
import { cn } from "@/lib/utils";

export type CreatorMode = "public" | "member";

const STEP_INTRO: Record<string, string> = {
  who: "Let's start with the basics. Who are we making?",
  heritage: "Where does your character come from? This sets your speed and may raise some abilities.",
  class: "What do they do best? Your class decides your hit die, saving throws and skills.",
  background: "What did they do before the adventure?",
  scores: "How strong, quick, tough, clever, wise and charming are they? Choose a method, and the Asetheria house rules do the rest.",
  skills: "Which skills are they trained in?",
  hp: "How hardy are they?",
  equipment: "What do they carry?",
  citizenship: "Which empire, if any, do they call home?",
  worship: "Do they follow a god?",
  personality: "Who are they, in their own words? Everything here is optional.",
  review: "Here is the sheet. Check it, then print it, download it or save it.",
};

const storageKey = (mode: CreatorMode, userKey: string | undefined, id: string | undefined) =>
  `asetheria:character-draft:v1:${mode === "member" ? (userKey ?? "member") : "public"}${id ? `:edit:${id}` : ""}`;

/** Storage can be blocked, full or hold anything; every use is wrapped and nothing depends on it working. */
function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Not kept; the wizard still works.
  }
}

export function CharacterCreator({
  mode,
  empires,
  deities,
  existing,
  userKey,
}: {
  mode: CreatorMode;
  empires: EmpireInfo[];
  deities: string[];
  existing?: { id: string; input: CharacterInput };
  userKey?: string;
}) {
  const router = useRouter();
  const key = storageKey(mode, userKey, existing?.id);
  const [draft, setDraft] = useState<Draft>(() => (existing ? fromInput(existing.input) : emptyDraft()));
  // False until the page has hydrated: nothing is saved before then, and the root says so (data-ready) for anything that has to wait.
  const [ready, setReady] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveProblems, setSaveProblems] = useState<string[]>([]);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Pick up a saved draft after hydration (never during it, so server and client markup agree).
  useEffect(() => {
    if (!existing) setDraft(loadDraft(readStorage(key)));
    setReady(true);
  }, [existing, key]);

  // Keep the draft as it changes. It is also written the moment the page is left or reloaded, so the last change is never lost to the short delay.
  useEffect(() => {
    if (!ready) return;
    const save = () => writeStorage(key, JSON.stringify(draft));
    const timer = setTimeout(save, 250);
    window.addEventListener("pagehide", save);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pagehide", save);
    };
  }, [draft, ready, key]);

  // Move focus to the new step's heading so screen-reader and keyboard users land on it.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [draft.step]);

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const step = STEPS[draft.step];
  const problems = stepProblems(draft, step.id);
  const reachable = furthestStep(draft);

  function goTo(i: number) {
    setShowProblems(false);
    update({ step: Math.max(0, Math.min(i, STEPS.length - 1)) });
  }

  function next() {
    if (problems.length > 0) {
      setShowProblems(true);
      return;
    }
    goTo(draft.step + 1);
  }

  const result = useMemo(() => (step.id === "review" ? validateAndDerive(toInput(draft)) : null), [draft, step.id]);

  function startOver() {
    writeStorage(key, null);
    setDraft(emptyDraft());
    setShowProblems(false);
  }

  function download() {
    if (!result?.ok) return;
    const blob = new Blob([JSON.stringify({ character: toInput(draft), sheet: result.sheet }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(result.sheet?.name ?? "character").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      const parsed = parseCharacterInput(raw.character ?? raw);
      if (!parsed.ok) throw new Error(parsed.problems[0]);
      const check = validateAndDerive(parsed.value);
      if (!check.ok) throw new Error(check.problems[0]);
      setDraft(fromInput(parsed.value));
      toast.success("Character loaded");
    } catch {
      toast.error("That file is not a character this creator can read.");
    }
  }

  async function save() {
    if (!result?.ok) return;
    setSaving(true);
    setSaveProblems([]);
    try {
      const res = await fetch(existing ? `/api/characters/${existing.id}` : "/api/characters", {
        method: existing ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(toInput(draft)),
      });
      const data = (await res.json().catch(() => ({}))) as { character?: { id: string }; error?: string; problems?: string[] };
      if (!res.ok || !data.character) {
        setSaveProblems(data.problems?.length ? data.problems : [data.error ?? "The character could not be saved."]);
        return;
      }
      writeStorage(key, null);
      toast.success("Character saved");
      router.push(`/characters/${data.character.id}`);
      router.refresh();
    } catch {
      setSaveProblems(["Could not reach the server. Check your connection and try again."]);
    } finally {
      setSaving(false);
    }
  }

  const stepBody = (() => {
    const p = { draft, update };
    switch (step.id) {
      case "who":
        return <StepWho {...p} />;
      case "heritage":
        return <StepHeritage {...p} />;
      case "class":
        return <StepClass {...p} />;
      case "background":
        return <StepBackground {...p} />;
      case "scores":
        return <StepScores {...p} />;
      case "skills":
        return <StepSkills {...p} />;
      case "hp":
        return <StepHp {...p} />;
      case "equipment":
        return <StepEquipment {...p} />;
      case "citizenship":
        return <StepCitizenship {...p} empires={empires} />;
      case "worship":
        return <StepWorship {...p} deities={deities} />;
      case "personality":
        return <StepPersonality {...p} />;
      case "review":
        return null;
    }
  })();

  return (
    <div className="grid gap-6" data-testid="creator" data-ready={ready ? "true" : "false"}>
      <nav aria-label="Character creation steps" className="no-print">
        <ol className="flex flex-wrap gap-1.5" data-testid="step-list">
          {STEPS.map((s, i) => {
            const done = i < draft.step;
            const disabled = i > reachable;
            return (
              <li key={s.id}>
                <Button
                  type="button"
                  size="xs"
                  variant={i === draft.step ? "default" : "outline"}
                  aria-current={i === draft.step ? "step" : undefined}
                  disabled={disabled}
                  onClick={() => goTo(i)}
                  className={cn("rounded-full font-normal", done && "border-primary/60")}
                >
                  {i + 1}. {s.title}
                </Button>
              </li>
            );
          })}
        </ol>
        <div role="progressbar" aria-label="Character creation progress" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={draft.step + 1} className="mt-3 grid grid-flow-col gap-1" data-testid="progress">
          {STEPS.map((s, i) => (
            <span key={s.id} className={cn("h-1.5 rounded-full", i <= draft.step ? "bg-primary" : "bg-muted")} />
          ))}
        </div>
      </nav>

      {mode === "public" && (
        <Alert role="note" className="no-print">
          <AlertTitle>You are not signed in</AlertTitle>
          <AlertDescription>
            Your answers stay in this browser only. You can print the sheet or download it. If you are a player in the campaign,{" "}
            <Link href="/welcome" className="text-link underline-offset-4 hover:underline">
              enter the codex
            </Link>{" "}
            to save characters to your account.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="grid gap-4">
          <header>
            <h2 ref={headingRef} tabIndex={-1} className="font-display text-xl font-bold tracking-tight outline-none" data-testid="step-title">
              {step.title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{STEP_INTRO[step.id]}</p>
          </header>

          {stepBody}

          {step.id === "review" && (
            <div className="grid gap-4">
              {result && !result.ok && (
                <Alert variant="destructive" role="alert" data-testid="review-problems">
                  <AlertTitle>This character is not complete yet</AlertTitle>
                  <AlertDescription>
                    <ul className="mt-1 list-disc pl-4">
                      {result.problems.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                    <p className="mt-2">Use the step buttons above to go back and fix them.</p>
                  </AlertDescription>
                </Alert>
              )}
              {result?.ok && result.sheet && <CharacterSheetView sheet={result.sheet} input={toInput(draft)} />}
            </div>
          )}

          {showProblems && problems.length > 0 && (
            <Alert variant="destructive" role="alert" data-testid="step-problems">
              <AlertTitle>One more thing before you continue</AlertTitle>
              <AlertDescription>
                <ul className="mt-1 list-disc pl-4">
                  {problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {saveProblems.length > 0 && (
            <Alert variant="destructive" role="alert" data-testid="save-problems">
              <AlertTitle>The character could not be saved</AlertTitle>
              <AlertDescription>
                <ul className="mt-1 list-disc pl-4">
                  {saveProblems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {step.id !== "heritage" && step.id !== "class" && step.id !== "background" && step.id !== "citizenship" && <LearnMore links={STEP_LINKS[step.id] ?? []} />}
        </CardContent>
      </Card>

      <div className="no-print flex flex-wrap items-center gap-2" data-testid="step-actions">
        <Button type="button" variant="outline" onClick={() => goTo(draft.step - 1)} disabled={draft.step === 0}>
          <ArrowLeft aria-hidden="true" />
          Back
        </Button>
        {step.id !== "review" ? (
          <Button type="button" onClick={next} data-testid="next">
            Next
            <ArrowRight aria-hidden="true" />
          </Button>
        ) : (
          <>
            <Button type="button" variant="outline" onClick={() => window.print()} disabled={!result?.ok}>
              <Printer aria-hidden="true" />
              Print or save as PDF
            </Button>
            <Button type="button" variant="outline" onClick={download} disabled={!result?.ok} data-testid="download">
              <Download aria-hidden="true" />
              Download JSON
            </Button>
            {mode === "member" && (
              <Button type="button" onClick={save} disabled={!result?.ok || saving} data-testid="save-character">
                <Save aria-hidden="true" />
                {saving ? "Saving…" : existing ? "Save changes" : "Save to my characters"}
              </Button>
            )}
          </>
        )}

        <span className="ml-auto flex flex-wrap items-center gap-2">
          {draft.step === 0 && (
            <>
              <Label htmlFor="import-character" className="sr-only">
                Load a character from a JSON file
              </Label>
              <span className="inline-flex items-center gap-2">
                <FileUp aria-hidden="true" className="size-4 text-muted-foreground" />
                <Input id="import-character" type="file" accept="application/json,.json" className="h-8 max-w-56 text-xs" onChange={(e) => importFile(e.target.files?.[0])} />
              </span>
            </>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="ghost" size="sm">
                <Trash2 aria-hidden="true" />
                Start over
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Start over?</AlertDialogTitle>
                <AlertDialogDescription>This clears every answer on this page. A saved character is not affected.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep going</AlertDialogCancel>
                <AlertDialogAction onClick={startOver}>Start over</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </span>
      </div>
    </div>
  );
}
