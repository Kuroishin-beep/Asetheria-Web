import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDM, AuthError } from "@/lib/auth";
import { entryKind } from "@/db/schema";
import { setGrant, bulkSetGrant, removeGrant } from "@/lib/rbac";

export const runtime = "nodejs";

const kindSchema = z.enum(entryKind.enumValues);
const uuid = z.string().uuid();

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("toggleKind"),
    playerId: uuid,
    kind: kindSchema,
    granted: z.boolean(),
  }),
  z.object({
    action: z.literal("bulkEntries"),
    playerId: uuid,
    entryIds: z.array(uuid).min(1).max(2000),
    granted: z.boolean(),
  }),
  z.object({
    action: z.literal("clearKind"),
    playerId: uuid,
    kind: kindSchema,
  }),
  z.object({
    action: z.literal("clearEntries"),
    playerId: uuid,
    entryIds: z.array(uuid).min(1).max(2000),
  }),
]);

export async function POST(request: Request) {
  let dm;
  try {
    dm = await requireDM();
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const body = parsed.data;

  switch (body.action) {
    case "toggleKind":
      await setGrant(dm.id, body.playerId, { kind: body.kind }, body.granted);
      break;
    case "bulkEntries":
      await bulkSetGrant(
        dm.id,
        body.playerId,
        body.entryIds.map((entryId) => ({ entryId })),
        body.granted,
      );
      break;
    case "clearKind":
      await removeGrant(body.playerId, { kind: body.kind });
      break;
    case "clearEntries":
      for (const entryId of body.entryIds) {
        await removeGrant(body.playerId, { entryId });
      }
      break;
  }

  return NextResponse.json({ ok: true });
}
