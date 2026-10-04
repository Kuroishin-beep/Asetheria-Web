"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { motion } from "motion/react";
import { LogOut, Menu, Plus, ShieldCheck, User } from "lucide-react";
import type { EntryKind } from "@/db/schema";
import { CommandPalette } from "@/components/command-palette";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { pageTransition } from "@/lib/motion";
import { iconForSection, KEEPER_ICONS, TOOL_ICONS } from "@/lib/section-icons";
import { cn } from "@/lib/utils";

export type NavKind = {
  slug: string;
  label: string;
  kind: EntryKind;
  count: number;
};

export type ShellUser = {
  username: string;
  role: "dm" | "player";
  displayName?: string | null;
};

type NavIcon = ComponentType<{ className?: string }>;

const TOOL_LINKS: { href: string; label: string; Icon: NavIcon }[] = [
  { href: "/graph", label: "Graph", Icon: TOOL_ICONS.graph },
  { href: "/tools/dice", label: "Dice", Icon: TOOL_ICONS.dice },
];

const KEEPER_LINKS: { href: string; label: string; Icon: NavIcon }[] = [
  { href: "/archive", label: "Archive", Icon: KEEPER_ICONS.archive },
  { href: "/admin", label: "Backup & Import", Icon: KEEPER_ICONS.backup },
  { href: "/admin/rbac", label: "Players & Access", Icon: KEEPER_ICONS.access },
];

export function AppShell({
  user,
  kinds,
  children,
}: {
  user: ShellUser;
  kinds: NavKind[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  // Any navigation closes the mobile drawer.
  useEffect(() => setMenuOpen(false), [pathname]);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/welcome");
    router.refresh();
  }

  const isDM = user.role === "dm";
  const who = user.displayName || user.username;

  const sidebar = (
    <nav aria-label="Codex sections" className="flex flex-col gap-6 p-3">
      <NavGroup label="Codex">
        {kinds.map((k) => (
          <NavItem
            key={k.slug}
            href={`/codex/${k.slug}`}
            active={pathname === `/codex/${k.slug}`}
            Icon={iconForSection(k.slug, k.kind)}
            label={k.label}
            trailing={k.count > 0 ? String(k.count) : undefined}
          />
        ))}
      </NavGroup>

      <NavGroup label="Tools">
        {TOOL_LINKS.map(({ href, label, Icon }) => (
          <NavItem key={href} href={href} active={pathname.startsWith(href)} Icon={Icon} label={label} />
        ))}
      </NavGroup>

      {isDM && (
        <NavGroup label="Keeper">
          {KEEPER_LINKS.map(({ href, label, Icon }) => (
            <NavItem key={href} href={href} active={pathname === href} Icon={Icon} label={label} />
          ))}
        </NavGroup>
      )}
    </nav>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          Skip to content
        </a>

        {/* ---- Top bar ---- */}
        <header className="no-print sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
          <div className="mx-auto flex h-12 max-w-[100rem] items-center gap-2 px-4 sm:gap-3">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="lg:hidden"
                  aria-label="Toggle navigation menu"
                >
                  <Menu aria-hidden="true" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[17rem] gap-0 p-0 sm:max-w-[17rem]">
                <SheetHeader className="border-b border-border p-4">
                  <SheetTitle className="font-display text-base text-gold">Asetheria</SheetTitle>
                  <SheetDescription className="sr-only">Browse the codex sections and tools.</SheetDescription>
                </SheetHeader>
                <ScrollArea className="min-h-0 flex-1">{sidebar}</ScrollArea>
              </SheetContent>
            </Sheet>

            <Link
              href="/"
              className="font-display truncate text-base font-bold tracking-tight text-gold hover:text-gold-soft"
            >
              <span className="hidden sm:inline">The Continent of </span>Asetheria
            </Link>

            <div className="flex-1" />

            <CommandPalette isDM={isDM} />
            <KeyboardShortcuts isDM={isDM} />

            {isDM && (
              <Button asChild>
                <Link href="/codex/new">
                  <Plus aria-hidden="true" />
                  <span className="hidden sm:inline">New</span>
                </Link>
              </Button>
            )}

            <ThemeToggle />

            <div className="flex items-center gap-2 border-l border-border pl-2 sm:pl-3">
              <Badge
                variant="outline"
                className="hidden gap-1 md:inline-flex"
                title={isDM ? "Full edit access" : "Read-only access"}
              >
                {isDM ? (
                  <ShieldCheck aria-hidden="true" className="size-3" />
                ) : (
                  <User aria-hidden="true" className="size-3" />
                )}
                {isDM ? "DM" : "Player"}
              </Badge>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={signOut}
                title={`Sign out (${who})`}
                aria-label={`Sign out, signed in as ${who}`}
              >
                <LogOut aria-hidden="true" />
              </Button>
            </div>
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-[100rem] flex-1">
          {/* ---- Desktop sidebar ---- */}
          <aside className="no-print sticky top-12 hidden h-[calc(100dvh-3rem)] w-60 shrink-0 self-start border-r border-border lg:block">
            <ScrollArea className="h-full">{sidebar}</ScrollArea>
          </aside>

          <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 pb-16 pt-6 outline-none">
            <motion.div key={pathname} variants={pageTransition} initial="hidden" animate="visible">
              {children}
            </motion.div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

function NavGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.09em] text-faint-foreground">{label}</p>
      <ul className="grid gap-1">{children}</ul>
    </div>
  );
}

function NavItem({
  href,
  active,
  Icon,
  label,
  trailing,
}: {
  href: string;
  active: boolean;
  Icon: NavIcon;
  label: string;
  trailing?: string;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-150",
          "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          active && "bg-accent font-semibold text-foreground",
        )}
      >
        {active && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-1 rounded-full bg-primary" />}
        <Icon
          aria-hidden="true"
          className={cn("size-4 shrink-0", active ? "text-gold" : "text-faint-foreground group-hover:text-accent-foreground")}
        />
        <span className="flex-1 truncate">{label}</span>
        {trailing && (
          <span
            className={cn(
              "text-[11px] tabular-nums",
              active ? "text-muted-foreground" : "text-faint-foreground group-hover:text-muted-foreground",
            )}
          >
            {trailing}
          </span>
        )}
      </Link>
    </li>
  );
}
