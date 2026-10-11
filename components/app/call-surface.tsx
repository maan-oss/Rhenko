"use client"

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Mic, MicOff, Phone, PhoneOff, Users } from "lucide-react"
import { Avatar } from "@/components/app/avatar"
import { GroupCallTiles } from "@/components/app/group-call-tiles"
import { acceptCall, declineCall, getCallState, getServerCallState, hangUp, subscribeCall, toggleMute, type CallState } from "@/lib/call-engine"
import type { EventPerson } from "@/lib/bus"
import { formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useIsDesktop } from "@/lib/use-media"

// The call on screen. On a computer it is a card in the corner. On a phone it takes the whole screen. Both read the same
// call state, so the two layouts never disagree about what is happening. A group call shows a tile for each person.
export function CallSurface({ self }: { self: EventPerson }) {
  const call = useSyncExternalStore(subscribeCall, getCallState, getServerCallState)
  const desktop = useIsDesktop()
  const shown = call.status !== "idle" && (call.peer !== null || call.title !== null)
  return (
    <AnimatePresence>
      {shown ? desktop ? <CallCard key="card" call={call} self={self} /> : <CallScreen key="screen" call={call} self={self} /> : null}
    </AnimatePresence>
  )
}

function isRinging(call: CallState): boolean {
  return call.status === "outgoing" || call.status === "incoming"
}

function showsTiles(call: CallState): boolean {
  return call.kind === "group" && call.status !== "incoming" && call.status !== "ended"
}

function headingOf(call: CallState): string {
  if (call.kind === "group") return call.title ?? "Group call"
  return call.peer?.name ?? ""
}

function labelOf(call: CallState): string {
  if (call.kind === "group") return call.title ? `Group call in ${call.title}` : "Group call"
  return `Voice call with ${call.peer?.name ?? ""}`
}

// A ringing group call shows who is calling. Once in the call, the group itself.
function Lead({ call, size }: { call: CallState; size: number }) {
  if (call.kind === "dm" || call.status === "incoming") return call.peer ? <Avatar user={call.peer} size={size} /> : null
  return (
    <span aria-hidden="true" style={{ width: size, height: size }} className="metal grid shrink-0 place-items-center rounded-full">
      <Users style={{ width: Math.round(size * 0.4), height: Math.round(size * 0.4) }} strokeWidth={1.8} />
    </span>
  )
}

function CallCard({ call, self }: { call: CallState; self: EventPerson }) {
  const group = call.kind === "group"
  return (
    <motion.section
      aria-label={labelOf(call)}
      initial={{ opacity: 0, y: 28, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 18, scale: 0.97, transition: { duration: 0.2 } }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className={cn(
        "fixed right-6 bottom-6 z-[85] max-w-[calc(100vw-3rem)] overflow-hidden rounded-[30px] border border-border bg-popover text-popover-foreground shadow-[0_34px_80px_-24px_rgba(0,0,0,0.55)]",
        group ? "w-[380px]" : "w-[340px]"
      )}
    >
      <div className="flex items-center gap-4 p-5 pb-4">
        <Pulse active={isRinging(call)}>
          <Lead call={call} size={60} />
        </Pulse>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-semibold tracking-tight">{headingOf(call)}</p>
          <Status call={call} className="mt-0.5 line-clamp-2 text-[14px] text-muted-foreground" />
        </div>
      </div>
      {showsTiles(call) ? (
        <div className="max-h-[50vh] overflow-y-auto px-5 pb-4">
          <GroupCallTiles self={self} tiles={call.tiles} muted={call.muted} size="card" />
        </div>
      ) : null}
      <Controls call={call} size="card" />
    </motion.section>
  )
}

function CallScreen({ call, self }: { call: CallState; self: EventPerson }) {
  const tiles = showsTiles(call)
  return (
    <motion.section
      aria-label={labelOf(call)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.22 } }}
      transition={{ duration: 0.28 }}
      className={cn(
        "fixed inset-0 z-[85] flex flex-col items-center bg-background px-5 pb-[max(44px,env(safe-area-inset-bottom))] text-foreground",
        tiles ? "pt-[max(48px,env(safe-area-inset-top))]" : "justify-between pt-[max(72px,env(safe-area-inset-top))]"
      )}
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 34, delay: 0.05 }}
        className="flex w-full flex-col items-center text-center"
      >
        <Pulse active={isRinging(call)}>
          <Lead call={call} size={tiles ? 56 : 132} />
        </Pulse>
        <p className={cn("max-w-full truncate font-semibold tracking-tight", tiles ? "mt-3 text-[22px]" : "mt-8 text-[30px]")}>{headingOf(call)}</p>
        <Status call={call} className={cn("block max-w-full text-muted-foreground", tiles ? "mt-0.5 text-[15px]" : "mt-2 text-[17px]")} />
      </motion.div>
      {tiles ? (
        <div className="mt-5 mb-5 min-h-0 w-full max-w-[420px] flex-1 overflow-y-auto overscroll-contain">
          <GroupCallTiles self={self} tiles={call.tiles} muted={call.muted} size="screen" />
        </div>
      ) : null}
      <Controls call={call} size="screen" />
    </motion.section>
  )
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
  const group = call.kind === "group"
  let text: ReactNode
  switch (call.status) {
    case "outgoing":
      text = group ? "Calling everyone…" : "Calling…"
      break
    case "incoming":
      // A microphone problem while answering shows here, and the ring keeps going.
      text = call.note ?? (group ? `Group call from ${call.peer?.name ?? "someone"}` : "Incoming voice call")
      break
    case "connecting":
      text = "Connecting…"
      break
    case "reconnecting":
      text = "Reconnecting…"
      break
    case "active":
      if (group && call.tiles.length === 0) text = "Only you are here"
      else text = call.connectedAt ? <Elapsed since={call.connectedAt} /> : "Connected"
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
  const icon = big ? "size-7" : "size-5"
  const row = cn("flex shrink-0 items-start justify-around", big ? "w-full max-w-[340px]" : "px-6 pb-6")
  if (call.status === "incoming") {
    // Both stay disabled while the microphone prompt and the answer run, so a second tap does nothing.
    return (
      <div className={row}>
        <Control label="Decline" onClick={declineCall} tone="end" big={big} disabled={call.accepting}>
          <PhoneOff className={icon} strokeWidth={2} aria-hidden="true" />
        </Control>
        <Control label="Accept" onClick={() => void acceptCall()} tone="accept" big={big} disabled={call.accepting} busy={call.accepting}>
          <Phone className={icon} strokeWidth={2} aria-hidden="true" />
        </Control>
      </div>
    )
  }
  const endLabel = call.kind === "group" ? "Leave" : call.status === "outgoing" ? "Cancel" : "End"
  return (
    <div className={row}>
      <Control label={call.muted ? "Unmute" : "Mute"} onClick={toggleMute} tone={call.muted ? "muted" : "plain"} big={big} pressed={call.muted}>
        {call.muted ? <MicOff className={icon} strokeWidth={2} aria-hidden="true" /> : <Mic className={icon} strokeWidth={2} aria-hidden="true" />}
      </Control>
      <Control label={endLabel} onClick={hangUp} tone="end" big={big}>
        <PhoneOff className={icon} strokeWidth={2} aria-hidden="true" />
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
  disabled,
  busy,
  children,
}: {
  label: string
  onClick: () => void
  tone: Tone
  big: boolean
  pressed?: boolean
  disabled?: boolean
  busy?: boolean
  children: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={pressed}
        aria-busy={busy || undefined}
        className={cn(
          "grid place-items-center rounded-full outline-none transition-[transform,background-color,opacity] duration-200 focus-visible:ring-2 focus-visible:ring-ring active:scale-95 disabled:pointer-events-none disabled:opacity-50",
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
