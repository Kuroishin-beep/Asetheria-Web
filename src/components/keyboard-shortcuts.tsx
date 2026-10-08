"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { PAGE_KEYS, actionsFor, isTypingTarget } from "@/lib/shortcuts";

/** How long after `g` the second key of a chord is still accepted. */
const CHORD_WINDOW_MS = 1200;

/** Any open modal (the palette, this sheet, a confirmation) owns the keyboard. */
const OPEN_MODAL_SELECTOR = '[role="dialog"], [role="alertdialog"]';

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="inline-flex gap-1">
      {keys.map((k, i) => (
        <Kbd key={`${k}-${i}`}>{k}</Kbd>
      ))}
    </span>
  );
}

/**
 * Global keyboard navigation, Superhuman-style: `g` then a letter jumps to a
 * section, `c` creates, `e` edits the page in front of you, and `?` lists it
 * all. Keystrokes typed into a field are never intercepted.
 */
export function KeyboardShortcuts({ isDM }: { isDM: boolean }) {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);
  const pendingG = useRef<number | null>(null);

  useEffect(() => {
    const actions = actionsFor(isDM);

    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (document.querySelector(OPEN_MODAL_SELECTOR) && e.key !== "Escape") {
        return; // the palette or another dialog owns the keyboard
      }

      const key = e.key.toLowerCase();

      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        setHelpOpen(false);
        pendingG.current = null;
        return;
      }

      const now = Date.now();
      if (pendingG.current && now - pendingG.current < CHORD_WINDOW_MS) {
        pendingG.current = null;
        const hit = actions.find((a) => a.keys.length === 2 && a.keys[1] === key);
        if (hit?.href) {
          e.preventDefault();
          router.push(hit.href);
        }
        return;
      }
      if (key === "g") {
        pendingG.current = now;
        return;
      }

      const single = actions.find((a) => a.keys.length === 1 && a.keys[0] === key);
      if (single?.href) {
        e.preventDefault();
        router.push(single.href);
        return;
      }

      if (key === "e" && isDM) {
        const edit = document.querySelector<HTMLAnchorElement>('a[data-shortcut="edit"]');
        if (edit) {
          e.preventDefault();
          router.push(edit.getAttribute("href") ?? "/");
        }
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDM, router]);

  const nav = actionsFor(isDM);
  const page = PAGE_KEYS.filter((k) => isDM || !k.dmOnly);
  const rows = [
    ...page.map((k) => ({ keys: k.keys, label: k.label })),
    ...nav.filter((a) => a.keys.length > 0).map((a) => ({ keys: a.keys, label: a.label })),
  ];

  return (
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogTitle className="font-display text-lg font-bold tracking-tight">Keyboard shortcuts</DialogTitle>
        <DialogDescription className="sr-only">
          Every shortcut available in the codex. They never fire while you are typing in a field.
        </DialogDescription>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
          {rows.map((row) => (
            <div key={row.label} className="contents">
              <dt>
                <Keys keys={row.keys} />
              </dt>
              <dd className="text-sm text-muted-foreground">{row.label}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
