import type { NextRequest } from "next/server"
import { getViewer, SESSION_COOKIE, sessionTokenValid } from "@/lib/auth"
import { subscribe, type RealtimeEvent } from "@/lib/bus"
import { openingEvents, serverBootId, takeQueuedBanners } from "@/lib/call-state"

const encoder = new TextEncoder()
const PING_MS = 25_000
// The stream closes within this long of its sign-in ending: a sign-out, a revoked device or a deactivated account.
const SESSION_CHECK_MS = 30_000

// Server-sent events for the signed-in person. The first event says which server run this is, so the browser can
// tell a restart from a dropped connection. Then come the group calls going on in the person's groups, any ring
// still waiting for them, and banners saved while they had nothing open. After that, the client refreshes its page
// when a notification or message arrives, shows typing and banners, and runs calls.
export async function GET(request: NextRequest) {
  const viewer = await getViewer()
  if (!viewer) return new Response("Sign in first.", { status: 401 })
  const token = request.cookies.get(SESSION_COOKIE)?.value ?? null

  let teardown = () => {}
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      const write = (chunk: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          teardown()
        }
      }
      const send = (event: RealtimeEvent) => write(`data: ${JSON.stringify(event)}\n\n`)
      // A dropped stream comes back after two seconds.
      write("retry: 2000\n\n")
      send({ type: "hello", bootId: serverBootId() })
      const unsubscribe = await subscribe(viewer.id, send)
      for (const event of await openingEvents(viewer.id)) send(event)
      for (const event of await takeQueuedBanners(viewer.id)) send(event)
      const ping = setInterval(() => write(": ping\n\n"), PING_MS)
      const sessionCheck = setInterval(async () => {
        if (!token || !await sessionTokenValid(token)) teardown()
      }, SESSION_CHECK_MS)
      teardown = () => {
        if (closed) return
        closed = true
        clearInterval(ping)
        clearInterval(sessionCheck)
        unsubscribe()
        try {
          controller.close()
        } catch {
          // Already closed by the client.
        }
      }
      request.signal.addEventListener("abort", teardown)
    },
    cancel() {
      teardown()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
