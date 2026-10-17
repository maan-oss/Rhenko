import type { NextRequest } from "next/server"
import { getViewer } from "@/lib/auth"
import { endFromClosingTab } from "@/lib/call-state"

const ID = /^[A-Za-z0-9-]{8,64}$/
const MAX_BODY = 512

// A tab that closes mid-call sends this as it goes (a beacon), so the call ends for the other side straight away
// instead of after the connection times out. A server action cannot run while a page unloads, so this is a route.
export async function POST(request: NextRequest) {
  // Only this site's own pages may send it. The session cookie is SameSite=Lax as well, so other sites cannot.
  const origin = request.headers.get("origin")
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  if (origin) {
    let originHost: string | null = null
    try {
      originHost = new URL(origin).host
    } catch {
      originHost = null
    }
    if (!host || originHost !== host) return new Response(null, { status: 403 })
  }
  const viewer = await getViewer()
  if (!viewer) return new Response(null, { status: 401 })
  const text = await request.text().catch(() => "")
  if (text.length > MAX_BODY) return new Response(null, { status: 413 })
  const form = new URLSearchParams(text)
  const callId = form.get("callId") ?? ""
  const deviceId = form.get("deviceId") ?? ""
  if (!ID.test(callId) || !ID.test(deviceId)) return new Response(null, { status: 400 })
  await endFromClosingTab(callId, { userId: viewer.id, deviceId, session: null })
  return new Response(null, { status: 204 })
}
