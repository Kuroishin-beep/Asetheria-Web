import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { AuthError, requireDM } from "@/lib/auth";
import { deletePin, getMapBySlug, updatePin } from "@/lib/maps";

export const runtime = "nodejs";

/** DM only. Removes one pin; the entry it pointed at is untouched. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ slug: string; pinId: string }> }) {
  try {
    await requireDM();
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  const { slug, pinId } = await params;
  if (!z.string().uuid().safeParse(pinId).success) return NextResponse.json({ error: "Invalid pin." }, { status: 400 });
  const map = await getMapBySlug(slug);
  if (!map) return NextResponse.json({ error: "Map not found." }, { status: 404 });
  const removed = await deletePin(map.id, pinId);
  return removed ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Pin not found." }, { status: 404 });
}

const patchSchema = z
  .object({
    layerId: z.string().uuid().nullable().optional(),
    childMapId: z.string().uuid().nullable().optional(),
    label: z.string().trim().max(120).nullable().optional(),
  })
  .strict();

/** DM only. Moves a pin to a layer, sets the city map it opens, or changes its label. */
export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string; pinId: string }> }) {
  try {
    await requireDM();
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  const { slug, pinId } = await params;
  if (!z.string().uuid().safeParse(pinId).success) return NextResponse.json({ error: "Invalid pin." }, { status: 400 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid change." }, { status: 400 });
  const map = await getMapBySlug(slug);
  if (!map) return NextResponse.json({ error: "Map not found." }, { status: 404 });
  const { label, ...rest } = parsed.data;
  const result = await updatePin(map.id, pinId, { ...rest, ...(label === undefined ? {} : { label: label ? label : null }) });
  if (!result.ok) return NextResponse.json({ error: result.errors.join(" "), errors: result.errors }, { status: result.status });
  revalidatePath(`/map/${map.slug}`);
  return NextResponse.json({ ok: true });
}
