import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { guardDm } from "@/lib/dm-guard";
import { deleteRegion, getMapBySlug, updateRegion } from "@/lib/maps";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string; regionId: string }> };
const uuid = z.string().uuid();

const patchSchema = z
  .object({
    name: z.string().max(500).optional(),
    entryId: uuid.nullable().optional(),
    layerId: uuid.nullable().optional(),
    tone: z.string().max(10).optional(),
  })
  .strict();

/** Renames a region, links or unlinks its page, moves it to a layer, or recolours it. DM only. */
export async function PATCH(request: Request, { params }: Ctx) {
  const guard = await guardDm();
  if (guard.response) return guard.response;
  const { slug, regionId } = await params;
  if (!uuid.safeParse(regionId).success) return NextResponse.json({ error: "Invalid region." }, { status: 400 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid change." }, { status: 400 });
  const map = await getMapBySlug(slug);
  if (!map) return NextResponse.json({ error: "Map not found." }, { status: 404 });
  const result = await updateRegion(map.id, regionId, parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.errors.join(" "), errors: result.errors }, { status: result.status });
  revalidatePath(`/map/${map.slug}`);
  return NextResponse.json({ ok: true });
}

/** Removes a region; the page it was linked to is untouched. DM only. */
export async function DELETE(_request: Request, { params }: Ctx) {
  const guard = await guardDm();
  if (guard.response) return guard.response;
  const { slug, regionId } = await params;
  if (!uuid.safeParse(regionId).success) return NextResponse.json({ error: "Invalid region." }, { status: 400 });
  const map = await getMapBySlug(slug);
  if (!map) return NextResponse.json({ error: "Map not found." }, { status: 404 });
  if (!(await deleteRegion(map.id, regionId))) return NextResponse.json({ error: "Region not found." }, { status: 404 });
  revalidatePath(`/map/${map.slug}`);
  return NextResponse.json({ ok: true });
}
