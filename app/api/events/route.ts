import { getViewer } from "@/lib/auth"
import { subscribe, type RealtimeEvent } from "@/lib/bus"

const encoder = new TextEncoder()

// Server-sent events for the signed-in person. The client refreshes its page
// when a notification or message arrives, and shows typing indicators.
export async function GET(request: Request) {
  const viewer = await getViewer()
  if (!viewer) return new Response("Sign in first.", { status: 401 })

  let teardown = () => {}
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          teardown()
        }
      }
      const send = (event: RealtimeEvent) => write(`data: ${JSON.stringify(event)}\n\n`)
      const unsubscribe = subscribe(viewer.id, send)
      const heartbeat = setInterval(() => write(": ping\n\n"), 25_000)
      let closed = false
      teardown = () => {
        if (closed) return
        closed = true
        clearInterval(heartbeat)
        unsubscribe()
        try {
          controller.close()
        } catch {
          // Already closed by the client.
        }
      }
      write(": connected\n\n")
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
