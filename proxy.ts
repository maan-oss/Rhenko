import { NextResponse, type NextRequest } from "next/server"

// Every page of the app needs a signed-in person, except the few that anyone may read: the landing page at the root,
// the sign-in and account pages, the policy pages, and the offline page. A visitor without a session cookie is sent to
// the sign-in page. The page itself still checks the session, so a stale cookie is refused there.
const SESSION_COOKIE = "rhenko_session"

const PUBLIC_PAGES = new Set(["/", "/login", "/signup", "/forgot-password", "/reset-password", "/rules", "/safety", "/transparency", "/privacy", "/terms", "/legal", "/advertise", "/offline", "/copyright"])
const PUBLIC_PREFIXES = ["/login/", "/signup/", "/forgot-password/", "/reset-password/", "/rules/", "/safety/", "/transparency/", "/privacy/", "/terms/", "/legal/", "/api/"]

function isPublic(pathname: string) {
  if (PUBLIC_PAGES.has(pathname)) return true
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (isPublic(pathname) || request.cookies.has(SESSION_COOKIE)) return NextResponse.next()
  return NextResponse.redirect(new URL("/login", request.url))
}

export const config = {
  // Static files, images and the fonts carry an extension, and never need a session.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[A-Za-z0-9]+$).*)"],
}
