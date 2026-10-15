import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { guardDm } from "@/lib/dm-guard";
import { deleteLayer, getMapBySlug, updateLayer } from "@/lib/maps";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string; layerId: string }> };
const uuid = z.string().uuid();
const patchSchema = z.object({ name: z.string().max(500).optional(), defaultOn: z.boolean().optional() }).strict();

/** Renames a layer or sets whether it starts switched on. DM only. */
export async function PATCH(request: Request, { params }: Ctx) {
  const guard = await guardDm();
  if (guard.response) return guard.response;
  const { slug, layerId } = await params;
  if (!uuid.safeParse(layerId).success) return NextResponse.json({ error: "Invalid layer." }, { status: 400 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid change." }, { status: 400 });
  const map = await getMapBySlug(slug);
  if (!map) return NextResponse.json({ error: "Map not found." }, { status: 404 });
  const result = await updateLayer(map.id, layerId, parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.errors.join(" "), errors: result.errors }, { status: result.status });
  revalidatePath(`/map/${map.slug}`);
  return NextResponse.json({ ok: true });
}

/** Removes a layer; its pins and regions stay on the map. DM only. */
export async function DELETE(_request: Request, { params }: Ctx) {
  const guard = await guardDm();
  if (guard.response) return guard.response;
  const { slug, layerId } = await params;
  if (!uuid.safeParse(layerId).success) return NextResponse.json({ error: "Invalid layer." }, { status: 400 });
  const map = await getMapBySlug(slug);
  if (!map) return NextResponse.json({ error: "Map not found." }, { status: 404 });
  if (!(await deleteLayer(map.id, layerId))) return NextResponse.json({ error: "Layer not found." }, { status: 404 });
  revalidatePath(`/map/${map.slug}`);
  return NextResponse.json({ ok: true });
}
