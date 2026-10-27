"use client"

import { createContext, useContext, useMemo, useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"
import { EyeOff, Star, StarOff, X } from "lucide-react"
import { hideMessagesForMe, setStarredMessages } from "@/actions/messages"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { Button } from "@/components/ui/button"

// Selecting messages for a bulk action. The thread picks messages through this; the bar at the bottom acts on them. The composer
// stays mounted underneath while selecting, so a draft is not lost.

// The picked messages by id, each with whether it is starred. Null when the thread is not selecting.
type Picked = Map<string, boolean> | null

type Selection = {
  picked: Picked
  start: (id: string, starred: boolean) => void
  toggle: (id: string, starred: boolean) => void
  clear: () => void
}

const SelectionContext = createContext<Selection | null>(null)

// The event a bulk action sends once the server has changed the messages, so the thread shows the change at once.
export const THREAD_CHANGE_EVENT = "rhenko:thread-change"
export type ThreadChangeDetail = { ids: string[]; change: { starred?: boolean; hidden?: boolean } }

export function useSelection(): Selection | null {
  return useContext(SelectionContext)
}

export function SelectionScope({ footer, children }: { footer: ReactNode; children: ReactNode }) {
  const [picked, setPicked] = useState<Picked>(null)
  const selection = useMemo<Selection>(
    () => ({
      picked,
      start: (id, starred) => setPicked(new Map([[id, starred]])),
      toggle: (id, starred) =>
        setPicked((current) => {
          const next = new Map(current ?? [])
          if (next.has(id)) next.delete(id)
          else next.set(id, starred)
          // Taking the last message back out leaves selecting.
          return next.size === 0 ? null : next
        }),
      clear: () => setPicked(null),
    }),
    [picked]
  )
  return (
    <SelectionContext.Provider value={selection}>
      {children}
      {/* A wrapper that takes no space, so the composer stays sticky at the bottom. Hidden while selecting, not unmounted. */}
      <div className={picked ? "hidden" : "contents"}>{footer}</div>
      {picked ? <SelectionBar picked={picked} onDone={selection.clear} /> : null}
    </SelectionContext.Provider>
  )
}

function SelectionBar({ picked, onDone }: { picked: Map<string, boolean>; onDone: () => void }) {
  const [pending, startTransition] = useTransition()
  const ids = [...picked.keys()]
  const count = ids.length
  const allStarred = [...picked.values()].every(Boolean)
  const noun = count === 1 ? "message" : "messages"

  function star() {
    const starred = !allStarred
    startTransition(async () => {
      const result = await setStarredMessages(ids, starred)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      window.dispatchEvent(new CustomEvent<ThreadChangeDetail>(THREAD_CHANGE_EVENT, { detail: { ids: result.changed ?? [], change: { starred } } }))
      toast.success(starred ? `Starred ${count} ${noun}.` : `Unstarred ${count} ${noun}.`)
      onDone()
    })
  }

  async function hide() {
    const result = await hideMessagesForMe(ids)
    if (result.ok) {
      window.dispatchEvent(new CustomEvent<ThreadChangeDetail>(THREAD_CHANGE_EVENT, { detail: { ids: result.changed ?? [], change: { hidden: true } } }))
    }
    return result
  }

  return (
    <div
      role="toolbar"
      aria-label="Selected messages"
      className="sticky bottom-0 z-10 flex items-center gap-1 border-t border-border bg-background/95 pt-3 pr-3 pb-6 pl-[72px] backdrop-blur lg:pt-4 lg:pb-4 lg:pl-4"
    >
      <Button type="button" variant="ghost" size="icon" aria-label="Cancel selection" onClick={onDone} className="size-10 rounded-full">
        <X className="size-5" aria-hidden="true" />
      </Button>
      <p className="min-w-0 flex-1 truncate px-1 text-[15px] font-semibold" aria-live="polite">
        {count} selected
      </p>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={allStarred ? "Unstar selected messages" : "Star selected messages"}
        disabled={pending || count === 0}
        onClick={star}
        className="size-10 rounded-full"
      >
        {allStarred ? <StarOff className="size-5" aria-hidden="true" /> : <Star className="size-5" aria-hidden="true" />}
      </Button>
      <ConfirmDialog
        trigger={
          <Button type="button" variant="ghost" size="icon" aria-label="Delete selected messages for me" disabled={pending || count === 0} className="size-10 rounded-full">
            <EyeOff className="size-5" aria-hidden="true" />
          </Button>
        }
        title={`Delete ${count} ${noun} for you?`}
        description="They're removed from your view only. Everyone else in the chat still sees them."
        confirmLabel="Delete for me"
        action={hide}
        onDone={onDone}
      />
    </div>
  )
}
