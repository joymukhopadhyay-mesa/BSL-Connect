import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic redirects only: a visitor without a session cookie is sent to
 * sign-in before a protected page renders. This is NOT the security boundary —
 * every page, server action and route handler validates the session against
 * the database, and RLS applies to every query.
 */

const SESSION_COOKIE = "bsl_session";
const PUBLIC_PATHS = ["/sign-in", "/setup", "/design-preview"];

function isPublic(pathname: string) {
  return pathname === "/" || PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const configured = Boolean(process.env.DATABASE_URL) && Boolean(process.env.AUTH_SECRET);
  if (!configured) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Service not configured." }, { status: 503 });
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  if (!request.cookies.get(SESSION_COOKIE)?.value) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
