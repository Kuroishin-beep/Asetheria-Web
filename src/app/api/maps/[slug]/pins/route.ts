import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, getCurrentUser, requireDM } from "@/lib/auth";
import { createPin, getMapBySlug, getPinsForMap } from "@/lib/maps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

/** Pins this caller may see. Scoped in the query; a hidden entry's pin is not in the response at all. */
export async function GET(_request: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const map = await getMapBySlug((await params).slug);
  if (!map) return NextResponse.json({ error: "Map not found." }, { status: 404 });
  return NextResponse.json({ pins: await getPinsForMap(user, map.id) });
}

const COORD = z.number().finite().min(0).max(1);
const createSchema = z.object({
  entryId: z.string().uuid(),
  x: COORD,
  y: COORD,
  label: z.string().trim().max(120).optional(),
});

/** DM only. */
export async function POST(request: Request, { params }: Ctx) {
  let dm;
  try {
    dm = await requireDM();
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid pin." }, { status: 400 });

  const map = await getMapBySlug((await params).slug);
  if (!map) return NextResponse.json({ error: "Map not found." }, { status: 404 });

  const created = await createPin({
    mapId: map.id,
    entryId: parsed.data.entryId,
    x: parsed.data.x,
    y: parsed.data.y,
    label: parsed.data.label ? parsed.data.label : null,
    createdBy: dm.id,
  });
  if (!created) return NextResponse.json({ error: "That entry no longer exists." }, { status: 404 });
  return NextResponse.json({ id: created.id }, { status: 201 });
}
