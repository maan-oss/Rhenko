"use client"

import Link from "@/components/app/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent as ReactMouseEvent, type TouchEvent as ReactTouchEvent } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Bell, Bookmark, ChartNoAxesColumn, CircleDot, FileText, House, List, MessageCircle, Pin, Plus, Search, Settings, SquarePen, UsersRound } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Avatar, type AvatarUser } from "@/components/app/avatar"
import { MobileDrawer } from "@/components/app/mobile-drawer"
import { ComposeSheet } from "@/components/app/compose-sheet"
import type { CircleOption } from "@/components/app/composer"
import { useLiveCounts } from "@/components/app/live-counts"
import type { AccountSummary } from "@/lib/auth"
import { getCallState, getServerCallState, subscribeCall } from "@/lib/call-engine"
import { cn } from "@/lib/utils"

export type NavItemConfig = {
  href: string
  label: string
  Icon: LucideIcon
  badge?: number
  // The active icon fills in, so the current section reads without a background behind it.
  filled: boolean
  active: (path: string) => boolean
  // Whether the item sits in the phone dock. Every item is in the sidebar and the phone panel.
  mobile: boolean
}

// The sidebar and the phone panel keep every section. The white dock on phones keeps the four used most, and your profile.
export function buildItems(notifications: number, messages: number): NavItemConfig[] {
  return [
    { href: "/", label: "Home", Icon: House, filled: true, active: (p) => p === "/", mobile: true },
    { href: "/explore", label: "Explore", Icon: Search, filled: false, active: (p) => p.startsWith("/explore") || p.startsWith("/search") || p.startsWith("/topics"), mobile: true },
    { href: "/connect", label: "Connect", Icon: UsersRound, filled: false, active: (p) => p.startsWith("/connect"), mobile: false },
    { href: "/notifications", label: "Notifications", Icon: Bell, badge: notifications, filled: true, active: (p) => p.startsWith("/notifications"), mobile: true },
    { href: "/messages", label: "Messages", Icon: MessageCircle, badge: messages, filled: true, active: (p) => p.startsWith("/messages"), mobile: true },
    { href: "/bookmarks", label: "Bookmarks", Icon: Bookmark, filled: true, active: (p) => p.startsWith("/bookmarks"), mobile: false },
    { href: "/lists", label: "Lists", Icon: List, filled: false, active: (p) => p.startsWith("/lists"), mobile: false },
    { href: "/circles", label: "Circles", Icon: CircleDot, filled: false, active: (p) => p.startsWith("/circles"), mobile: false },
    { href: "/drafts", label: "Drafts", Icon: FileText, filled: false, active: (p) => p.startsWith("/drafts"), mobile: false },
    { href: "/analytics", label: "Analytics", Icon: ChartNoAxesColumn, filled: false, active: (p) => p.startsWith("/analytics"), mobile: false },
    { href: "/settings", label: "Settings", Icon: Settings, filled: false, active: (p) => p.startsWith("/settings"), mobile: false },
  ]
}

// What the + menu offers beyond a post: the other places a person goes to write, find and keep things.
const COMPOSE_MENU = [
  { href: "/#compose", label: "Write a post", Icon: SquarePen },
  { href: "/messages/new", label: "New message", Icon: MessageCircle },
  { href: "/connect", label: "Find people", Icon: UsersRound },
  { href: "/bookmarks", label: "Bookmarks", Icon: Bookmark },
  { href: "/lists", label: "Lists", Icon: List },
  { href: "/drafts", label: "Drafts", Icon: FileText },
]

const SPRING = { type: "spring", stiffness: 420, damping: 40 } as const
// People who asked their system for less motion get the bar moving in one step, not a spring.
const INSTANT = { duration: 0 } as const
const DOCK_ITEM = 48
// The sections in the dock, left to right: Home, Search, Messages, Notifications. Your profile is the avatar at the end.
const DOCK_ORDER = ["/", "/explore", "/messages", "/notifications"]
// The pill and the Post square are this tall and this round. Expanded, they sit 16px in from each side and 10px apart, so
// the pill is the screen less RESERVED.
const BAR = 56
const RESERVED = 98
// Items collapse by clipping their width. The clip leaves room for the metal shadow beneath each button, which would
// otherwise end in a hard edge at the clip line.
const DOCK_CLIP = "flex-none [overflow:clip] [overflow-clip-margin:24px]"
// How long a press must last to pin a section, or to open the compose menu from the + square.
const HOLD_MS = 420
// Expanded, the dock sits above the home indicator. Folded, the page square sits in the top-left corner and the + square in the
// top-right, under the status bar, so the foot of the screen is left to the content.
const DOCK_BOTTOM = "max(16px, env(safe-area-inset-bottom, 0px))"
const FOLDED_TOP = "env(safe-area-inset-top, 0px)"
// The squares move between the expanded row and the top corners with CSS, so they glide rather than spring.
const MOVE = "transition-[top,left,right,width,border-radius,transform,opacity] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"

// Whether the dock is pinned. A pinned dock stays in its corners through scrolling and comes out only when tapped. It is kept
// on this device, and a page that cannot store it still pins for the visit.
const PIN_KEY = "rhenko-dock-pinned"
const PIN_EVENT = "rhenko-dock-pin"
let memoryPinned = false
function readPinned(): boolean {
  try {
    return localStorage.getItem(PIN_KEY) === "1"
  } catch {
    return memoryPinned
  }
}
function subscribePinned(onChange: () => void): () => void {
  window.addEventListener(PIN_EVENT, onChange)
  window.addEventListener("storage", onChange)
  return () => {
    window.removeEventListener(PIN_EVENT, onChange)
    window.removeEventListener("storage", onChange)
  }
}
function writePinned(value: boolean) {
  memoryPinned = value
  try {
    localStorage.setItem(PIN_KEY, value ? "1" : "0")
  } catch {
    // Storage is blocked. The pin is still kept in memory above.
  }
  window.dispatchEvent(new Event(PIN_EVENT))
}

// A conversation, not the list of conversations. Conversations start with the dock folded (see below).
function isConversation(path: string): boolean {
  return path.startsWith("/messages/") && path !== "/messages/new"
}

// The phone dock. Expanded, it is a floating white pill of Home, Search, Messages, Notifications and your profile (the avatar),
// with the + square beside it at the bottom. Scrolling down folds it: the pill becomes the square of the page you are on, in the
// top-left corner, and the + square moves to the top-right corner. Scrolling up, or a tap, brings it back. A conversation starts
// folded, though the dock stays away there so the composer keeps the foot of the screen. A sideways swipe on the folded square
// moves to the next or previous section without opening it. Holding the + square spins it and opens a menu of the things to do
// next. Holding a page button (the pill, folded or open) pins the dock in its corners, and holding it again unpins it. A pinned
// dock ignores scrolling. The sidebar button on each page, or a swipe from the left edge, opens the left panel, which has every section.
export function MobileTabBar({
  viewer,
  accounts,
  notifications,
  messages,
  circles,
}: {
  viewer: AvatarUser & { handle: string; status?: string | null }
  accounts: AccountSummary[]
  notifications: number
  messages: number
  circles: CircleOption[]
}) {
  const path = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const conversation = isConversation(path)
  // A call in progress or ringing (anything but idle or ended) takes the bar away as well.
  const call = useSyncExternalStore(subscribeCall, getCallState, getServerCallState)
  const inCall = call.status !== "idle" && call.status !== "ended"
  const away = conversation || path === "/messages/new" || inCall
  const pinned = useSyncExternalStore(subscribePinned, readPinned, () => false)
  const [folded, setFolded] = useState(conversation)
  const [menuOpen, setMenuOpen] = useState(false)
  // The composer opens as a pop-up over the page, so the + square and the compose menu never leave the page you are on.
  const [composing, setComposing] = useState(false)
  // A hold on the dock pins it or unpins it. The pin mark on the corner square shows for a moment to confirm it.
  const [pinFlash, setPinFlash] = useState(false)
  // Each open or close turns the + square one more full turn, so it always spins forward.
  const [turns, setTurns] = useState(0)
  // A new page starts with the dock folded only if it is a conversation or pinned. Adjusted during render, so it never flashes.
  const [seenPath, setSeenPath] = useState(path)
  if (seenPath !== path) {
    setSeenPath(path)
    setFolded(conversation || pinned)
    if (menuOpen) {
      setMenuOpen(false)
      setTurns((count) => count + 1)
    }
  }
  const navRef = useRef<HTMLElement>(null)
  const [navWidth, setNavWidth] = useState(0)
  const conversationRef = useRef(conversation)
  // The live counts when the app shell provides them, otherwise the numbers the server gave.
  const live = useLiveCounts()
  const unreadNotifications = live?.notifications ?? notifications
  const unreadMessages = live?.messages ?? messages
  const everyItem = buildItems(unreadNotifications, unreadMessages)
  // The dock's sections, in the order the design gives them. Your profile is the avatar beside them, not a section.
  const items = everyItem.filter((item) => item.mobile).sort((a, b) => DOCK_ORDER.indexOf(a.href) - DOCK_ORDER.indexOf(b.href))
  const profileHref = `/${viewer.handle}`
  const onProfile = path === profileHref || path.startsWith(`${profileHref}/`)
  // The section the person has just pressed. The fill moves on the press, before the page has loaded, and the page follows.
  // It is dropped once the page shows that section, or if the page still shows the section it started from.
  const served = items.find((item) => item.active(path))?.href ?? null
  const [pressed, setPressed] = useState<{ from: string | null; to: string } | null>(null)
  const currentHref = pressed && pressed.from === served ? pressed.to : served
  // A section of the dock is open. On a page outside the dock (Settings, Lists and the rest) none is, and the folded square
  // shows the avatar instead, so it still opens the menu rather than a section that is not open.
  const sectionOpen = currentHref !== null
  const reduce = useReducedMotion()
  const spring = reduce ? INSTANT : SPRING
  // Pressing and holding a section, or a touch that started on the folded square, is tracked here. A hold pins or unpins.
  const holdTimer = useRef<number | undefined>(undefined)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  // A tap that was used for a hold or a swipe is not also a tap.
  const skipTap = useRef(false)
  const plusHold = useRef<number | undefined>(undefined)
  const plusSkip = useRef(false)

  useEffect(() => {
    conversationRef.current = conversation
  }, [conversation])

  // The pin mark stays on the square for a moment, then goes.
  useEffect(() => {
    if (!pinFlash) return
    const id = window.setTimeout(() => setPinFlash(false), 900)
    return () => window.clearTimeout(id)
  }, [pinFlash])

  // The sidebar icon in a page's top-left corner asks the left panel to open.
  useEffect(() => {
    const openPanel = () => setOpen(true)
    window.addEventListener("rhenko:open-menu", openPanel)
    return () => window.removeEventListener("rhenko:open-menu", openPanel)
  }, [])

  // Lets the page drop the bottom room it keeps for the bar while the bar is away.
  useEffect(() => {
    document.documentElement.dataset.navAway = away ? "true" : "false"
  }, [away])

  // While the dock sits in the top corners, the page's top bar leaves each corner room for its square (see globals.css).
  useEffect(() => {
    document.documentElement.dataset.dockFolded = folded && !away ? "true" : "false"
    return () => {
      delete document.documentElement.dataset.dockFolded
    }
  }, [folded, away])

  // Scrolling down folds the dock; scrolling up opens it. The distance is added up per direction, so a small wobble never
  // flickers it. At the top of the page it opens, except in a conversation, where the composer owns the top. A pinned dock
  // ignores scrolling altogether: only a tap moves it.
  useEffect(() => {
    if (pinned) return
    let last = window.scrollY
    let travel = 0
    let frame = 0
    function update() {
      frame = 0
      const y = window.scrollY
      const delta = y - last
      last = y
      travel = (travel >= 0) === (delta >= 0) ? travel + delta : delta
      if (y < 24) {
        if (!conversationRef.current) setFolded(false)
      } else if (travel > 28) {
        setFolded(true)
        travel = 0
      } else if (travel < -10 && !conversationRef.current) {
        setFolded(false)
        travel = 0
      }
    }
    function onScroll() {
      if (!frame) frame = requestAnimationFrame(update)
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [pinned])

  // The width of the dock is measured, so the sections can share the pill in pixels.
  useEffect(() => {
    const element = navRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setNavWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // Touch events, not pointer events: the browser cancels a pointer once a sideways pan starts,
  // but the touch moves keep arriving, so the swipe still reads all the way across.
  useEffect(() => {
    let startX = 0
    let startY = 0
    let tracking = false
    function down(event: TouchEvent) {
      const touch = event.touches[0]
      if (!touch || event.touches.length > 1 || touch.clientX > 24) return
      startX = touch.clientX
      startY = touch.clientY
      tracking = true
    }
    function move(event: TouchEvent) {
      const touch = event.touches[0]
      if (!tracking || !touch) return
      if (Math.abs(touch.clientY - startY) > 40) {
        tracking = false
        return
      }
      if (touch.clientX - startX > 64) {
        tracking = false
        setOpen(true)
      }
    }
    function up() {
      tracking = false
    }
    window.addEventListener("touchstart", down, { passive: true })
    window.addEventListener("touchmove", move, { passive: true })
    window.addEventListener("touchend", up, { passive: true })
    window.addEventListener("touchcancel", up, { passive: true })
    return () => {
      window.removeEventListener("touchstart", down)
      window.removeEventListener("touchmove", move)
      window.removeEventListener("touchend", up)
      window.removeEventListener("touchcancel", up)
    }
  }, [])

  const expandedWidth = Math.max(0, navWidth - RESERVED)
  // Four sections and your profile share the pill. On a 320px phone they shrink to fit beside the + square, and they never
  // grow past DOCK_ITEM. The 4px padding on each side of the pill is 8px in all.
  const slot = navWidth ? Math.min(DOCK_ITEM, Math.floor((expandedWidth - 8) / (items.length + 1))) : DOCK_ITEM

  function clearHold() {
    window.clearTimeout(holdTimer.current)
    holdTimer.current = undefined
  }

  function togglePin() {
    const next = !pinned
    writePinned(next)
    // Pinning tucks the dock into its corners at once, so it is clear what the pin does.
    if (next) setFolded(true)
  }

  function pillTouchStart(event: ReactTouchEvent<HTMLUListElement>) {
    clearHold()
    skipTap.current = false
    const touch = event.touches[0]
    if (!touch || event.touches.length > 1) {
      touchStart.current = null
      return
    }
    touchStart.current = { x: touch.clientX, y: touch.clientY }
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = undefined
      touchStart.current = null
      skipTap.current = true
      togglePin()
      setPinFlash(true)
    }, HOLD_MS)
  }

  function pillTouchMove(event: ReactTouchEvent<HTMLUListElement>) {
    const touch = event.touches[0]
    const start = touchStart.current
    if (!touch || !start) return
    if (Math.abs(touch.clientX - start.x) > 10 || Math.abs(touch.clientY - start.y) > 10) clearHold()
  }

  // A sideways swipe on the folded square moves to the next or previous section, without opening the dock. The left edge is
  // left to the panel, which a swipe from there opens.
  function pillTouchEnd(event: ReactTouchEvent<HTMLUListElement>) {
    clearHold()
    const start = touchStart.current
    touchStart.current = null
    const touch = event.changedTouches[0]
    if (!start || !touch || !folded || !currentHref || start.x <= 24 || skipTap.current) return
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dx) < 48 || Math.abs(dy) > 36) return
    const index = items.findIndex((item) => item.href === currentHref)
    const target = items[dx < 0 ? index + 1 : index - 1]
    if (!target) return
    skipTap.current = true
    setPressed({ from: served, to: target.href })
    router.push(target.href)
  }

  function pillClick(event: ReactMouseEvent<HTMLUListElement>) {
    if (skipTap.current) {
      skipTap.current = false
      event.preventDefault()
      event.stopPropagation()
      return
    }
    // A folded dock does not navigate on a tap: the first tap opens the sections again. With no section open, the avatar is all
    // that shows, and it is a link to your profile, so the tap goes through to the profile.
    if (!folded) return
    if (!sectionOpen) return
    event.preventDefault()
    event.stopPropagation()
    setFolded(false)
  }

  function toggleMenu(next: boolean) {
    setMenuOpen(next)
    setTurns((count) => count + 1)
  }

  function startPlusHold() {
    plusSkip.current = false
    window.clearTimeout(plusHold.current)
    if (menuOpen) return
    plusHold.current = window.setTimeout(() => {
      plusHold.current = undefined
      plusSkip.current = true
      toggleMenu(true)
    }, HOLD_MS)
  }

  function cancelPlusHold() {
    window.clearTimeout(plusHold.current)
    plusHold.current = undefined
  }

  // A tap on the + square opens the composer as a pop-up on this page. With the menu open, the + square closes the menu.
  function tapPlus(event: ReactMouseEvent<HTMLAnchorElement>) {
    event.preventDefault()
    if (plusSkip.current) {
      plusSkip.current = false
      return
    }
    if (menuOpen) {
      toggleMenu(false)
      return
    }
    setComposing(true)
  }

  const expandedTop = `calc(100% - ${BAR}px - ${DOCK_BOTTOM})`
  // The + menu drifts toward its corner as it opens: up from the foot of the screen, or down from the top.
  const menuDrift = folded ? -8 : 8
  const rotation = turns * 360 + (menuOpen ? 45 : 0)

  return (
    <>
      <nav
        ref={navRef}
        inert={away}
        aria-hidden={away || undefined}
        aria-label="Main"
        className="pointer-events-none fixed inset-0 z-30 lg:hidden"
      >
        {/* While the + menu is open, a tap anywhere else closes it. */}
        <AnimatePresence>
          {menuOpen ? (
            <motion.button
              key="scrim"
              type="button"
              aria-label="Close menu"
              onClick={() => toggleMenu(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-auto fixed inset-0 bg-black/10"
            />
          ) : null}
        </AnimatePresence>

        {/* Solid white, not glass. Folded, the pill is the square of the page you are on, in the top-left corner. Its rounded
            corner is the one that faces into the screen. */}
        <ul
          onTouchStart={pillTouchStart}
          onTouchMove={pillTouchMove}
          onTouchEnd={pillTouchEnd}
          onTouchCancel={clearHold}
          onClickCapture={pillClick}
          style={{
            top: folded ? FOLDED_TOP : expandedTop,
            left: folded ? 0 : 16,
            width: folded ? BAR : `calc(100% - ${RESERVED}px)`,
            borderRadius: folded ? "0px 0px 20px 0px" : BAR / 2,
            transform: away ? (folded ? "translateY(-160px)" : "translateY(160px)") : undefined,
            opacity: away ? 0 : 1,
          }}
          className={cn(
            "pointer-events-auto absolute flex h-14 items-center bg-white p-1 text-black shadow-[0_10px_28px_-10px_rgba(0,0,0,0.35),0_1px_3px_rgba(0,0,0,0.12)] ring-1 ring-black/5",
            MOVE,
            folded ? "justify-center" : "justify-between"
          )}
        >
          {items.map(({ href, label, Icon, badge }) => {
            const isActive = href === currentHref
            // When folded, only the section that is open stays in view.
            const hidden = folded && href !== currentHref
            return (
              <motion.li
                key={href}
                initial={false}
                animate={{ width: hidden ? 0 : slot, opacity: hidden ? 0 : 1 }}
                transition={spring}
                className={cn(DOCK_CLIP, hidden && "pointer-events-none")}
              >
                <Link
                  href={href}
                  aria-label={label}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setPressed({ from: served, to: href })}
                  style={{ width: slot, height: slot }}
                  className="relative grid place-items-center rounded-full transition-[background-color,transform] duration-200 select-none hover:bg-foreground/5 active:bg-foreground/10"
                >
                  {/* The current section sits on a soft pill that slides from the section you left to this one. Its icon keeps the outline and gets a heavier stroke. */}
                  {isActive ? <motion.span layoutId="dock-current" aria-hidden="true" className="absolute inset-0 rounded-full bg-black/10" transition={spring} /> : null}
                  <Icon
                    className={cn("relative size-[22px]", isActive ? "text-black" : "text-black/45")}
                    fill="none"
                    strokeWidth={isActive ? 2.2 : 1.75}
                    aria-hidden="true"
                  />
                  {badge && badge > 0 ? (
                    <span className="absolute top-0.5 right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-black px-1 text-[10px] font-semibold text-white">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  ) : null}
                </Link>
              </motion.li>
            )
          })}
          <motion.li
            initial={false}
            animate={{ width: folded && sectionOpen ? 0 : slot, opacity: folded && sectionOpen ? 0 : 1 }}
            transition={spring}
            className={cn(DOCK_CLIP, folded && sectionOpen && "pointer-events-none")}
          >
            {/* Your profile. On the profile itself the soft pill sits behind the avatar, as it sits behind a section. */}
            <Link
              href={profileHref}
              aria-label="Profile"
              aria-current={onProfile ? "page" : undefined}
              style={{ width: slot, height: slot }}
              className="relative grid place-items-center rounded-full transition-[background-color,transform] duration-200 select-none hover:bg-foreground/5 active:bg-foreground/10"
            >
              {onProfile ? <motion.span layoutId="dock-current" aria-hidden="true" className="absolute inset-0 rounded-full bg-black/10" transition={spring} /> : null}
              <span className="relative grid place-items-center">
                <Avatar user={viewer} size={32} />
              </span>
            </Link>
          </motion.li>
        </ul>

        {/* A hold pins or unpins the dock. The pin mark sits where the pill is, for a moment, so the hold is seen to land. */}
        <AnimatePresence>
          {pinFlash ? (
            <motion.span
              key="pin-flash"
              aria-hidden="true"
              initial={reduce ? false : { opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={spring}
              style={{
                top: folded ? FOLDED_TOP : expandedTop,
                left: folded ? 0 : 16,
                width: folded ? BAR : `calc(100% - ${RESERVED}px)`,
                borderRadius: folded ? "0px 0px 20px 0px" : BAR / 2,
              }}
              className="pointer-events-none absolute grid h-14 place-items-center bg-white text-black shadow-[0_10px_28px_-10px_rgba(0,0,0,0.35),0_1px_3px_rgba(0,0,0,0.12)] ring-1 ring-black/5"
            >
              <Pin className="size-[22px]" strokeWidth={2} />
            </motion.span>
          ) : null}
        </AnimatePresence>

        {/* Always in view: the bottom-right square when expanded, and the top-right corner when folded. Holding it spins it
            and opens the menu. */}
        <Link
          href="/#compose"
          aria-label="Post"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onTouchStart={startPlusHold}
          onTouchMove={cancelPlusHold}
          onTouchEnd={cancelPlusHold}
          onTouchCancel={cancelPlusHold}
          onClick={tapPlus}
          style={{
            top: folded ? FOLDED_TOP : expandedTop,
            right: folded ? 0 : 16,
            borderRadius: folded ? "0px 0px 0px 20px" : "50%",
            transform: away ? (folded ? "translateY(-160px)" : "translateY(160px)") : undefined,
            opacity: away ? 0 : 1,
          }}
          className={cn(
            "pointer-events-auto metal absolute grid size-14 place-items-center transition-[top,right,border-radius,transform,opacity,filter] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:opacity-85 active:opacity-75 motion-reduce:transition-none",
          )}
        >
          <Plus
            className="size-[22px]"
            strokeWidth={2.1}
            aria-hidden="true"
            style={{ transform: `rotate(${rotation}deg)`, transition: reduce ? "none" : "transform 480ms cubic-bezier(0.22,1,0.36,1)" }}
          />
        </Link>

        {/* The + menu. Folded, it drops from the top-right corner; expanded, it rises above the + square. */}
        <AnimatePresence>
          {menuOpen ? (
            <motion.div
              key="menu"
              role="menu"
              aria-label="Compose and more"
              initial={reduce ? false : { opacity: 0, scale: 0.92, y: menuDrift }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: menuDrift }}
              transition={spring}
              style={
                folded
                  ? { top: `calc(${FOLDED_TOP} + ${BAR + 8}px)`, right: 12, transformOrigin: "top right" }
                  : { bottom: `calc(${DOCK_BOTTOM} + ${BAR + 8}px)`, right: 16, transformOrigin: "bottom right" }
              }
              className="pointer-events-auto absolute w-[220px] rounded-[22px] bg-white p-1.5 text-black shadow-[0_18px_40px_-14px_rgba(0,0,0,0.4),0_1px_3px_rgba(0,0,0,0.12)] ring-1 ring-black/5"
            >
              {COMPOSE_MENU.map(({ href, label, Icon }) => (
                <Link
                  key={href}
                  href={href}
                  role="menuitem"
                  onClick={(event) => {
                    toggleMenu(false)
                    if (href === "/#compose") {
                      event.preventDefault()
                      setComposing(true)
                    }
                  }}
                  className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[15px] font-semibold transition-colors duration-150 hover:bg-foreground/5 active:bg-foreground/10"
                >
                  <Icon className="size-[20px]" strokeWidth={1.9} aria-hidden="true" />
                  {label}
                </Link>
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </nav>
      <MobileDrawer
        open={open}
        onClose={() => setOpen(false)}
        viewer={viewer}
        accounts={accounts}
        path={path}
        notifications={unreadNotifications}
        messages={unreadMessages}
      />
      <ComposeSheet open={composing} onClose={() => setComposing(false)} viewer={viewer} circles={circles} />
    </>
  )
}
