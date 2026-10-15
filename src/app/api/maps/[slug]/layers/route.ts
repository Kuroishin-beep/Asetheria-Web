import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { guardDm } from "@/lib/dm-guard";
import { createLayer, getMapBySlug } from "@/lib/maps";

export const runtime = "nodejs";

const schema = z.object({ name: z.string().max(500) }).strict();

/** Adds a layer to a map. DM only. */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const guard = await guardDm();
  if (guard.response) return guard.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Send a name for the layer." }, { status: 400 });
  const map = await getMapBySlug((await params).slug);
  if (!map) return NextResponse.json({ error: "Map not found." }, { status: 404 });
  const result = await createLayer(map.id, parsed.data.name);
  if (!result.ok) return NextResponse.json({ error: result.errors.join(" "), errors: result.errors }, { status: result.status });
  revalidatePath(`/map/${map.slug}`);
  return NextResponse.json({ id: result.id }, { status: 201 });
}
