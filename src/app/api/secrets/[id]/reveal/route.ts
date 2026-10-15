import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { AuthError, requireDM } from "@/lib/auth";
import { isSecretId } from "@/lib/secret-blocks";
import { setReveals } from "@/lib/secrets";

export const runtime = "nodejs";

const bodySchema = z.object({ playerIds: z.array(z.string().uuid()).max(100) }).strict();

/** Sets exactly which players a secret block is revealed to. DM only. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let dm;
  try {
    dm = await requireDM();
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const { id } = await params;
  if (!isSecretId(id)) return NextResponse.json({ error: "Secret block not found." }, { status: 404 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose players from the list." }, { status: 400 });

  try {
    const result = await setReveals(dm, id, parsed.data.playerIds);
    if ("notFound" in result) return NextResponse.json({ error: "Secret block not found." }, { status: 404 });
    // The page shows or hides the block for the players it changed.
    revalidatePath("/", "layout");
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Could not change who sees this. Try again." }, { status: 500 });
  }
}
