import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { CharacterError, createCharacter, listAll, listMine } from "@/lib/characters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(e: unknown) {
  if (e instanceof CharacterError) return NextResponse.json({ error: e.message, problems: e.problems }, { status: e.status });
  throw e;
}

/** A player's own characters; the DM gets everyone's (with the owner) from `?scope=all`. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const all = new URL(request.url).searchParams.get("scope") === "all";
    return NextResponse.json({ characters: all ? await listAll(user) : await listMine(user) });
  } catch (e) {
    return fail(e);
  }
}

/** Saves a new character for the signed-in player, after re-checking every house rule. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const raw = await request.json().catch(() => null);
  try {
    return NextResponse.json({ character: await createCharacter(user, raw) }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
