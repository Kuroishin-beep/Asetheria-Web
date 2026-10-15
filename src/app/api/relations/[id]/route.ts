import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { AuthError, requireDM } from "@/lib/auth";
import { removeRelation } from "@/lib/relations";
import { isSecretId } from "@/lib/secret-blocks";

export const runtime = "nodejs";

/** Removes a relation. DM only. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireDM();
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  const { id } = await params;
  // A relation id is a UUID like a secret block's; the same check keeps odd text out of the query.
  if (!isSecretId(id)) return NextResponse.json({ error: "Relation not found." }, { status: 404 });
  try {
    if (!(await removeRelation(id))) return NextResponse.json({ error: "Relation not found." }, { status: 404 });
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not remove the relation. Try again." }, { status: 500 });
  }
}
