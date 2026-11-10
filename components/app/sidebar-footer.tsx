"use client"

import Link from "@/components/app/link"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import type { AccountSummary } from "@/lib/auth"
import { AccountSwitcher, LogoutButton } from "@/components/app/account-menu"
import { Avatar } from "@/components/app/avatar"
import { MORPH } from "@/components/app/motion"
import { cn } from "@/lib/utils"

const EASE = "ease-[cubic-bezier(0.22,1,0.36,1)]"

export type FooterViewer = { id: string; name: string; handle: string; avatarFile: string | null; status?: string | null }

// The bottom of the sidebar and the left panel: Post, then your profile with its account menu and log out. Closing the rail
// folds Post away; the avatar is what stays.
export function SidebarFooter({
  viewer,
  accounts,
  collapsed = false,
  onNavigate,
}: {
  viewer: FooterViewer
  accounts: AccountSummary[]
  collapsed?: boolean
  onNavigate?: () => void
}) {
  const reduce = useReducedMotion()
  const transition = reduce ? { duration: 0 } : MORPH
  return (
    <div className="flex flex-col gap-3">
      <AnimatePresence initial={false}>
        {collapsed ? null : (
          <motion.div
            key="post"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={transition}
            style={{ transformOrigin: "left center" }}
          >
            <Link
              href="/#compose"
              onClick={onNavigate}
              className="metal flex h-11 w-full items-center justify-center rounded-full text-[16px] font-semibold transition-opacity duration-300 hover:opacity-85 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Post
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
      <div className={cn("flex min-h-12 items-center gap-1", collapsed ? "justify-center" : "")}>
        <Link
          href={`/${viewer.handle}`}
          onClick={onNavigate}
          aria-label={`${viewer.name}, your profile`}
          className="group flex min-w-0 flex-1 items-center gap-3 rounded-full py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title={collapsed ? viewer.name : undefined}
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full ring-2 ring-transparent transition-[box-shadow] duration-300 group-hover:ring-foreground/25">
            <Avatar user={viewer} size={36} />
          </span>
          <span className={cn("min-w-0 flex-1 overflow-hidden transition-[opacity,translate] duration-300", EASE, collapsed ? "hidden" : "block")}>
            <span className="block truncate text-[15px] font-semibold">{viewer.name}</span>
            <span className="block truncate text-[13px] text-muted-foreground">@{viewer.handle}</span>
            {viewer.status ? <span className="block truncate text-[13px] text-foreground/80">{viewer.status}</span> : null}
          </span>
        </Link>
        {collapsed ? null : (
          <>
            <AccountSwitcher accounts={accounts} />
            <LogoutButton />
          </>
        )}
      </div>
    </div>
  )
}
