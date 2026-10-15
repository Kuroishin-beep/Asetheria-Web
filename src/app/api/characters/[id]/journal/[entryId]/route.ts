import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { deleteJournalEntry, updateJournalEntry } from "@/lib/character-world";
import { CharacterError } from "@/lib/characters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; entryId: string }> };

const notFound = () => NextResponse.json({ error: "Journal entry not found." }, { status: 404 });

function fail(e: unknown) {
  if (e instanceof CharacterError) return NextResponse.json({ error: e.message, problems: e.problems }, { status: e.status });
  throw e;
}

async function resolve(ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  const { id, entryId } = await ctx.params;
  const uuid = z.string().uuid();
  if (!uuid.safeParse(id).success || !uuid.safeParse(entryId).success) return { error: notFound() } as const;
  return { user, id, entryId } as const;
}

/** Changes an entry. Its player only. */
export async function PATCH(request: Request, ctx: Ctx) {
  const r = await resolve(ctx);
  if ("error" in r) return r.error;
  const raw = await request.json().catch(() => null);
  try {
    const entry = await updateJournalEntry(r.user, r.id, r.entryId, raw);
    return entry ? NextResponse.json({ entry }) : notFound();
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const r = await resolve(ctx);
  if ("error" in r) return r.error;
  try {
    return (await deleteJournalEntry(r.user, r.id, r.entryId)) ? NextResponse.json({ ok: true }) : notFound();
  } catch (e) {
    return fail(e);
  }
}
