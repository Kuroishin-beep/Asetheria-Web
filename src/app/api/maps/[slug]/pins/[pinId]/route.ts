import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireDM } from "@/lib/auth";
import { deletePin, getMapBySlug } from "@/lib/maps";

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
