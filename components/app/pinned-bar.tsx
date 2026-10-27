"use client"

import Link from "next/link"
import { useTransition } from "react"
import { Pin, X } from "lucide-react"
import { toast } from "sonner"
import { pinMessage } from "@/actions/messages"

export type PinnedLine = { id: string; from: string; text: string }

// The newest message pinned in a chat, under the header. Opening it jumps the thread to that message. Anyone in the chat can unpin.
export function PinnedBar({ conversationId, pins, canChange }: { conversationId: string; pins: PinnedLine[]; canChange: boolean }) {
  const [pending, startTransition] = useTransition()
  const latest = pins[0]
  if (!latest) return null

  function unpin() {
    startTransition(async () => {
      const result = await pinMessage(latest.id, false)
      if (!result.ok) toast.error(result.error)
    })
  }

  return (
    <div className="flex items-center gap-2 border-t border-border px-4 py-2">
      <Link
        href={`/messages/${conversationId}?m=${latest.id}`}
        aria-label={`Go to pinned message from ${latest.from}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Pin className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] leading-tight font-semibold text-muted-foreground">
            {pins.length > 1 ? `Pinned messages · ${pins.length}` : "Pinned message"}
          </span>
          <span className="block truncate text-[13px] leading-snug">
            {latest.from}: {latest.text}
          </span>
        </span>
      </Link>
      {canChange ? (
        <button
          type="button"
          aria-label="Unpin message"
          disabled={pending}
          onClick={unpin}
          className="tap-44 grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted disabled:opacity-60"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}
