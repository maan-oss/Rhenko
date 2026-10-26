"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { AtSign, Check, Globe, Users, type LucideIcon } from "lucide-react"
import { REPLY_SETTINGS, type ReplySetting } from "@/lib/rules"

const SPRING = { type: "spring", stiffness: 420, damping: 40 } as const
const INSTANT = { duration: 0 } as const

const OPTIONS: Record<ReplySetting, { title: string; Icon: LucideIcon }> = {
  everyone: { title: "Everyone", Icon: Globe },
  following: { title: "Accounts you follow", Icon: Users },
  mentioned: { title: "Only accounts you mention", Icon: AtSign },
}

// The choices as a list: an icon, the label, and a check on the one in use. Picking a row sets it and closes the list.
function ReplyList({ value, onPick }: { value: ReplySetting; onPick: (next: ReplySetting) => void }) {
  return (
    <div role="radiogroup" aria-label="Who can reply" className="flex flex-col gap-0.5">
      {REPLY_SETTINGS.map((option) => {
        const { title, Icon } = OPTIONS[option]
        const selected = option === value
        return (
          <motion.button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            variants={{ hidden: { opacity: 0, scale: 0.94 }, shown: { opacity: 1, scale: 1 } }}
            onClick={() => onPick(option)}
            className="flex items-center gap-3.5 rounded-2xl px-3.5 py-3 text-left transition-colors duration-200 outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon className="size-[20px] shrink-0" strokeWidth={1.9} aria-hidden="true" />
            <span className="min-w-0 flex-1 text-[15px] font-medium">{title}</span>
            {selected ? <Check className="size-[18px] shrink-0" strokeWidth={2.4} aria-hidden="true" /> : null}
          </motion.button>
        )
      })}
    </div>
  )
}

// A round icon in the top-right corner of the composer, beside the first line of text, shows who can reply. Tapping it opens
// a small card anchored to the icon, on a phone and a computer alike. The card grows from the icon's corner, and its rows
// stack in one after another. Nothing slides up from below.
export function ReplyPicker({ value, onChange }: { value: ReplySetting; onChange: (next: ReplySetting) => void }) {
  const reduce = useReducedMotion()
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

  function pick(next: ReplySetting) {
    onChange(next)
    setOpen(false)
  }

  const card = {
    hidden: { opacity: 0, scale: 0.92, transition: reduce ? INSTANT : { duration: 0.14 } },
    shown: { opacity: 1, scale: 1, transition: reduce ? INSTANT : { ...SPRING, staggerChildren: 0.035, delayChildren: 0.03 } },
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Who can reply: ${current.title}`}
        title={`Who can reply: ${current.title}`}
        onClick={() => setOpen((value) => !value)}
        className="tap-44 glass grid size-10 place-items-center rounded-full text-foreground transition-colors duration-200 outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring sm:size-8"
      >
        <current.Icon className="size-[16px]" strokeWidth={2} aria-hidden="true" />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            key="card"
            role="dialog"
            aria-label="Who can reply"
            variants={card}
            initial={reduce ? false : "hidden"}
            animate="shown"
            exit="hidden"
            style={{ transformOrigin: "top right" }}
            className="absolute top-full right-0 z-40 mt-2 w-[296px] rounded-[24px] border border-border bg-popover p-2 text-popover-foreground shadow-[0_28px_70px_-20px_rgba(0,0,0,0.45)]"
          >
            <p className="px-3.5 pt-2 pb-1.5 text-[13px] font-semibold text-muted-foreground">Who can reply?</p>
            <ReplyList value={value} onPick={pick} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
