"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { AtSign, Check, ChevronDown, Globe, Users, type LucideIcon } from "lucide-react"
import { REPLY_SETTINGS, type ReplySetting } from "@/lib/rules"
import { cn } from "@/lib/utils"

const EASE = [0.22, 1, 0.36, 1] as const

const OPTIONS: Record<ReplySetting, { title: string; pill: string; detail: string; Icon: LucideIcon }> = {
  everyone: { title: "Everyone", pill: "Everyone can reply", detail: "Anyone can reply to this post.", Icon: Globe },
  following: { title: "Accounts you follow", pill: "Accounts you follow can reply", detail: "Only people you follow can reply.", Icon: Users },
  mentioned: { title: "Only accounts you mention", pill: "Only accounts you mention can reply", detail: "Only people you mention can reply.", Icon: AtSign },
}

// Top right of the composer. The pill names the current choice; the card opens under it with the three
// choices and a Done button, the way X's reply settings do.
export function ReplyPicker({ value, onChange }: { value: ReplySetting; onChange: (next: ReplySetting) => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const current = OPTIONS[value]

  useEffect(() => {
    if (!open) return
    function onPointer(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return
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

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="glass inline-flex h-8 max-w-full items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-foreground transition-colors duration-200 outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <current.Icon className="size-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
        <span className="truncate">{current.pill}</span>
        <ChevronDown className={cn("size-3.5 shrink-0 transition-transform duration-300", open && "rotate-180")} strokeWidth={2} aria-hidden="true" />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            key="card"
            role="dialog"
            aria-label="Who can reply"
            initial={{ opacity: 0, scale: 0.9, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: -4 }}
            transition={{ duration: 0.24, ease: EASE }}
            style={{ transformOrigin: "top right" }}
            className="absolute top-full right-0 z-40 mt-2 w-[min(320px,calc(100vw-40px))] rounded-[24px] border border-border bg-popover p-5 text-popover-foreground shadow-[0_28px_70px_-20px_rgba(0,0,0,0.45)]"
          >
            <h2 className="text-[18px] font-semibold tracking-tight">Who can reply?</h2>
            <p className="mt-1 text-[14px] leading-snug text-muted-foreground">Choose who can reply to this post. Anyone you mention can always reply.</p>
            <div role="radiogroup" aria-label="Who can reply" className="mt-4 flex flex-col gap-1">
              {REPLY_SETTINGS.map((option, index) => {
                const { title, detail, Icon } = OPTIONS[option]
                const selected = option === value
                return (
                  <motion.button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.06 + index * 0.05, duration: 0.28, ease: EASE }}
                    onClick={() => onChange(option)}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors duration-200 outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring",
                      selected && "bg-foreground/5"
                    )}
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-full ring-1 ring-border">
                      <Icon className="size-[18px]" strokeWidth={1.9} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold">{title}</span>
                      <span className="block text-[13px] text-muted-foreground">{detail}</span>
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "grid size-5 shrink-0 place-items-center rounded-full ring-1 transition-colors duration-200",
                        selected ? "metal ring-transparent" : "ring-border"
                      )}
                    >
                      {selected ? <Check className="size-3" strokeWidth={3} /> : null}
                    </span>
                  </motion.button>
                )
              })}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="metal mt-4 h-11 w-full rounded-full text-[15px] font-semibold transition-opacity duration-200 hover:opacity-85"
            >
              Done
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
