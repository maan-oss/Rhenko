"use client"

import { useSyncExternalStore, useTransition } from "react"
import { Phone } from "lucide-react"
import { toast } from "sonner"
import { getCallState, getServerCallState, joinLiveCall, placeGroupCall, subscribeCall } from "@/lib/call-engine"
import { GROUP_CALL_MAX } from "@/lib/call-rules"
import { pluralize } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const FULL = `This call is full. Calls can have up to ${GROUP_CALL_MAX} people.`

// The call button in a group's header. It starts a voice call that rings the other members. While a call is going on
// in the group, it turns into Join, with how many people are in it.
export function GroupCallButton({ conversationId, disabled }: { conversationId: string; disabled?: boolean }) {
  const call = useSyncExternalStore(subscribeCall, getCallState, getServerCallState)
  const [pending, startTransition] = useTransition()
  const busy = call.status !== "idle" && call.status !== "ended"
  const here = busy && call.kind === "group" && call.conversationId === conversationId
  const ringingHere = here && call.status === "incoming"
  const live = call.live.find((entry) => entry.conversationId === conversationId) ?? null
  const count = live?.people.length ?? 0

  function onClick() {
    if (here && !ringingHere) {
      toast("You're already on this call.")
      return
    }
    if (busy && !here) {
      toast(call.status === "incoming" ? "Answer or decline the incoming call first." : "You're on another call.")
      return
    }
    if (live && !live.mine && count >= GROUP_CALL_MAX) {
      toast.error(FULL)
      return
    }
    const target = ringingHere ? call.callId : live?.callId ?? null
    startTransition(async () => {
      const result = target ? await joinLiveCall(target) : await placeGroupCall(conversationId)
      if (!result.ok) toast.error(result.error)
    })
  }

  if ((live && !here) || ringingHere) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || pending}
        aria-busy={pending}
        aria-label={count > 0 ? `Join the group call, ${count} ${pluralize(count, "person", "people")} in it` : "Join the group call"}
        title={disabled ? "Accept the request to join calls" : "Join the call"}
        className="metal inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold whitespace-nowrap outline-none transition-opacity duration-200 hover:opacity-85 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-35"
      >
        <Phone className="size-3.5" aria-hidden="true" />
        Join
        {count > 0 ? <span className="tabular-nums opacity-70">{count}</span> : null}
      </button>
    )
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={here ? "On this call" : "Start a group call"}
      aria-pressed={here || undefined}
      aria-busy={pending}
      title={disabled ? "Accept the request to call" : "Group voice call"}
      className={cn("size-11 rounded-full", here && "bg-muted")}
      disabled={disabled || pending}
      onClick={onClick}
    >
      <Phone className="size-[22px]" strokeWidth={1.9} />
    </Button>
  )
}
