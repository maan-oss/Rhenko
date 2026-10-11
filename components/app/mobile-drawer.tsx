"use client"

import Link from "next/link"
import { useEffect } from "react"
import { AnimatePresence, motion } from "motion/react"
import { ChartNoAxesColumn, FileText, Settings, X } from "lucide-react"
import { Avatar, type AvatarUser } from "@/components/app/avatar"
import { buildItems } from "@/components/app/nav"
import { cn } from "@/lib/utils"

// The left panel on phones. It slides over the page from the left, and its rounded edge
// overlaps the content. It closes on the scrim, the close button, Escape, or a swipe left.
const EASE = [0.22, 1, 0.36, 1] as const

type Props = {
  open: boolean
  onClose: () => void
  viewer: AvatarUser & { handle: string; status?: string | null }
  path: string
  notifications: number
  messages: number
}

export function MobileDrawer({ open, onClose, viewer, path, notifications, messages }: Props) {
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener("keydown", onKey)
    }
  }, [open, onClose])

  const items = buildItems(notifications, messages)
  const extras = [
    { href: "/drafts", label: "Drafts and scheduled", Icon: FileText, badge: 0 },
    { href: "/analytics", label: "Analytics", Icon: ChartNoAxesColumn, badge: 0 },
    { href: "/settings", label: "Settings", Icon: Settings, badge: 0 },
  ]

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            key="scrim"
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-40 bg-foreground/25 backdrop-blur-[2px] lg:hidden"
          />
          <motion.aside
            key="panel"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            initial={{ x: "-110%" }}
            animate={{ x: 0 }}
            exit={{ x: "-110%" }}
            transition={{ duration: 0.42, ease: EASE }}
            drag="x"
            dragConstraints={{ left: -400, right: 0 }}
            dragElastic={0.04}
            onDragEnd={(_, info) => {
              if (info.offset.x < -80 || info.velocity.x < -500) onClose()
            }}
            className="glass fixed top-2 bottom-2 left-2 z-50 flex w-[min(84vw,330px)] flex-col gap-4 overflow-y-auto rounded-[32px] p-4 lg:hidden"
          >
            <div className="flex items-center gap-3">
              <Link href={`/${viewer.handle}`} onClick={onClose} className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-1 transition-colors hover:bg-foreground/5">
                <Avatar user={viewer} size={44} />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold">{viewer.name}</span>
                  <span className="block truncate text-sm text-muted-foreground">@{viewer.handle}</span>
                  {viewer.status ? <span className="block truncate text-[13px] text-foreground/75">{viewer.status}</span> : null}
                </span>
              </Link>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close menu"
                className="grid size-10 shrink-0 place-items-center rounded-full transition-colors hover:bg-foreground/5"
              >
                <X className="size-5" strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>

            <nav aria-label="Menu">
              <ul className="flex flex-col gap-1">
                {[...items, ...extras.map((e) => ({ ...e, filled: false, active: (p: string) => p.startsWith(e.href), mobile: false }))].map((item) => {
                  const active = item.active(path)
                  const count = ("badge" in item ? item.badge : 0) ?? 0
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex h-12 items-center gap-3 rounded-2xl px-3 text-[16px] transition-colors duration-200 hover:bg-foreground/5",
                          active ? "font-semibold" : "font-medium"
                        )}
                      >
                        <item.Icon className="size-[22px] shrink-0" strokeWidth={active ? 2.1 : 1.75} aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {count > 0 ? (
                          <span className="metal grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums">
                            {count > 99 ? "99+" : count}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </nav>

            <Link
              href="/#compose"
              onClick={onClose}
              className="metal mt-auto flex h-12 w-full items-center justify-center rounded-full text-[16px] font-semibold transition-opacity duration-200 hover:opacity-85"
            >
              Post
            </Link>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  )
}
