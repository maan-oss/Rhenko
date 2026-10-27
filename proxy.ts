import { NextResponse, type NextRequest } from "next/server"
import { MISSING_PAGE, pageMissing } from "@/lib/route-gate"
import { contentSecurityPolicy } from "@/lib/csp"
import { countryOf, isBlockedCountry, isOpenToBlocked } from "@/lib/geo-block"
import { loginPathFor } from "@/lib/invite-links"

// Every page of the app needs a signed-in person, except the few that anyone may read: the landing page at the root,
// the sign-in and account pages, the policy pages, and the offline page. A visitor without a session cookie is sent to
// the sign-in page. The page itself still checks the session, so a stale cookie is refused there.
const SESSION_COOKIE = "rhenko_session"

// Next sends this header with the requests it makes to warm a link before a click. A prefetch shows nothing, so it is not
// checked here; the navigation that follows it is.
const PREFETCH_HEADER = "next-router-prefetch"

// /notice is public: anyone may tell us about content, with or without an account (app/notice/page.tsx says so).
const PUBLIC_PAGES = new Set(["/", "/login", "/signup", "/forgot-password", "/reset-password", "/rules", "/safety", "/transparency", "/privacy", "/terms", "/legal", "/advertise", "/offline", "/copyright", "/notice", "/unavailable", "/unsubscribe"])
const PUBLIC_PREFIXES = ["/login/", "/signup/", "/forgot-password/", "/reset-password/", "/rules/", "/safety/", "/transparency/", "/privacy/", "/terms/", "/legal/", "/api/"]

function isPublic(pathname: string) {
  if (PUBLIC_PAGES.has(pathname)) return true
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

// A profile, a post or a list that does not exist, or that this person may not see, gets a real 404. The check runs here,
// before the page streams, because a page cannot send a 404 once it has begun (see lib/route-gate.ts).
// Every response carries the Content Security Policy from lib/csp.ts.
export default async function proxy(request: NextRequest) {
  const policy = contentSecurityPolicy()
  const withPolicy = (response: NextResponse) => {
    response.headers.set("Content-Security-Policy", policy)
    return response
  }

  const { pathname } = request.nextUrl
  // Visitors from a country Rhenko is not offered in see the notice page, and only the rules and policy pages stay open.
  // A server action is a POST with no page to show, so it gets a plain refusal instead of a redirect.
  if (isBlockedCountry(countryOf(request.headers)) && !isOpenToBlocked(pathname)) {
    if (request.headers.get("next-action")) return withPolicy(new NextResponse("Rhenko is not available in your country.", { status: 451 }))
    return withPolicy(NextResponse.redirect(new URL("/unavailable", request.url)))
  }
  if (isPublic(pathname)) return withPolicy(NextResponse.next())
  const token = request.cookies.get(SESSION_COOKIE)?.value
  // A group invite link is kept through sign-in, so the person lands back on the invite.
  if (!token) return withPolicy(NextResponse.redirect(new URL(loginPathFor(pathname), request.url)))
  if (request.headers.get(PREFETCH_HEADER) === "1") return withPolicy(NextResponse.next())
  if (await pageMissing(pathname, token)) return withPolicy(NextResponse.rewrite(new URL(MISSING_PAGE, request.url)))
  return withPolicy(NextResponse.next())
}

export const config = {
  // Static files, images and the fonts carry an extension, and never need a session.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[A-Za-z0-9]+$).*)"],
}
