"use client"

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { AnimatePresence, motion } from "motion/react"
import { toast } from "sonner"
import { RhenkoSymbol } from "@/components/brand/symbol"
import type { RealtimeEvent } from "@/lib/bus"
import { dismissLiveCall, getCallState, getServerCallState, joinLiveCall, subscribeCall, type LiveGroupCall } from "@/lib/call-engine"
import { pluralize } from "@/lib/format"

type Banner = Extract<RealtimeEvent, { type: "banner" }> & { key: string }

// How long a banner stays before it goes on its own. Swiping it up sends it away at once.
const LIFETIME_MS = 5000
// The newest two are shown; an older one makes way.
const MAX_SHOWN = 2

// The card every banner uses, as the notification pill on iOS and X draws it: a compact translucent pill, the app mark, a bold line
// and a quiet line under it. The same on a phone and a computer.
const CARD =
  "pointer-events-auto relative w-max min-w-[240px] max-w-[min(380px,calc(100vw-1.5rem))] rounded-[28px] bg-popover/75 text-popover-foreground shadow-[0_14px_40px_-14px_rgba(0,0,0,0.4)] ring-1 ring-foreground/10 backdrop-blur-2xl"

// The rise and the swipe are shared by every banner, so they all move the same way.
const ENTER = { initial: { opacity: 0, y: -22, scale: 0.97 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: -14, transition: { duration: 0.16 } } }
const SPRING = { type: "spring", stiffness: 480, damping: 38 } as const

let nextKey = 0

// The in-app banners: a message, a request, a notification or a missed call. They drop from the top centre of the screen, and tapping
// one opens what it is about. A group call going on in one of your groups gets a Join banner that stays until the call ends, you join,
// or you swipe it away.
export function BannerHost() {
  const router = useRouter()
  const pathname = usePathname()
  const call = useSyncExternalStore(subscribeCall, getCallState, getServerCallState)
  const [banners, setBanners] = useState<Banner[]>([])
  const pathRef = useRef(pathname)

  useEffect(() => {
    pathRef.current = pathname
  }, [pathname])

  useEffect(() => {
    function onBanner(event: Event) {
      const detail = (event as CustomEvent<Extract<RealtimeEvent, { type: "banner" }>>).detail
      // A conversation that is open already shows the message, so it gets no banner.
      if (detail.conversationId && pathRef.current === `/messages/${detail.conversationId}`) return
      nextKey += 1
      const banner: Banner = { ...detail, key: `banner-${nextKey}` }
      setBanners((current) => [banner, ...current].slice(0, MAX_SHOWN))
    }
    window.addEventListener("rhenko:banner", onBanner)
    return () => window.removeEventListener("rhenko:banner", onBanner)
  }, [])

  function dismiss(key: string) {
    setBanners((current) => current.filter((banner) => banner.key !== key))
  }

  function open(banner: Banner) {
    dismiss(banner.key)
    router.push(banner.href)
  }

  // Join banners wait while this tab is on a call, and the group's own page has its Join button instead.
  const free = call.status === "idle" || call.status === "ended"
  const joinable = free
    ? call.live.filter((live) => !live.quiet && !live.mine && !live.dismissed && pathname !== `/messages/${live.conversationId}` && live.people.length > 0)
    : []

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[max(10px,env(safe-area-inset-top))] z-[75] flex flex-col items-center gap-2 px-3"
    >
      <AnimatePresence initial={false}>
        {joinable.map((live) => (
          <JoinBanner key={`join-${live.callId}`} live={live} onOpen={() => router.push(`/messages/${live.conversationId}`)} />
        ))}
        {/* The newest is on top; an older one moves down beneath it. */}
        {banners.map((banner) => (
          <BannerCard key={banner.key} banner={banner} onOpen={() => open(banner)} onDismiss={() => dismiss(banner.key)} />
        ))}
      </AnimatePresence>
    </div>
  )
}

// The Rhenko app mark that leads every banner, as a notification's app icon does.
function AppMark() {
  return <RhenkoSymbol label="Rhenko" className="size-9" />
}

function BannerCard({ banner, onOpen, onDismiss }: { banner: Banner; onOpen: () => void; onDismiss: () => void }) {
  // The timer reads the latest dismiss through a ref, so a newer banner does not restart this one's countdown.
  const dismissRef = useRef(onDismiss)
  useEffect(() => {
    dismissRef.current = onDismiss
  })
  useEffect(() => {
    const timer = window.setTimeout(() => dismissRef.current(), LIFETIME_MS)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <motion.div
      {...ENTER}
      transition={SPRING}
      drag="y"
      dragConstraints={{ top: -120, bottom: 0 }}
      dragElastic={{ top: 0.4, bottom: 0 }}
      onDragEnd={(_, info) => {
        if (info.offset.y < -36 || info.velocity.y < -400) onDismiss()
      }}
      className={CARD}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 rounded-[28px] py-2.5 pr-5 pl-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <AppMark />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] leading-5 font-semibold">{banner.title}</span>
          <span className="block truncate text-[14px] leading-5 text-muted-foreground">{banner.preview ?? banner.line}</span>
        </span>
      </button>
    </motion.div>
  )
}

// A group call you can join. It has no countdown: it goes when the call ends, when you join, or when you swipe it away.
function JoinBanner({ live, onOpen }: { live: LiveGroupCall; onOpen: () => void }) {
  const [pending, startTransition] = useTransition()
  const count = live.people.length

  function join() {
    startTransition(async () => {
      const result = await joinLiveCall(live.callId)
      if (!result.ok) toast.error(result.error)
    })
  }

  return (
    <motion.div
      {...ENTER}
      transition={SPRING}
      drag="y"
      dragConstraints={{ top: -120, bottom: 0 }}
      dragElastic={{ top: 0.4, bottom: 0 }}
      onDragEnd={(_, info) => {
        if (info.offset.y < -36 || info.velocity.y < -400) dismissLiveCall(live.callId)
      }}
      className={CARD}
    >
      <div className="flex items-center gap-3 py-2.5 pr-2.5 pl-2.5">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-[28px] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <AppMark />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] leading-5 font-semibold">{live.title}</span>
            <span className="block truncate text-[14px] leading-5 text-muted-foreground">
              Group call · {count} {pluralize(count, "person", "people")}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={join}
          disabled={pending}
          aria-busy={pending}
          className="h-8 shrink-0 rounded-full bg-foreground px-3.5 text-[13px] font-semibold whitespace-nowrap text-background outline-none transition-opacity duration-200 hover:opacity-85 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          Join
        </button>
      </div>
    </motion.div>
  )
}
