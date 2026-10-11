"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { AnimatePresence, motion } from "motion/react"
import { AtSign, BellRing, Heart, ListChecks, MessageCircle, PhoneMissed, Quote, Repeat2, UserPlus, UserRound, type LucideIcon } from "lucide-react"
import { Avatar } from "@/components/app/avatar"
import type { BannerKind, RealtimeEvent } from "@/lib/bus"

type Banner = Extract<RealtimeEvent, { type: "banner" }> & { key: string }

const ICONS: Record<BannerKind, LucideIcon> = {
  message: MessageCircle,
  request: UserRound,
  "missed-call": PhoneMissed,
  like: Heart,
  repost: Repeat2,
  reply: MessageCircle,
  quote: Quote,
  follow: UserPlus,
  mention: AtSign,
  follow_request: UserRound,
  poll: ListChecks,
  post: BellRing,
}

// How long a banner stays before it closes on its own. Hovering pauses the countdown.
const LIFETIME_MS = 6000
// The newest few are shown; older ones make way.
const MAX_SHOWN = 3

let nextKey = 0

// The in-app banners: a new message, a request, a notification or a missed call. They sit in the top right on a
// computer and across the top on a phone, where a swipe clears them. Tapping one opens what it is about.
export function BannerHost() {
  const router = useRouter()
  const pathname = usePathname()
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

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 top-[max(12px,env(safe-area-inset-top))] z-[75] flex flex-col gap-2.5 lg:inset-x-auto lg:top-5 lg:right-5 lg:w-[360px]"
    >
      <AnimatePresence initial={false}>
        {banners.map((banner) => (
          <BannerCard key={banner.key} banner={banner} onOpen={() => open(banner)} onDismiss={() => dismiss(banner.key)} />
        ))}
      </AnimatePresence>
    </div>
  )
}

function BannerCard({ banner, onOpen, onDismiss }: { banner: Banner; onOpen: () => void; onDismiss: () => void }) {
  const Icon = ICONS[banner.kind]
  return (
    <motion.div
      initial={{ opacity: 0, y: -22, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -14, scale: 0.97, transition: { duration: 0.18 } }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      onDragEnd={(_, info) => {
        if (Math.abs(info.offset.x) > 90 || Math.abs(info.velocity.x) > 600) onDismiss()
      }}
      className="group pointer-events-auto relative overflow-hidden rounded-[24px] border border-border bg-popover/95 text-popover-foreground shadow-[0_26px_60px_-20px_rgba(0,0,0,0.5)] backdrop-blur-xl"
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-3.5 rounded-[24px] p-3.5 pr-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="relative shrink-0">
          <Avatar user={banner.from} size={44} />
          <span className="absolute -right-1 -bottom-1 grid size-[22px] place-items-center rounded-full bg-dusk text-background ring-[2.5px] ring-popover">
            <Icon className="size-[12px]" strokeWidth={2.4} aria-hidden="true" />
          </span>
        </span>
        <span className="min-w-0 flex-1 pt-0.5">
          <span className="block truncate text-[15px] leading-tight font-semibold">{banner.title}</span>
          <span className="mt-0.5 line-clamp-2 block text-[14px] leading-snug text-muted-foreground">{banner.line}</span>
          {banner.preview ? (
            <span className="mt-2 line-clamp-2 block rounded-xl bg-muted px-3 py-2 text-[13px] leading-snug text-foreground/80">{banner.preview}</span>
          ) : null}
        </span>
      </button>
      {/* The bar drains over the banner's lifetime and closes it when empty. Hovering or focusing pauses it. */}
      <span
        aria-hidden="true"
        onAnimationEnd={onDismiss}
        style={{ animation: `banner-drain ${LIFETIME_MS}ms linear forwards` }}
        className="absolute inset-x-0 bottom-0 h-[2px] origin-left bg-dusk/70 group-focus-within:[animation-play-state:paused] group-hover:[animation-play-state:paused]"
      />
    </motion.div>
  )
}
