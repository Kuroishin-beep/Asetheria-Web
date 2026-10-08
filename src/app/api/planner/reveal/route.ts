import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireDM } from "@/lib/auth";
import { revealToPlayers } from "@/lib/planner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuid = z.string().uuid();
const schema = z.object({
  playerIds: z.array(uuid).min(1).max(100),
  entryIds: z.array(uuid).min(1).max(500),
});

/**
 * DM only. Opens exactly the chosen entries to exactly the chosen players, as
 * entry-level grants. It never changes an entry's visibility and writes no
 * kind-level grant; secret entries are skipped and reported back.
 */
export async function POST(request: Request) {
  let dm;
  try {
    dm = await requireDM();
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose at least one player and one entry." }, { status: 400 });

  const playerIds = [...new Set(parsed.data.playerIds)];
  const entryIds = [...new Set(parsed.data.entryIds)];
  return NextResponse.json(await revealToPlayers(dm, playerIds, entryIds));
}
