import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { AuthError, requireDM } from "@/lib/auth";
import { isKind, resetTemplate, saveTemplate, TEMPLATE_LIMIT } from "@/lib/page-templates";

export const runtime = "nodejs";

const bodySchema = z.object({ body: z.string().max(TEMPLATE_LIMIT * 2), dmNotes: z.string().max(TEMPLATE_LIMIT * 2) }).strict();

async function authorize() {
  try {
    return { dm: await requireDM() };
  } catch (e) {
    if (e instanceof AuthError) return { response: NextResponse.json({ error: e.message }, { status: e.status }) };
    throw e;
  }
}

/** Saves the DM's own starting text for a kind of page. DM only. */
export async function PUT(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const auth = await authorize();
  if (auth.response) return auth.response;
  const { kind } = await params;
  if (!isKind(kind)) return NextResponse.json({ error: "No such kind of page." }, { status: 404 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Send the description and the DM notes as text." }, { status: 400 });

  try {
    const result = await saveTemplate(auth.dm, kind, parsed.data.body, parsed.data.dmNotes);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    revalidatePath("/admin/templates");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not save the template. Try again." }, { status: 500 });
  }
}

/** Resets a kind to its built-in default. DM only. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const auth = await authorize();
  if (auth.response) return auth.response;
  const { kind } = await params;
  if (!isKind(kind)) return NextResponse.json({ error: "No such kind of page." }, { status: 404 });
  try {
    await resetTemplate(kind);
    revalidatePath("/admin/templates");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not reset the template. Try again." }, { status: 500 });
  }
}
