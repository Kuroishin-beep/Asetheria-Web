import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/**
 * Gate for the whole app. This runs before every request, so it verifies the
 * JWT signature only — the database-backed check (revocation, role) happens in
 * `getCurrentUser()`. Treat this as a fast first filter, not the sole guard.
 */
const PUBLIC_PATHS = [
  "/welcome",
  "/create-character",
  "/login",
  "/register",
  "/forgot-password",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/player",
  "/api/auth/register",
  "/api/auth/forgot",
  "/api/health",
  // The landing page's own art (the DM's map of the continent), shown to strangers.
  "/landing",
];

export async function proxy(request: NextRequest) {
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
    (pathname === "/welcome" || pathname === "/login" || pathname === "/register" || pathname === "/forgot-password")
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

  // The codex books are static pages: the players' guide is for anyone signed in, the DM codex
  // (secrets, DM notes, the bestiary) for the DM alone. Others get a plain 404, so it is not even confirmed.
  if (pathname.startsWith(DM_BOOK_PREFIX) && session.role !== "dm") {
    return new NextResponse("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  }

  return NextResponse.next();
}

const DM_BOOK_PREFIX = "/books/dm-";

export const config = {
  matcher: [
    // Everything except Next internals and static assets.
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)",
  ],
};
