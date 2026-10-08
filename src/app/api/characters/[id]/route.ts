import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { CharacterError, deleteCharacter, getCharacter, updateCharacter } from "@/lib/characters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ error: "Character not found." }, { status: 404 });

function fail(e: unknown) {
  if (e instanceof CharacterError) return NextResponse.json({ error: e.message, problems: e.problems }, { status: e.status });
  throw e;
}

async function resolve(ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  const { id } = await ctx.params;
  // A malformed id is just "not found": nothing to confirm or deny.
  if (!z.string().uuid().safeParse(id).success) return { error: notFound() } as const;
  return { user, id } as const;
}

/** The player's own character, or any character for the DM. Someone else's is "not found". */
export async function GET(_request: Request, ctx: Ctx) {
  const r = await resolve(ctx);
  if ("error" in r) return r.error;
  const found = await getCharacter(r.user, r.id);
  return found ? NextResponse.json({ character: found }) : notFound();
}

export async function PUT(request: Request, ctx: Ctx) {
  const r = await resolve(ctx);
  if ("error" in r) return r.error;
  const raw = await request.json().catch(() => null);
  try {
    const updated = await updateCharacter(r.user, r.id, raw);
    return updated ? NextResponse.json({ character: updated }) : notFound();
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const r = await resolve(ctx);
  if ("error" in r) return r.error;
  try {
    return (await deleteCharacter(r.user, r.id)) ? NextResponse.json({ ok: true }) : notFound();
  } catch (e) {
    return fail(e);
  }
}
