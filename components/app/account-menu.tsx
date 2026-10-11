"use client"

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react"
import Link from "next/link"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "motion/react"
import { Check, LogOut, MoreHorizontal, Plus } from "lucide-react"
import { logout, switchAccount } from "@/actions/auth"
import { Avatar } from "@/components/app/avatar"
import type { AccountSummary } from "@/lib/auth"
import { cn } from "@/lib/utils"

const EASE = [0.22, 1, 0.36, 1] as const
const MENU_WIDTH = 300
const noopSubscribe = () => () => {}

// Renders only after the first client paint, so the portal never runs on the server.
function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false)
}

// The dot button next to your name. It opens the list of remembered accounts above it,
// with add-account and log-out at the foot. The menu is portalled so no panel can clip it.
export function AccountSwitcher({ accounts }: { accounts: AccountSummary[] }) {
  const mounted = useMounted()
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ left: number; bottom: number } | null>(null)
  const [pending, startTransition] = useTransition()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const current = accounts.find((account) => account.active)

  useEffect(() => {
    if (!open) return
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
  }, [open])

  function toggle() {
    if (open) {
      setOpen(false)
      return
    }
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) {
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8))
      setAnchor({ left, bottom: window.innerHeight - rect.top + 10 })
    }
    setOpen(true)
  }

  function choose(account: AccountSummary) {
    setOpen(false)
    startTransition(async () => {
      await switchAccount(account.id)
    })
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-label="Account options"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Switch account"
        className="grid size-9 shrink-0 place-items-center rounded-full text-foreground transition-colors duration-200 outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MoreHorizontal className="size-[20px]" strokeWidth={1.8} aria-hidden="true" />
      </button>
      {mounted && anchor
        ? createPortal(
            <AnimatePresence>
              {open ? (
                <motion.div
                  key="accounts"
                  ref={menuRef}
                  role="menu"
                  aria-label="Accounts"
                  style={{ left: anchor.left, bottom: anchor.bottom, width: MENU_WIDTH, transformOrigin: "bottom left" }}
                  initial={{ opacity: 0, scale: 0.92, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94, y: 6 }}
                  transition={{ duration: 0.24, ease: EASE }}
                  className="fixed z-[90] overflow-hidden rounded-[24px] border border-border bg-popover p-2 text-popover-foreground shadow-[0_28px_70px_-20px_rgba(0,0,0,0.5)]"
                >
                  <p className="px-3 pt-2 pb-1.5 text-[13px] font-semibold text-muted-foreground">Accounts on this device</p>
                  <div role="none" className="flex flex-col">
                    {accounts.map((account, index) => (
                      <motion.div
                        key={account.id}
                        role="none"
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.05 + index * 0.04, duration: 0.26, ease: EASE }}
                      >
                        <button
                          type="button"
                          role="menuitem"
                          aria-current={account.active ? "true" : undefined}
                          disabled={pending || account.active}
                          onClick={() => choose(account)}
                          className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors duration-200 outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent"
                        >
                          <Avatar user={account} size={40} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-semibold">{account.name}</span>
                            <span className="block truncate text-[13px] text-muted-foreground">@{account.handle}</span>
                          </span>
                          {account.active ? <Check className="size-[18px] shrink-0" strokeWidth={2.2} aria-label="Signed in" /> : null}
                        </button>
                      </motion.div>
                    ))}
                  </div>
                  <div className="my-1.5 h-px bg-border" />
                  <Link
                    href="/login?add=1"
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[15px] font-semibold transition-colors duration-200 outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="grid size-10 place-items-center rounded-full ring-1 ring-border">
                      <Plus className="size-[18px]" strokeWidth={1.9} aria-hidden="true" />
                    </span>
                    Add an existing account
                  </Link>
                  <form action={logout} role="none" onSubmit={() => setOpen(false)}>
                    <button
                      type="submit"
                      role="menuitem"
                      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-[15px] font-semibold transition-colors duration-200 outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="grid size-10 place-items-center rounded-full ring-1 ring-border">
                        <LogOut className="size-[18px]" strokeWidth={1.9} aria-hidden="true" />
                      </span>
                      Log out @{current?.handle ?? ""}
                    </button>
                  </form>
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body
          )
        : null}
    </>
  )
}

// Logs out the account you are signed in as. Another remembered account takes over if there is one.
export function LogoutButton({ className }: { className?: string }) {
  return (
    <form action={logout}>
      <button
        type="submit"
        aria-label="Log out"
        title="Log out"
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full text-foreground transition-colors duration-200 outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring",
          className
        )}
      >
        <LogOut className="size-[19px]" strokeWidth={1.8} aria-hidden="true" />
      </button>
    </form>
  )
}
