import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/**
 * Gate for the whole app. This runs on the Edge runtime, so it verifies the
 * JWT signature only — the database-backed check (revocation, role) happens in
 * `getCurrentUser()`. Treat this as a fast first filter, not the sole guard.
 */
const PUBLIC_PATHS = [
  "/welcome",
  "/login",
  "/register",
  "/api/auth/login",
  "/api/auth/player",
  "/api/auth/register",
  "/api/health",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  // Signed-in users have no reason to sit on the welcome, login, or
  // registration pages.
  if (
    session &&
    (pathname === "/welcome" || pathname === "/login" || pathname === "/register")
  ) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (isPublic) return NextResponse.next();

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }
    // Strangers land on the door-choice page: players walk straight in,
    // the DM goes on to the password.
    const welcomeUrl = new URL("/welcome", request.url);
    // Bounce back to the requested page after entering.
    if (pathname !== "/") welcomeUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(welcomeUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except Next internals and static assets.
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)",
  ],
};
