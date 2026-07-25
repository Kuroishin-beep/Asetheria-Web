import { redirect } from "next/navigation";
import { AppShell, type NavKind } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth";
import { countByKind, countLocationsByTier } from "@/lib/entries";
import { SECTIONS } from "@/lib/kinds";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [counts, tierCounts] = await Promise.all([
    countByKind(user.role),
    countLocationsByTier(user.role),
  ]);

  const sectionCount = (s: (typeof SECTIONS)[number]) =>
    s.tier ? (tierCounts[s.tier] ?? 0) : (counts[s.kind] ?? 0);

  // Hide empty sections from players so their nav isn't full of dead ends,
  // but always show everything to the DM so new kinds are reachable.
  const kinds: NavKind[] = SECTIONS.filter(
    (s) => user.role === "dm" || sectionCount(s) > 0,
  ).map((s) => ({
    slug: s.slug,
    label: s.label,
    icon: s.icon,
    count: sectionCount(s),
  }));

  return (
    <AppShell user={{ username: user.username, role: user.role }} kinds={kinds}>
      {children}
    </AppShell>
  );
}
