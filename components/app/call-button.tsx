"use client"

import { useSyncExternalStore, useTransition } from "react"
import { Phone } from "lucide-react"
import { toast } from "sonner"
import type { EventPerson } from "@/lib/bus"
import { getCallState, getServerCallState, placeCall, subscribeCall } from "@/lib/call-engine"
import { Button } from "@/components/ui/button"

// Starts a voice call with the other person in a one-to-one chat. The call rings their devices and connects directly
// between the two browsers. While they are ringing you, it answers them.
export function CallButton({ conversationId, peer, disabled }: { conversationId: string; peer: EventPerson; disabled?: boolean }) {
  const call = useSyncExternalStore(subscribeCall, getCallState, getServerCallState)
  const [pending, startTransition] = useTransition()
  const busy = call.status !== "idle" && call.status !== "ended"
  const ringingHere = call.status === "incoming" && call.kind === "dm" && call.conversationId === conversationId

  function onClick() {
    if (busy && !ringingHere) {
      toast(
        call.status === "incoming"
          ? "Answer or decline the incoming call first."
          : call.conversationId === conversationId
            ? "You're already on this call."
            : "You're on another call."
      )
      return
    }
    startTransition(async () => {
      const result = await placeCall(conversationId, peer)
      if (!result.ok) toast.error(result.error)
    })
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={ringingHere ? `Answer ${peer.name}` : `Call ${peer.name}`}
      aria-busy={pending}
      title={disabled ? "Accept the request to call" : "Voice call"}
      className="rounded-full"
      disabled={disabled || pending}
      onClick={onClick}
    >
      <Phone className="size-4" />
    </Button>
  )
}
