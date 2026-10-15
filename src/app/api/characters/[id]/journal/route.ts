import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { addJournalEntry, listJournal } from "@/lib/character-world";
import { CharacterError } from "@/lib/characters";

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
  if (!z.string().uuid().safeParse(id).success) return { error: notFound() } as const;
  return { user, id } as const;
}

/** A character's journal: its player and the DM. Anyone else is told the character does not exist. */
export async function GET(_request: Request, ctx: Ctx) {
  const r = await resolve(ctx);
  if ("error" in r) return r.error;
  const entries = await listJournal(r.user, r.id);
  return entries ? NextResponse.json({ entries }) : notFound();
}

/** Adds an entry. Its player only (the DM gets 403); at most 200 entries of 4,000 characters. */
export async function POST(request: Request, ctx: Ctx) {
  const r = await resolve(ctx);
  if ("error" in r) return r.error;
  const raw = await request.json().catch(() => null);
  try {
    const entry = await addJournalEntry(r.user, r.id, raw);
    return entry ? NextResponse.json({ entry }, { status: 201 }) : notFound();
  } catch (e) {
    return fail(e);
  }
}
