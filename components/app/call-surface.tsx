"use client"

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Mic, MicOff, Phone, PhoneOff } from "lucide-react"
import { Avatar } from "@/components/app/avatar"
import { acceptCall, declineCall, getCallState, hangUp, subscribeCall, toggleMute, type CallState } from "@/lib/call-engine"
import type { EventPerson } from "@/lib/bus"
import { formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useIsDesktop } from "@/lib/use-media"

// The call on screen. On a computer it is a card in the corner. On a phone it takes the whole screen. Both read the same
// call state, so the two layouts never disagree about what is happening.
export function CallSurface() {
  const call = useSyncExternalStore(subscribeCall, getCallState, getCallState)
  const desktop = useIsDesktop()
  const peer = call.peer
  return (
    <AnimatePresence>
      {peer && call.status !== "idle" ? (
        desktop ? (
          <CallCard key="card" call={call} peer={peer} />
        ) : (
          <CallScreen key="screen" call={call} peer={peer} />
        )
      ) : null}
    </AnimatePresence>
  )
}

function CallCard({ call, peer }: { call: CallState; peer: EventPerson }) {
  return (
    <motion.section
      aria-label={`Voice call with ${peer.name}`}
      initial={{ opacity: 0, y: 28, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 18, scale: 0.97, transition: { duration: 0.2 } }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className="fixed right-6 bottom-6 z-[85] w-[340px] overflow-hidden rounded-[30px] border border-border bg-popover text-popover-foreground shadow-[0_34px_80px_-24px_rgba(0,0,0,0.55)]"
    >
      <div className="flex items-center gap-4 p-5 pb-4">
        <Pulse active={isRinging(call)}>
          <Avatar user={peer} size={60} />
        </Pulse>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-semibold tracking-tight">{peer.name}</p>
          <Status call={call} className="mt-0.5 block text-[14px] text-muted-foreground" />
        </div>
      </div>
      <Controls call={call} size="card" />
    </motion.section>
  )
}

function CallScreen({ call, peer }: { call: CallState; peer: EventPerson }) {
  return (
    <motion.section
      aria-label={`Voice call with ${peer.name}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.22 } }}
      transition={{ duration: 0.28 }}
      className="fixed inset-0 z-[85] flex flex-col items-center justify-between bg-background px-6 pt-[max(72px,env(safe-area-inset-top))] pb-[max(44px,env(safe-area-inset-bottom))] text-foreground"
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 34, delay: 0.05 }}
        className="flex w-full flex-col items-center text-center"
      >
        <Pulse active={isRinging(call)}>
          <Avatar user={peer} size={132} />
        </Pulse>
        <p className="mt-8 max-w-full truncate text-[30px] font-semibold tracking-tight">{peer.name}</p>
        <Status call={call} className="mt-2 block text-[17px] text-muted-foreground" />
      </motion.div>
      <Controls call={call} size="screen" />
    </motion.section>
  )
}

function isRinging(call: CallState): boolean {
  return call.status === "outgoing" || call.status === "incoming"
}

// Rings for a ringing call: two rings grow out from the avatar and fade.
function Pulse({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <span className="relative inline-grid place-items-center">
      {active
        ? [0, 1].map((ring) => (
            <motion.span
              key={ring}
              aria-hidden="true"
              className="absolute inset-0 rounded-full border-2 border-dusk/35"
              animate={{ scale: [1, 1.5], opacity: [0.7, 0] }}
              transition={{ duration: 2.2, repeat: Infinity, delay: ring * 1.1, ease: "easeOut" }}
            />
          ))
        : null}
      <span className="relative">{children}</span>
    </span>
  )
}

// The line under the name: what the call is doing right now. Once connected, it counts up.
function Status({ call, className }: { call: CallState; className?: string }) {
  let text: ReactNode
  switch (call.status) {
    case "outgoing":
      text = "Calling…"
      break
    case "incoming":
      text = "Incoming voice call"
      break
    case "connecting":
      text = "Connecting…"
      break
    case "reconnecting":
      text = "Reconnecting…"
      break
    case "active":
      text = call.connectedAt ? <Elapsed since={call.connectedAt} /> : "Connected"
      break
    case "ended":
      text = call.note
      break
    default:
      text = null
  }
  return (
    <span className={cn("tabular-nums", className)} aria-live="polite">
      {text}
    </span>
  )
}

// Counts the seconds since the call connected. The counter starts at the connection time and ticks each second.
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(since)
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return <>{formatDuration((now - since) / 1000)}</>
}

function Controls({ call, size }: { call: CallState; size: "card" | "screen" }) {
  if (call.status === "ended") return null
  const big = size === "screen"
  if (call.status === "incoming") {
    return (
      <div className={cn("flex items-start justify-around", big ? "w-full max-w-[340px] pb-0" : "px-6 pb-6")}>
        <Control label="Decline" onClick={declineCall} tone="end" big={big}>
          <PhoneOff className={big ? "size-7" : "size-5"} strokeWidth={2} aria-hidden="true" />
        </Control>
        <Control label="Accept" onClick={() => void acceptCall()} tone="accept" big={big}>
          <Phone className={big ? "size-7" : "size-5"} strokeWidth={2} aria-hidden="true" />
        </Control>
      </div>
    )
  }
  const cancelling = call.status === "outgoing"
  return (
    <div className={cn("flex items-start justify-around", big ? "w-full max-w-[340px]" : "px-6 pb-6")}>
      <Control label={call.muted ? "Unmute" : "Mute"} onClick={toggleMute} tone={call.muted ? "muted" : "plain"} big={big} pressed={call.muted}>
        {call.muted ? <MicOff className={big ? "size-7" : "size-5"} strokeWidth={2} aria-hidden="true" /> : <Mic className={big ? "size-7" : "size-5"} strokeWidth={2} aria-hidden="true" />}
      </Control>
      <Control label={cancelling ? "Cancel" : "End"} onClick={hangUp} tone="end" big={big}>
        <PhoneOff className={big ? "size-7" : "size-5"} strokeWidth={2} aria-hidden="true" />
      </Control>
    </div>
  )
}

type Tone = "plain" | "muted" | "accept" | "end"

function Control({
  label,
  onClick,
  tone,
  big,
  pressed,
  children,
}: {
  label: string
  onClick: () => void
  tone: Tone
  big: boolean
  pressed?: boolean
  children: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={pressed}
        className={cn(
          "grid place-items-center rounded-full outline-none transition-[transform,background-color] duration-200 focus-visible:ring-2 focus-visible:ring-ring active:scale-95",
          big ? "size-[76px]" : "size-14",
          tone === "plain" && "bg-muted text-foreground hover:bg-foreground/10",
          tone === "muted" && "bg-foreground text-background",
          tone === "accept" && "bg-dusk text-background hover:opacity-90",
          tone === "end" && "bg-destructive text-destructive-foreground hover:opacity-90"
        )}
      >
        {children}
      </button>
      <span className={cn("text-[13px] text-muted-foreground", big && "text-[14px]")}>{label}</span>
    </div>
  )
}
