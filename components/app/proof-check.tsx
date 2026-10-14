"use client"

import { useEffect, useRef, useState } from "react"
import { Check, LoaderCircle } from "lucide-react"
import { requestProof } from "@/actions/proof"
import { solvePuzzle } from "@/lib/proof-solve"

// The human check for a form. It gets a puzzle from the server and solves it while the person fills in the rest of the form,
// or shows Cloudflare Turnstile when the server uses it. `onReady` gets the answer to send with the form, or null while there
// is none yet. A form's submit button waits for an answer.
type Turnstile = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string
  remove: (widgetId: string) => void
}
const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

function loadTurnstile(): Promise<Turnstile> {
  const win = window as unknown as { turnstile?: Turnstile }
  if (win.turnstile) return Promise.resolve(win.turnstile)
  return new Promise((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SRC}"]`)
    if (!script) {
      script = document.createElement("script")
      script.src = TURNSTILE_SRC
      script.async = true
      document.head.appendChild(script)
    }
    script.addEventListener("load", () => (win.turnstile ? resolve(win.turnstile) : reject(new Error("no turnstile"))))
    script.addEventListener("error", () => reject(new Error("the script did not load")))
  })
}

export function ProofCheck({ onReady }: { onReady: (proof: string | null) => void }) {
  const [state, setState] = useState<"checking" | "done" | "failed">("checking")
  const [message, setMessage] = useState("")
  const [attempt, setAttempt] = useState(0)
  const widget = useRef<HTMLDivElement>(null)
  // The latest callback is read from a ref, so the check does not restart when the parent re-renders.
  const ready = useRef(onReady)
  useEffect(() => {
    ready.current = onReady
  }, [onReady])

  useEffect(() => {
    const controller = new AbortController()
    let turnstile: Turnstile | null = null
    let widgetId: string | null = null
    const fail = (text: string) => {
      setState("failed")
      setMessage(text)
      ready.current(null)
    }
    ready.current(null)
    ;(async () => {
      const result = await requestProof()
      if (controller.signal.aborted) return
      if (!result.ok) return fail(result.error)
      if (result.proof.kind === "pow") {
        const nonce = await solvePuzzle(result.proof.salt, result.proof.bits, controller.signal)
        if (controller.signal.aborted) return
        setState("done")
        ready.current(JSON.stringify({ kind: "pow", id: result.proof.id, nonce }))
        return
      }
      const api = await loadTurnstile()
      if (controller.signal.aborted || !widget.current) return
      turnstile = api
      widgetId = api.render(widget.current, {
        sitekey: result.proof.siteKey,
        callback: (token: string) => {
          setState("done")
          ready.current(JSON.stringify({ kind: "turnstile", token }))
        },
        "expired-callback": () => {
          setState("checking")
          ready.current(null)
        },
        "error-callback": () => fail("The check could not load. Try again."),
      })
    })().catch(() => {
      if (!controller.signal.aborted) fail("The check could not run. Try again.")
    })
    return () => {
      controller.abort()
      if (turnstile && widgetId) turnstile.remove(widgetId)
    }
  }, [attempt])

  return (
    <div className="flex flex-col gap-2">
      <div role="status" aria-live="polite" className="flex items-center gap-2.5 text-[13px] text-muted-foreground">
        {state === "done" ? (
          <Check className="size-4 shrink-0 text-foreground" aria-hidden />
        ) : state === "checking" ? (
          <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden />
        ) : null}
        <span>{state === "done" ? "Checked. You can continue." : state === "checking" ? "Checking that you're a person…" : message}</span>
        {state === "failed" ? (
          <button
            type="button"
            onClick={() => {
              setState("checking")
              setMessage("")
              setAttempt((count) => count + 1)
            }}
            className="rounded-full border border-border px-3 py-1 text-[12px] font-semibold text-foreground transition-colors duration-200 hover:bg-muted focus-visible:outline-2 focus-visible:outline-dusk"
          >
            Try again
          </button>
        ) : null}
      </div>
      <div ref={widget} />
    </div>
  )
}
