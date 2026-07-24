import { redirect } from "next/navigation";
import { AppShell, type NavKind } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth";
import { countByKind } from "@/lib/entries";
import { KINDS } from "@/lib/kinds";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const counts = await countByKind(user.role);

  // Hide empty sections from players so their nav isn't full of dead ends,
  // but always show everything to the DM so new kinds are reachable.
  const kinds: NavKind[] = KINDS.filter(
    (k) => user.role === "dm" || (counts[k.kind] ?? 0) > 0,
  ).map((k) => ({
    slug: k.slug,
    label: k.label,
    icon: k.icon,
    count: counts[k.kind] ?? 0,
  }));

  return (
    <AppShell user={{ username: user.username, role: user.role }} kinds={kinds}>
      {children}
    </AppShell>
  );
}
