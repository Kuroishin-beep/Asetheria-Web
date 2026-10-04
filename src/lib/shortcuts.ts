/**
 * The app's keyboard map, shared by the global shortcut handler, the command
 * palette's action list and the `?` help sheet so the three can never drift.
 *
 * Chords follow the Gmail/Superhuman convention: press `g`, then a letter.
 */
export type AppAction = {
  id: string;
  label: string;
  /** e.g. ["g", "h"] for a chord, ["c"] for a single key. */
  keys: string[];
  href?: string;
  dmOnly?: boolean;
  /** Extra words the palette matches on. */
  keywords?: string;
};

export const NAV_ACTIONS: AppAction[] = [
  { id: "home", label: "Go to the codex home", keys: ["g", "h"], href: "/", keywords: "dashboard start" },
  { id: "search", label: "Go to full-text search", keys: ["g", "s"], href: "/search", keywords: "find" },
  { id: "graph", label: "Open the connection graph", keys: ["g", "g"], href: "/graph", keywords: "obsidian links network" },
  { id: "npcs", label: "Browse NPCs", keys: ["g", "n"], href: "/codex/npcs", keywords: "characters people" },
  { id: "quests", label: "Browse quests", keys: ["g", "q"], href: "/codex/quests", keywords: "hooks adventures" },
  { id: "deities", label: "Browse deities", keys: ["g", "d"], href: "/codex/deities", keywords: "gods pantheon" },
  { id: "dice", label: "Open the dice roller", keys: ["g", "r"], href: "/tools/dice", keywords: "roll d20" },
  { id: "tables", label: "Open roll tables", keys: ["g", "t"], href: "/codex/tables", keywords: "random" },
  { id: "new", label: "Create a new entry", keys: ["c"], href: "/codex/new", dmOnly: true, keywords: "add write" },
  { id: "archive", label: "Open the archive", keys: ["g", "a"], href: "/archive", dmOnly: true, keywords: "deleted restore" },
  { id: "admin", label: "Open admin & backups", keys: ["g", "x"], href: "/admin", dmOnly: true, keywords: "import export" },
  { id: "rbac", label: "Manage players & access", keys: ["g", "p"], href: "/admin/rbac", dmOnly: true, keywords: "permissions grants" },
];

/** Keys that act on the page in front of you rather than navigating. */
export const PAGE_KEYS: { keys: string[]; label: string; dmOnly?: boolean }[] = [
  { keys: ["Ctrl", "K"], label: "Search and run commands" },
  { keys: ["/"], label: "Search" },
  { keys: ["e"], label: "Edit the entry you're reading", dmOnly: true },
  { keys: ["Ctrl", "S"], label: "Save while editing", dmOnly: true },
  { keys: ["["], label: "Type [[ in the editor to link an entry", dmOnly: true },
  { keys: ["?"], label: "Show this list" },
];

export function actionsFor(isDM: boolean): AppAction[] {
  return NAV_ACTIONS.filter((a) => isDM || !a.dmOnly);
}

/** True when a keystroke should go to a text field, not to a shortcut. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable
  );
}
