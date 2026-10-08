import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireDM } from "@/lib/auth";
import { buildEncounter, PlannerError } from "@/lib/planner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const text = (max: number) => z.string().trim().max(max).optional();

const schema = z.object({
  count: z.number().int().min(1).max(8).default(3),
  crMax: text(10),
  type: text(40),
  habitat: text(40),
  tableSlug: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{0,200}$/)
    .optional(),
});

/** DM only. Picks creatures from the bestiary this DM can read, and optionally rolls a random table. */
export async function POST(request: Request) {
  let dm;
  try {
    dm = await requireDM();
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid encounter request." }, { status: 400 });

  try {
    const clean = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== "" && v !== undefined)) as typeof parsed.data;
    return NextResponse.json(await buildEncounter(dm, clean));
  } catch (e) {
    if (e instanceof PlannerError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
