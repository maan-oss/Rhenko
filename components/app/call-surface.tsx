"use client"

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Mic, MicOff, Phone, PhoneOff, ScreenShare, ScreenShareOff, Users, Video, VideoOff } from "lucide-react"
import { toast } from "sonner"
import { Avatar } from "@/components/app/avatar"
import { GroupCallTiles } from "@/components/app/group-call-tiles"
import {
  acceptCall,
  canCaptureScreen,
  declineCall,
  getCallState,
  getServerCallState,
  hangUp,
  startCamera,
  startScreenShare,
  stopScreenShare,
  subscribeCall,
  toggleCamera,
  toggleMute,
  type CallState,
} from "@/lib/call-engine"
import type { EventPerson } from "@/lib/bus"
import { formatDuration } from "@/lib/format"
import { pictureFit, pictureLead, showsShareButton } from "@/lib/screen-share"
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
  return `${call.video ? "Video" : "Voice"} call with ${call.peer?.name ?? ""}`
}

// The pictures of a video call, or of a shared screen, are shown once the call has an answer, and until it ends.
function showsPicture(call: CallState): boolean {
  const live = call.status === "connecting" || call.status === "active" || call.status === "reconnecting" || call.status === "outgoing"
  return call.kind === "dm" && live && leadOf(call) !== null
}

function leadOf(call: CallState) {
  return pictureLead({ remoteScreen: call.remoteScreen, video: call.video, sharing: call.localScreen !== null })
}

// Share screen is offered in a connected one-to-one call, in a browser that can capture a screen. Group calls are voice
// only (lib/screen-share.ts says why), and most phones can't share, so the button is hidden in both.
function showsShare(call: CallState): boolean {
  return showsShareButton({
    kind: call.kind,
    people: call.kind === "dm" ? 2 : call.tiles.length + 1,
    status: call.status,
    sharing: call.localScreen !== null,
    supported: canCaptureScreen(),
  })
}

// The desktop card widens while the other person shares their screen, so what they show can be read.
function cardWidth(call: CallState): string {
  if (call.kind === "group") return "w-[380px]"
  return call.remoteScreen && showsPicture(call) ? "w-[560px]" : "w-[340px]"
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
  return (
    <motion.section
      aria-label={labelOf(call)}
      initial={{ opacity: 0, y: 28, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 18, scale: 0.97, transition: { duration: 0.2 } }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className={cn(
        "fixed right-6 bottom-6 z-[85] max-w-[calc(100vw-3rem)] overflow-hidden rounded-[30px] border border-border bg-popover text-popover-foreground shadow-[0_34px_80px_-24px_rgba(0,0,0,0.55)]",
        "transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        cardWidth(call)
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
      {showsPicture(call) ? (
        <div className="px-5 pb-4">
          <Picture call={call} className="aspect-video w-full" />
        </div>
      ) : null}
      <Controls call={call} size="card" />
      <ShareNews call={call} />
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
          <Lead call={call} size={tiles || showsPicture(call) ? 56 : 132} />
        </Pulse>
        <p className={cn("max-w-full truncate font-semibold tracking-tight", tiles ? "mt-3 text-[22px]" : "mt-8 text-[30px]")}>{headingOf(call)}</p>
        <Status call={call} className={cn("block max-w-full text-muted-foreground", tiles ? "mt-0.5 text-[15px]" : "mt-2 text-[17px]")} />
      </motion.div>
      {tiles ? (
        <div className="mt-5 mb-5 min-h-0 w-full max-w-[420px] flex-1 overflow-y-auto overscroll-contain">
          <GroupCallTiles self={self} tiles={call.tiles} muted={call.muted} size="screen" />
        </div>
      ) : null}
      {showsPicture(call) ? (
        <div className={cn("mt-4 mb-5 flex min-h-0 w-full flex-1", call.remoteScreen ? "max-w-[960px]" : "max-w-[520px]")}>
          <Picture call={call} className="size-full" />
        </div>
      ) : null}
      <Controls call={call} size="screen" />
      <ShareNews call={call} />
    </motion.section>
  )
}

// Tells screen readers when the other person starts sharing their screen. The region is always there, so the change is
// read out.
function ShareNews({ call }: { call: CallState }) {
  if (call.kind !== "dm") return null
  return (
    <span className="sr-only" aria-live="polite">
      {call.remoteScreen && call.status !== "ended" ? `${call.peer?.name ?? "The other person"} is sharing their screen.` : ""}
    </span>
  )
}

// The two pictures of a call: the other person's, in the frame, and this person's own in the corner. A shared screen is
// shown whole, with a label, since cropping it would cut off what is being shown. A camera fills the frame, and one
// that is off shows as a plain frame, so the call stays readable. While this person shares, the corner shows the
// screen going out rather than the camera it replaced. In a voice call their own screen fills the frame instead.
function Picture({ call, className }: { call: CallState; className?: string }) {
  const name = call.peer?.name ?? "the other person"
  const lead = leadOf(call)
  const cornerScreen = lead === "my-screen" ? null : call.localScreen
  return (
    <div className={cn("relative overflow-hidden rounded-[22px] bg-muted", className)}>
      {lead === "their-screen" ? (
        call.remoteVideo ? (
          <VideoFeed stream={call.remoteVideo} label={`Screen shared by ${name}`} fit={pictureFit(lead)} />
        ) : (
          <Waiting>Waiting for their screen…</Waiting>
        )
      ) : lead === "their-camera" ? (
        call.remoteVideo ? (
          <VideoFeed stream={call.remoteVideo} label={`Video of ${name}`} fit={pictureFit(lead)} />
        ) : (
          <Waiting>Waiting for their video…</Waiting>
        )
      ) : lead === "my-screen" && call.localScreen ? (
        <VideoFeed stream={call.localScreen} label="Your shared screen" fit={pictureFit(lead)} />
      ) : null}
      {lead === "their-screen" ? <ShareTag>Sharing screen</ShareTag> : lead === "my-screen" ? <ShareTag>You&apos;re sharing your screen</ShareTag> : null}
      {cornerScreen ? (
        <div className="absolute right-3 bottom-3 aspect-video w-[34%] max-w-[160px] overflow-hidden rounded-xl border border-border bg-background">
          <VideoFeed stream={cornerScreen} label="Your shared screen" fit="contain" />
        </div>
      ) : call.localVideo ? (
        <div className="absolute right-3 bottom-3 aspect-[4/3] w-[30%] max-w-[132px] overflow-hidden rounded-xl border border-border bg-background">
          <VideoFeed stream={call.localVideo} label="Your camera" mirror muted hidden={call.cameraOff} />
        </div>
      ) : null}
    </div>
  )
}

function Waiting({ children }: { children: ReactNode }) {
  return <p className="grid size-full place-items-center px-6 text-center text-[14px] text-muted-foreground">{children}</p>
}

// The small label on a shared screen, at the top left, clear of this person's corner picture.
function ShareTag({ children }: { children: ReactNode }) {
  return (
    <span className="pointer-events-none absolute top-3 left-3 inline-flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-full bg-background/90 px-2.5 py-1 text-xs font-semibold text-foreground">
      <ScreenShare className="size-3.5 shrink-0" strokeWidth={2.2} aria-hidden="true" />
      <span className="truncate">{children}</span>
    </span>
  )
}

// Plays a stream in a picture. The local camera is muted and mirrored, the way a mirror would show it. A camera fills
// its frame (cover); a screen is fitted whole inside it (contain).
function VideoFeed({
  stream,
  label,
  mirror = false,
  muted = true,
  hidden = false,
  fit = "cover",
}: {
  stream: MediaStream
  label: string
  mirror?: boolean
  muted?: boolean
  hidden?: boolean
  fit?: "cover" | "contain"
}) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    element.srcObject = stream
    void element.play().catch(() => {})
    return () => {
      element.srcObject = null
    }
  }, [stream])
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      aria-label={label}
      className={cn("size-full", fit === "contain" ? "object-contain" : "object-cover", mirror && "-scale-x-100", hidden && "invisible")}
    />
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
              className="absolute inset-0 rounded-full border-2 border-foreground/35"
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
      text = call.note ?? (group ? `Group call from ${call.peer?.name ?? "someone"}` : call.video ? "Incoming video call" : "Incoming voice call")
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
  const share = showsShare(call)
  const sharing = call.localScreen !== null
  const row = cn("flex w-full shrink-0 items-start justify-around", big ? "max-w-[340px]" : "px-6 pb-6")
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
  const controls = (
    <div className={row}>
      <Control label={call.muted ? "Unmute" : "Mute"} onClick={toggleMute} tone={call.muted ? "muted" : "plain"} big={big} pressed={call.muted}>
        {call.muted ? <MicOff className={icon} strokeWidth={2} aria-hidden="true" /> : <Mic className={icon} strokeWidth={2} aria-hidden="true" />}
      </Control>
      {call.kind === "dm" && call.localVideo ? (
        <Control
          label={call.cameraOff ? "Camera on" : "Camera off"}
          onClick={toggleCamera}
          tone={call.cameraOff ? "muted" : "plain"}
          big={big}
          pressed={call.cameraOff}
        >
          {call.cameraOff ? <VideoOff className={icon} strokeWidth={2} aria-hidden="true" /> : <Video className={icon} strokeWidth={2} aria-hidden="true" />}
        </Control>
      ) : null}
      {call.kind === "dm" && !call.localVideo && (call.status === "active" || call.status === "connecting" || call.status === "reconnecting") ? (
        // The screen holds this side's picture while it is shared, so the camera waits for the share to stop.
        <Control label="Start camera" onClick={() => void startCamera()} tone="plain" big={big} disabled={call.cameraStarting || sharing} busy={call.cameraStarting}>
          <Video className={icon} strokeWidth={2} aria-hidden="true" />
        </Control>
      ) : null}
      <Control label={endLabel} onClick={hangUp} tone="end" big={big}>
        <PhoneOff className={icon} strokeWidth={2} aria-hidden="true" />
      </Control>
    </div>
  )
  if (!share) return controls
  // Share screen sits on its own line above the round controls, so four controls never crowd a phone-width row and
  // its label always reads in full.
  return (
    <div className={cn("flex w-full shrink-0 flex-col items-center", big ? "gap-6" : "gap-4")}>
      <ShareButton sharing={sharing} starting={call.shareStarting} blocked={call.cameraStarting} big={big} />
      {controls}
    </div>
  )
}

// Opens the browser's screen picker straight from the tap. Closing the picker says nothing; a real failure says why.
function shareScreen(): void {
  void startScreenShare().then((result) => {
    if (!result.ok) toast.error(result.error)
  })
}

// Starts or stops sharing this person's screen. While a share is on it is filled in ink, like the other controls
// that are switched on, and names what a press does next.
function ShareButton({ sharing, starting, blocked, big }: { sharing: boolean; starting: boolean; blocked: boolean; big: boolean }) {
  const icon = big ? "size-5" : "size-[18px]"
  return (
    <button
      type="button"
      onClick={sharing ? stopScreenShare : shareScreen}
      disabled={starting || blocked}
      aria-pressed={sharing}
      aria-busy={starting || undefined}
      className={cn(
        "tap-44 inline-flex items-center gap-2 rounded-full font-semibold whitespace-nowrap outline-none transition-[transform,background-color,opacity] duration-200 focus-visible:ring-2 focus-visible:ring-ring active:opacity-75 disabled:pointer-events-none disabled:opacity-50",
        big ? "h-11 px-5 text-[15px]" : "h-10 px-4 text-[14px]",
        sharing ? "bg-foreground text-background hover:opacity-90" : "bg-muted text-foreground hover:bg-foreground/10"
      )}
    >
      {sharing ? <ScreenShareOff className={icon} strokeWidth={2} aria-hidden="true" /> : <ScreenShare className={icon} strokeWidth={2} aria-hidden="true" />}
      {sharing ? "Stop sharing" : "Share screen"}
    </button>
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
          "grid place-items-center rounded-full outline-none transition-[transform,background-color,opacity] duration-200 focus-visible:ring-2 focus-visible:ring-ring active:opacity-75 disabled:pointer-events-none disabled:opacity-50",
          big ? "size-[76px]" : "size-14",
          tone === "plain" && "bg-muted text-foreground hover:bg-foreground/10",
          tone === "muted" && "bg-foreground text-background",
          tone === "accept" && "bg-foreground text-background hover:opacity-90",
          tone === "end" && "bg-destructive text-destructive-foreground hover:opacity-90"
        )}
      >
        {children}
      </button>
      <span className={cn("text-[13px] text-muted-foreground", big && "text-[14px]")}>{label}</span>
    </div>
  )
}
