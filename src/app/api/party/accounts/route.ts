import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireDM } from "@/lib/auth";
import {
  createPlayerAccount,
  giveCharacter,
  PartyAccountError,
  partyUsername,
  resetPlayerPassword,
} from "@/lib/party-accounts";

export const runtime = "nodejs";

const password = z.string().min(1, "Enter a password.").max(200);
const uuid = z.string().uuid();

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), username: partyUsername, password }),
  z.object({ action: z.literal("resetPassword"), playerId: uuid, password }),
  z.object({ action: z.literal("giveCharacter"), playerId: uuid, characterId: uuid }),
]);

/** The DM's party logins: make a player account, set a new password, or hand a character to a player. */
export async function POST(request: Request) {
  try {
    await requireDM();
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the form and try again." }, { status: 400 });
  }
  const body = parsed.data;

  try {
    switch (body.action) {
      case "create": {
        const created = await createPlayerAccount(body);
        return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
      }
      case "resetPassword":
        await resetPlayerPassword(body.playerId, body.password);
        break;
      case "giveCharacter":
        await giveCharacter(body.characterId, body.playerId);
        break;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof PartyAccountError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
