import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { guardDm } from "@/lib/dm-guard";
import { createRegion, getMapBySlug, getRegionsForMap } from "@/lib/maps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

/** Regions this caller may see. Scoped in the query: a hidden page's region and a DM-only region are not in the response at all. */
export async function GET(_request: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const map = await getMapBySlug((await params).slug);
  if (!map) return NextResponse.json({ error: "Map not found." }, { status: 404 });
  return NextResponse.json({ regions: await getRegionsForMap(user, map.id) });
}

// The shape only; the polygon's own rules (and their plain-words messages) are checked by validatePolygon.
const schema = z
  .object({
    name: z.string().max(500),
    points: z.array(z.unknown()).max(1000),
    entryId: z.string().uuid().nullable().optional(),
    layerId: z.string().uuid().nullable().optional(),
    tone: z.string().max(10).optional(),
  })
  .strict();

/** Draws a new region. DM only. */
export async function POST(request: Request, { params }: Ctx) {
  const guard = await guardDm();
  if (guard.response) return guard.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Send a name and the points of the outline." }, { status: 400 });
  const map = await getMapBySlug((await params).slug);
  if (!map) return NextResponse.json({ error: "Map not found." }, { status: 404 });
  try {
    const result = await createRegion(map.id, guard.dm.id, parsed.data);
    if (!result.ok) return NextResponse.json({ error: result.errors.join(" "), errors: result.errors }, { status: result.status });
    revalidatePath(`/map/${map.slug}`);
    return NextResponse.json({ id: result.id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "The region could not be saved. Try again." }, { status: 500 });
  }
}
