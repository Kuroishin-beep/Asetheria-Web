import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { LayoutTemplate } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { listTemplates } from "@/lib/page-templates";
import { PageHeading } from "@/components/entry-card";
import { TemplateEditor } from "@/components/template-editor";

export const metadata: Metadata = { title: "Page templates" };

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "dm") redirect("/");

  const { kind } = await searchParams;
  const templates = await listTemplates();
  const initial = templates.find((t) => t.kind === kind)?.kind ?? "npc";

  return (
    <div className="max-w-4xl">
      <PageHeading
        Icon={LayoutTemplate}
        title="Page templates"
        blurb="The text a new page starts with, for each kind. Changing a template never changes a page you have already written."
      />
      <TemplateEditor templates={templates} initialKind={initial} />
    </div>
  );
}
