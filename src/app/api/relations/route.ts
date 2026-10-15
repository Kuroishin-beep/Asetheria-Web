import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { AuthError, requireDM } from "@/lib/auth";
import { addRelation } from "@/lib/relations";
import { RELATION_TYPE_KEYS } from "@/lib/relations-core";

export const runtime = "nodejs";

const schema = z
  .object({
    fromId: z.string().uuid(),
    toId: z.string().uuid(),
    type: z.enum(RELATION_TYPE_KEYS as [string, ...string[]]),
    note: z.string().max(2000).default(""),
  })
  .strict();

/** Adds a relation between two pages. DM only; every rule is checked on the server. */
export async function POST(request: Request) {
  let dm;
  try {
    dm = await requireDM();
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose two pages and a kind of relation." }, { status: 400 });
  try {
    const result = await addRelation(dm, { ...parsed.data, type: parsed.data.type as (typeof RELATION_TYPE_KEYS)[number] });
    if (!result.ok) return NextResponse.json({ error: result.errors.join(" "), errors: result.errors }, { status: 400 });
    revalidatePath("/", "layout");
    return NextResponse.json({ id: result.id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not add the relation. Try again." }, { status: 500 });
  }
}
