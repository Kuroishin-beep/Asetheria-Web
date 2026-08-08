"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CommandPalette } from "@/components/command-palette";
import { ThemeToggle } from "@/components/theme-toggle";

export type NavKind = {
  slug: string;
  label: string;
  icon: string;
  count: number;
};

export type ShellUser = { username: string; role: "dm" | "player" };

const TOOL_LINKS = [
  { href: "/tools/dice", label: "Dice", icon: "🎲" },
  { href: "/tools/tables", label: "Random Tables", icon: "🎰" },
];

export function AppShell({
  user,
  kinds,
  children,
}: {
  user: ShellUser;
  kinds: NavKind[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  // Any navigation closes the mobile drawer.
  useEffect(() => setMenuOpen(false), [pathname]);

  // Prevent the page behind the drawer from scrolling.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/welcome");
    router.refresh();
  }

  const isDM = user.role === "dm";

  const sidebar = (
    <nav aria-label="Codex sections" style={{ padding: "1rem 0.75rem" }}>
      <SectionLabel>Codex</SectionLabel>
      <ul style={{ display: "grid", gap: 1, marginBottom: "1.25rem" }}>
        {kinds.map((k) => (
          <li key={k.slug}>
            <NavItem
              href={`/codex/${k.slug}`}
              active={pathname === `/codex/${k.slug}`}
              icon={k.icon}
              label={k.label}
              trailing={k.count > 0 ? String(k.count) : undefined}
            />
          </li>
        ))}
      </ul>

      <SectionLabel>Tools</SectionLabel>
      <ul style={{ display: "grid", gap: 1, marginBottom: "1.25rem" }}>
        {TOOL_LINKS.map((t) => (
          <li key={t.href}>
            <NavItem
              href={t.href}
              active={pathname.startsWith(t.href)}
              icon={t.icon}
              label={t.label}
            />
          </li>
        ))}
      </ul>

      {isDM && (
        <>
          <SectionLabel>Keeper</SectionLabel>
          <ul style={{ display: "grid", gap: 1 }}>
            <li>
              <NavItem
                href="/archive"
                active={pathname === "/archive"}
                icon="🗄"
                label="Archive"
              />
            </li>
            <li>
              <NavItem
                href="/admin"
                active={pathname === "/admin"}
                icon="⚙"
                label="Backup & Import"
              />
            </li>
          </ul>
        </>
      )}
    </nav>
  );

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      {/* ---- Top bar ---- */}
      <header
        className="no-print"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "color-mix(in srgb, var(--bg) 88%, transparent)",
          backdropFilter: "blur(10px)",
          borderBottom: "1px solid var(--border-soft)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            padding: "0.6rem 1rem",
            maxWidth: "100rem",
            margin: "0 auto",
          }}
        >
          <button
            type="button"
            className="btn lg:hidden"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-label="Toggle navigation menu"
            style={{ padding: "0.4rem 0.6rem" }}
          >
            <span aria-hidden="true">{menuOpen ? "✕" : "☰"}</span>
          </button>

          <Link
            href="/"
            className="font-display"
            style={{
              fontSize: "1.05rem",
              fontWeight: 700,
              color: "var(--accent)",
              textDecoration: "none",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            <span className="hidden sm:inline">The Continent of </span>Asetheria
          </Link>

          <div style={{ flex: 1 }} />

          <CommandPalette />

          {isDM && (
            <Link href="/codex/new" className="btn btn-primary">
              <span aria-hidden="true">+</span>
              <span className="hidden sm:inline">New</span>
            </Link>
          )}

          <ThemeToggle />

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              paddingLeft: "0.5rem",
              borderLeft: "1px solid var(--border-soft)",
            }}
          >
            <span
              className="hidden md:flex chip"
              title={isDM ? "Full edit access" : "Read-only access"}
            >
              {isDM ? "⚜ DM" : "☗ Player"}
            </span>
            <button
              type="button"
              onClick={signOut}
              className="btn"
              style={{ padding: "0.4rem 0.6rem" }}
              title={`Sign out (${user.username})`}
              aria-label={`Sign out, signed in as ${user.username}`}
            >
              <span aria-hidden="true">⏻</span>
            </button>
          </div>
        </div>
      </header>

      <div
        style={{
          flex: 1,
          display: "flex",
          maxWidth: "100rem",
          margin: "0 auto",
          width: "100%",
        }}
      >
        {/* ---- Desktop sidebar ---- */}
        <aside
          className="hidden lg:block no-print"
          style={{
            width: "15rem",
            flexShrink: 0,
            borderRight: "1px solid var(--border-soft)",
            position: "sticky",
            top: "3.25rem",
            alignSelf: "flex-start",
            maxHeight: "calc(100dvh - 3.25rem)",
            overflowY: "auto",
          }}
        >
          {sidebar}
        </aside>

        {/* ---- Mobile drawer ---- */}
        {menuOpen && (
          <div
            className="lg:hidden no-print"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setMenuOpen(false);
            }}
            style={{
              position: "fixed",
              inset: "3.25rem 0 0",
              zIndex: 40,
              background: "rgb(0 0 0 / 0.5)",
            }}
          >
            <div
              style={{
                width: "min(17rem, 82vw)",
                height: "100%",
                overflowY: "auto",
                background: "var(--bg-raised)",
                borderRight: "1px solid var(--border)",
              }}
            >
              {sidebar}
            </div>
          </div>
        )}

        <main style={{ flex: 1, minWidth: 0, padding: "1.5rem 1rem 4rem" }}>
          {children}
        </main>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: "0.6875rem",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.09em",
        color: "var(--text-faint)",
        padding: "0 0.6rem",
        marginBottom: "0.4rem",
      }}
    >
      {children}
    </p>
  );
}

function NavItem({
  href,
  active,
  icon,
  label,
  trailing,
}: {
  href: string;
  active: boolean;
  icon: string;
  label: string;
  trailing?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.6rem",
        padding: "0.4rem 0.6rem",
        borderRadius: 7,
        textDecoration: "none",
        fontSize: "0.875rem",
        color: active ? "var(--accent)" : "var(--text-muted)",
        background: active ? "var(--bg-sunken)" : "transparent",
        fontWeight: active ? 600 : 400,
      }}
    >
      <span aria-hidden="true" style={{ width: "1.1rem", textAlign: "center" }}>
        {icon}
      </span>
      <span
        style={{
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      {trailing && (
        <span style={{ fontSize: "0.6875rem", color: "var(--text-faint)" }}>
          {trailing}
        </span>
      )}
    </Link>
  );
}
