"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { motion } from "motion/react"
import { Bell, Bookmark, ChartNoAxesColumn, CircleDot, FileText, House, List, MessageCircle, Plus, Search, Settings, UsersRound } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Avatar, type AvatarUser } from "@/components/app/avatar"
import { MobileDrawer } from "@/components/app/mobile-drawer"
import { useLiveCounts } from "@/components/app/live-counts"
import type { AccountSummary } from "@/lib/auth"
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

// The sidebar and the phone panel keep every section. The glass dock on phones keeps the four used most.
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

const SPRING = { type: "spring", stiffness: 420, damping: 40 } as const
const DOCK_ITEM = 48
const POST_SIZE = 62
const FOLDED_WIDTH = DOCK_ITEM + 12
// Items collapse by clipping their width. The clip leaves room for the metal shadow beneath each button, which would
// otherwise end in a hard edge at the clip line.
const DOCK_CLIP = "flex-none [overflow:clip] [overflow-clip-margin:24px]"

// A conversation, not the list of conversations. Conversations start with the dock folded (see below).
function isConversation(path: string): boolean {
  return path.startsWith("/messages/") && path !== "/messages/new"
}

// The phone dock: a floating glass pill of the four main sections and your avatar, with a round Post button beside it.
// It folds into the left corner as you scroll down, so the page gets the whole screen, and a tap opens it again. A
// conversation starts folded so its composer can sit at the bottom. The avatar, or a swipe from the left edge, opens the
// left panel.
export function MobileTabBar({
  viewer,
  accounts,
  notifications,
  messages,
}: {
  viewer: AvatarUser & { handle: string; status?: string | null }
  accounts: AccountSummary[]
  notifications: number
  messages: number
}) {
  const path = usePathname()
  const [open, setOpen] = useState(false)
  const conversation = isConversation(path)
  const [folded, setFolded] = useState(conversation)
  // A new page starts with the dock folded only if it is a conversation. Adjusted during render, so it never flashes.
  const [seenPath, setSeenPath] = useState(path)
  if (seenPath !== path) {
    setSeenPath(path)
    setFolded(conversation)
  }
  const navRef = useRef<HTMLElement>(null)
  const [navWidth, setNavWidth] = useState(0)
  const conversationRef = useRef(conversation)
  // The live counts when the app shell provides them, otherwise the numbers the server gave.
  const live = useLiveCounts()
  const unreadNotifications = live?.notifications ?? notifications
  const unreadMessages = live?.messages ?? messages
  const items = buildItems(unreadNotifications, unreadMessages).filter((item) => item.mobile)
  // The section the person has just pressed. The fill moves on the press, before the page has loaded, and the page follows.
  // It is dropped once the page shows that section, or if the page still shows the section it started from.
  const served = items.find((item) => item.active(path))?.href ?? null
  const [pressed, setPressed] = useState<{ from: string | null; to: string } | null>(null)
  const currentHref = pressed && pressed.from === served ? pressed.to : served
  // The section that stays visible when the dock folds. Anything outside the dock falls back to Home.
  const visibleHref = currentHref ?? "/"

  useEffect(() => {
    conversationRef.current = conversation
  }, [conversation])

  // Scrolling down folds the dock; scrolling up opens it. The distance is added up per direction, so a small wobble never
  // flickers it. At the top of the page it opens, except in a conversation, where the composer owns the bottom.
  useEffect(() => {
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
  }, [])

  // The pill's width is the bar less the Post button, so it is measured to animate in pixels.
  useEffect(() => {
    const element = navRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setNavWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // The menu button on the Home header opens the same panel as the avatar.
  useEffect(() => {
    function openMenu() {
      setOpen(true)
    }
    window.addEventListener("rhenko:open-menu", openMenu)
    return () => window.removeEventListener("rhenko:open-menu", openMenu)
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

  const expandedWidth = Math.max(0, navWidth - POST_SIZE - 10)

  return (
    <>
      <nav
        ref={navRef}
        aria-label="Main"
        // A folded dock does not navigate on a tap. Elsewhere the first tap shows the sections. In a conversation the
        // dock stays folded, because the composer needs the bottom row, so the tap opens the left panel, which has every section.
        onClickCapture={(event) => {
          if (!folded) return
          event.preventDefault()
          event.stopPropagation()
          if (conversation) setOpen(true)
          else setFolded(false)
        }}
        // The bar spans the width of the screen, but only the pill and the Post button take taps. The space between
        // them passes through to the page, so the composer's Send button stays reachable under the dock.
        className="pointer-events-none fixed inset-x-4 bottom-[max(16px,env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-[440px] items-center lg:hidden"
      >
        <motion.ul
          initial={false}
          animate={{ width: folded ? FOLDED_WIDTH : navWidth ? expandedWidth : undefined }}
          transition={SPRING}
          className={cn(
            "glass pointer-events-auto flex h-[60px] flex-none items-center justify-between rounded-[32px] p-1.5",
            !navWidth && "w-[calc(100%-72px)]"
          )}
        >
          {items.map(({ href, label, Icon, badge, filled }) => {
            const isActive = href === currentHref
            const hidden = folded && href !== visibleHref
            return (
              <motion.li
                key={href}
                initial={false}
                animate={{ width: hidden ? 0 : DOCK_ITEM, opacity: hidden ? 0 : 1 }}
                transition={SPRING}
                className={cn(DOCK_CLIP, hidden && "pointer-events-none")}
              >
                <Link
                  href={href}
                  aria-label={label}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setPressed({ from: served, to: href })}
                  className="relative grid size-12 place-items-center rounded-full transition-[background-color,transform] duration-200 select-none hover:bg-foreground/5 active:scale-[0.9]"
                >
                  {/* The current section is marked by a heavier icon, filled where the icon has a filled form. No pill behind it. */}
                  <Icon
                    className={cn("relative size-[22px]", isActive ? "text-foreground" : "text-foreground/80")}
                    fill={isActive && filled ? "currentColor" : "none"}
                    strokeWidth={isActive ? 2.2 : 1.75}
                    aria-hidden="true"
                  />
                  {badge && badge > 0 ? (
                    <span className="metal absolute top-0.5 right-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-semibold">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  ) : null}
                </Link>
              </motion.li>
            )
          })}
          <motion.li
            initial={false}
            animate={{ width: folded ? 0 : DOCK_ITEM, opacity: folded ? 0 : 1 }}
            transition={SPRING}
            className={cn(DOCK_CLIP, folded && "pointer-events-none")}
          >
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              aria-expanded={open}
              aria-haspopup="dialog"
              className="grid size-12 place-items-center rounded-full transition-[background-color,transform] duration-200 select-none hover:bg-foreground/5 active:scale-[0.9]"
            >
              <Avatar user={viewer} size={32} />
            </button>
          </motion.li>
        </motion.ul>
        <motion.div
          initial={false}
          animate={{ width: folded ? 0 : POST_SIZE, marginLeft: folded ? 0 : 10, opacity: folded ? 0 : 1 }}
          transition={SPRING}
          className={cn(DOCK_CLIP, folded ? "pointer-events-none" : "pointer-events-auto")}
        >
          <Link
            href="/#compose"
            aria-label="Post"
            className="metal grid size-12 place-items-center rounded-full transition-[opacity,transform] duration-200 hover:opacity-85 active:scale-[0.96]"
          >
            <Plus className="size-[22px]" strokeWidth={2.1} aria-hidden="true" />
          </Link>
        </motion.div>
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
    </>
  )
}
