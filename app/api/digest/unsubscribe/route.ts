import { connection } from "next/server"
import { clientIp } from "@/lib/auth"
import { unsubscribeWithToken } from "@/lib/digest"
import { consume } from "@/lib/rate-limit"

// Turns off the daily digest from the link in the email, with no sign-in: the signed token in the address (?t=) is the proof.
// Two callers use it. A mail app's "Unsubscribe" button POSTs here with `List-Unsubscribe=One-Click` (RFC 8058) and wants a
// plain 2xx. The button on /unsubscribe POSTs a form with page=1 and is sent back to that page with the result.
// Sixty tries per network every ten minutes, and ten per account an hour.

const WINDOW_MS = 10 * 60 * 1000
const MAX_BODY = 2048

function sendTo(path: string): Response {
  return new Response(null, { status: 303, headers: { Location: path, "Cache-Control": "no-store" } })
}

function plain(message: string, status: number, extra: Record<string, string> = {}): Response {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...extra } })
}

// Some mail apps open the address in a browser instead. That shows the confirm page; a GET changes nothing, so a link checker
// that fetches the address cannot turn a digest off.
export async function GET(request: Request) {
  await connection()
  const token = new URL(request.url).searchParams.get("t") ?? ""
  return sendTo(`/unsubscribe?t=${encodeURIComponent(token)}`)
}

export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("t") ?? ""
  let fromPage = false
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return plain("That request is too large.", 413)
  try {
    fromPage = (await request.formData()).get("page") === "1"
  } catch {
    // A one-click POST with a body this cannot read is still a one-click POST.
  }
  const back = `/unsubscribe?t=${encodeURIComponent(token)}`

  const limit = await consume(`digest-off-ip:${await clientIp()}`, 60, WINDOW_MS)
  if (!limit.ok) {
    return fromPage ? sendTo(`${back}&wait=1`) : plain("Too many tries. Try again in a few minutes.", 429, { "Retry-After": String(limit.retryAfterSeconds) })
  }
  const result = await unsubscribeWithToken(token)
  if (result === "done") return fromPage ? sendTo("/unsubscribe?done=1") : plain("You won't get the daily digest any more.", 200)
  if (result === "limited") {
    return fromPage ? sendTo(`${back}&wait=1`) : plain("Too many tries. Try again in a few minutes.", 429, { "Retry-After": "600" })
  }
  return fromPage ? sendTo(back) : plain("This link isn't valid, or it has expired. Turn the digest off in Settings, under Notifications.", 400)
}
