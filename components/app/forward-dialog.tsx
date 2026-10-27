"use client"

import { Suspense, use, useState, useTransition } from "react"
import { Check, Users } from "lucide-react"
import { toast } from "sonner"
import { forwardMessage, listForwardTargets, type ForwardTarget } from "@/actions/messages"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { FORWARD_TARGETS_MAX } from "@/lib/chat-organize-rules"
import { cn } from "@/lib/utils"

// Sends one message on to other chats the viewer is in. The chats load as the dialog opens. Up to FORWARD_TARGETS_MAX at once.
export function ForwardDialog({ messageId, onOpenChange }: { messageId: string; onOpenChange: (open: boolean) => void }) {
  const [targets] = useState(() => listForwardTargets())
  const [picked, setPicked] = useState<string[]>([])
  const [pending, startTransition] = useTransition()

  function toggle(id: string) {
    setPicked((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id)
      return current.length >= FORWARD_TARGETS_MAX ? current : [...current, id]
    })
  }

  function send() {
    startTransition(async () => {
      const result = await forwardMessage(messageId, picked)
      if (result.ok) {
        toast.success(result.count === 1 ? "Forwarded." : `Forwarded to ${result.count} chats.`)
        onOpenChange(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Forward message</DialogTitle>
        <DialogDescription>Choose up to {FORWARD_TARGETS_MAX} chats. The copy is marked as forwarded.</DialogDescription>
        <Suspense fallback={<p className="py-8 text-center text-sm text-muted-foreground">Loading your chats…</p>}>
          <TargetList promise={targets} picked={picked} onToggle={toggle} />
        </Suspense>
        <div className="flex items-center justify-between gap-2 pt-2">
          <span className="text-sm text-muted-foreground tabular-nums">
            {picked.length} of {FORWARD_TARGETS_MAX}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="tap-44 rounded-full px-4 py-2 font-semibold transition-colors hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={picked.length === 0 || pending}
              onClick={send}
              className="tap-44 rounded-full bg-foreground px-4 py-2 font-semibold text-background transition-opacity duration-200 disabled:opacity-35"
            >
              Forward
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function TargetList({
  promise,
  picked,
  onToggle,
}: {
  promise: Promise<ForwardTarget[]>
  picked: string[]
  onToggle: (id: string) => void
}) {
  const targets = use(promise)
  if (targets.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">You don&apos;t have any chats to forward to yet.</p>
  }
  return (
    <ul className="mt-4 max-h-[50dvh] list-none overflow-y-auto">
      {targets.map((target) => {
        const on = picked.includes(target.id)
        const full = !on && picked.length >= FORWARD_TARGETS_MAX
        return (
          <li key={target.id}>
            <button
              type="button"
              role="checkbox"
              aria-checked={on}
              aria-disabled={full}
              onClick={() => onToggle(target.id)}
              className={cn(
                "tap-44 flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-muted/50",
                full && "opacity-45"
              )}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                <Users className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold">{target.title}</span>
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full border transition-colors",
                  on ? "border-foreground bg-foreground text-background" : "border-border"
                )}
              >
                {on ? <Check className="size-3.5" /> : null}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
