import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { UserRole } from "@/db/schema";

/**
 * Pure token helpers — deliberately free of any `next/headers` import so this
 * module can be used from Edge middleware. Cookie reading and writing lives in
 * `session-cookie.ts`, which is Node-runtime only.
 */

export const SESSION_COOKIE = "asetheria_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export type SessionUser = {
  id: string;
  username: string;
  role: UserRole;
  /** Must match the user's `sessionEpoch`, so sessions can be revoked. */
  epoch: number;
};

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET is missing or too short (needs 32+ characters). " +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({
    username: user.username,
    role: user.role,
    epoch: user.epoch,
  } satisfies JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

/** Verifies signature + expiry. Edge-runtime safe. */
export async function verifySessionToken(
  token: string,
): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
    });
    if (!payload.sub || typeof payload.username !== "string") return null;
    return {
      id: payload.sub,
      username: payload.username,
      role: payload.role === "dm" ? "dm" : "player",
      epoch: typeof payload.epoch === "number" ? payload.epoch : 0,
    };
  } catch {
    return null;
  }
}
