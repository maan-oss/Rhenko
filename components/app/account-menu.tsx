"use client"

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react"
import Link from "next/link"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "motion/react"
import { Bookmark, FileText, LogOut, MoreHorizontal, Pencil, Plus, Settings, User } from "lucide-react"
import { switchAccount } from "@/actions/auth"
import { Avatar } from "@/components/app/avatar"
import { BottomSheet } from "@/components/app/bottom-sheet"
import { DIALOG_CLOSE_PHONE, DIALOG_FIT } from "@/components/app/overlay-sizes"
import { SignOutForm } from "@/components/app/sign-out-form"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import type { AccountSummary } from "@/lib/auth"
import { useIsDesktop } from "@/lib/use-media"
import { cn } from "@/lib/utils"

const EASE = [0.22, 1, 0.36, 1] as const
const POPOVER_WIDTH = 300
const noopSubscribe = () => () => {}

// Renders only after the first client paint, so the portal never runs on the server.
function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false)
}

// The accounts on this device, then the places you go most, then (on a phone only) log out. A computer already has the
// log-out icon beside this button, so the popover leaves it out. Rows arrive one after another, like the America.gov menus.
function AccountList({
  accounts,
  pending,
  showLogout,
  onChoose,
  onDone,
}: {
  accounts: AccountSummary[]
  pending: boolean
  showLogout: boolean
  onChoose: (account: AccountSummary) => void
  onDone: () => void
}) {
  const current = accounts.find((account) => account.active)
  const places = [
    { href: current ? `/${current.handle}` : "/", label: "Your profile", Icon: User },
    { href: "/bookmarks", label: "Bookmarks", Icon: Bookmark },
    { href: "/drafts", label: "Drafts", Icon: FileText },
    { href: "/settings", label: "Settings", Icon: Settings },
  ]
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-5 pt-2 pb-3">
        <h2 className="text-[17px] font-semibold tracking-tight">Accounts</h2>
        <div className="flex items-center gap-1">
          <Link
            href="/login?add=1"
            onClick={onDone}
            aria-label="Add an existing account"
            title="Add an existing account"
            className="grid size-9 place-items-center rounded-full text-foreground transition-colors duration-200 outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="size-[20px]" strokeWidth={1.9} aria-hidden="true" />
          </Link>
          <Link
            href="/settings/account"
            onClick={onDone}
            aria-label="Manage accounts"
            title="Manage accounts"
            className="grid size-9 place-items-center rounded-full text-foreground transition-colors duration-200 outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Pencil className="size-[18px]" strokeWidth={1.9} aria-hidden="true" />
          </Link>
        </div>
      </div>
      <div className="flex flex-col px-2">
        {accounts.map((account, index) => (
          <motion.button
            key={account.id}
            type="button"
            aria-current={account.active ? "true" : undefined}
            disabled={pending || account.active}
            onClick={() => onChoose(account)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.03 + index * 0.05, duration: 0.28, ease: EASE }}
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors duration-200 outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent"
          >
            <Avatar user={account} size={44} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold">{account.name}</span>
              <span className="block truncate text-[13px] text-muted-foreground">@{account.handle}</span>
            </span>
            {account.active ? (
              <span className="shrink-0 rounded-full bg-foreground px-3 py-1 text-[12px] font-semibold text-background">Selected</span>
            ) : null}
          </motion.button>
        ))}
      </div>
      <div className="mx-5 my-2 h-px bg-border" />
      <ul className="flex list-none flex-col px-2">
        {places.map(({ href, label, Icon }, index) => (
          <motion.li
            key={label}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.12 + index * 0.04, duration: 0.26, ease: EASE }}
          >
            <Link
              href={href}
              onClick={onDone}
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[15px] font-medium transition-colors duration-200 outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon className="size-[20px] shrink-0" strokeWidth={1.8} aria-hidden="true" />
              {label}
            </Link>
          </motion.li>
        ))}
      </ul>
      {showLogout ? (
        <>
          <div className="mx-5 my-2 h-px bg-border" />
          <SignOutForm onSubmitted={onDone} className="px-2 pb-2">
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-[15px] font-semibold transition-colors duration-200 outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <LogOut className="size-[20px] shrink-0" strokeWidth={1.8} aria-hidden="true" />
              Log out @{current?.handle ?? ""}
            </button>
          </SignOutForm>
        </>
      ) : (
        <div className="pb-2" />
      )}
    </div>
  )
}

// The dot button beside your name. On a computer it opens a popover above it; on a phone it rises as a sheet.
export function AccountSwitcher({ accounts }: { accounts: AccountSummary[] }) {
  const mounted = useMounted()
  const desktop = useIsDesktop()
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ left: number; bottom: number } | null>(null)
  const [pending, startTransition] = useTransition()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !desktop) return
    function onPointer(event: PointerEvent) {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", onPointer)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPointer)
      document.removeEventListener("keydown", onKey)
    }
  }, [open, desktop])

  function toggle() {
    if (open) {
      setOpen(false)
      return
    }
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) {
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8))
      setAnchor({ left, bottom: window.innerHeight - rect.top + 10 })
    }
    setOpen(true)
  }

  function choose(account: AccountSummary) {
    setOpen(false)
    startTransition(async () => {
      const next = await switchAccount(account.id)
      if (next) window.location.assign(next.to)
    })
  }

  const list = (
    <AccountList accounts={accounts} pending={pending} showLogout={!desktop} onChoose={choose} onDone={() => setOpen(false)} />
  )

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-label="Account options"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Switch account"
        className="grid size-9 shrink-0 place-items-center rounded-full text-foreground transition-colors duration-200 outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MoreHorizontal className="size-[20px]" strokeWidth={1.8} aria-hidden="true" />
      </button>
      {desktop ? (
        mounted && anchor
          ? createPortal(
              <AnimatePresence>
                {open ? (
                  <motion.div
                    key="accounts"
                    ref={menuRef}
                    role="dialog"
                    aria-label="Accounts"
                    style={{ left: anchor.left, bottom: anchor.bottom, width: POPOVER_WIDTH, transformOrigin: "bottom left" }}
                    initial={{ opacity: 0, scale: 0.94, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 6 }}
                    transition={{ duration: 0.24, ease: EASE }}
                    className="fixed z-[90] overflow-hidden rounded-[28px] border border-border bg-popover py-2 text-popover-foreground shadow-[0_28px_70px_-20px_rgba(0,0,0,0.5)]"
                  >
                    {list}
                  </motion.div>
                ) : null}
              </AnimatePresence>,
              document.body
            )
          : null
      ) : (
        <BottomSheet open={open} onClose={() => setOpen(false)} label="Accounts">
          {list}
        </BottomSheet>
      )}
    </>
  )
}

// Logs out the account you are signed in as, after asking. Another remembered account takes over if there is one.
export function LogoutButton({ className }: { className?: string }) {
  const [asking, setAsking] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setAsking(true)}
        aria-label="Log out"
        title="Log out"
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full text-foreground transition-colors duration-200 outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring",
          className
        )}
      >
        <LogOut className="size-[19px]" strokeWidth={1.8} aria-hidden="true" />
      </button>
      <LogoutDialog open={asking} onOpenChange={setAsking} />
    </>
  )
}

// The Log out button at the foot of Settings. It asks first, the same as the sidebar button.
export function SettingsLogout() {
  const [asking, setAsking] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="flex h-14 w-full items-center justify-center rounded-full border border-border text-[16px] font-semibold transition-colors duration-200 hover:border-destructive hover:bg-destructive hover:text-destructive-foreground"
      >
        Log out
      </button>
      <LogoutDialog open={asking} onOpenChange={setAsking} />
    </>
  )
}

function LogoutDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-sm", DIALOG_CLOSE_PHONE, DIALOG_FIT)}>
        <DialogTitle className="text-base font-semibold">Log out of Rhenko?</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">You will need to sign in again to see your feed and messages.</DialogDescription>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="h-10 rounded-full px-4">
            Cancel
          </Button>
          <SignOutForm>
            <Button type="submit" className="h-10 rounded-full px-4">
              Log out
            </Button>
          </SignOutForm>
        </div>
      </DialogContent>
    </Dialog>
  )
}
