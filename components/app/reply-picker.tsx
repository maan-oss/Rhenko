"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { AtSign, Check, ChevronDown, Globe, Users, type LucideIcon } from "lucide-react"
import { BottomSheet } from "@/components/app/bottom-sheet"
import { REPLY_SETTINGS, type ReplySetting } from "@/lib/rules"
import { useIsDesktop } from "@/lib/use-media"

const EASE = [0.22, 1, 0.36, 1] as const

// `title` names the choice in the list. `pill` is what the composer says, in X's words.
const OPTIONS: Record<ReplySetting, { title: string; pill: string; Icon: LucideIcon }> = {
  everyone: { title: "Everyone", pill: "Everyone can reply", Icon: Globe },
  following: { title: "Accounts you follow", pill: "Accounts you follow can reply", Icon: Users },
  mentioned: { title: "Only accounts you mention", pill: "Only accounts you mention can reply", Icon: AtSign },
}

// The choices as a list, the way X shows them: an icon, the label, and a check on the one in use.
// Picking a row sets it and closes the list. Rows arrive one after another.
function ReplyList({ value, onPick }: { value: ReplySetting; onPick: (next: ReplySetting) => void }) {
  return (
    <div role="radiogroup" aria-label="Who can reply" className="flex flex-col gap-0.5">
      {REPLY_SETTINGS.map((option, index) => {
        const { title, Icon } = OPTIONS[option]
        const selected = option === value
        return (
          <motion.button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.03 + index * 0.045, duration: 0.26, ease: EASE }}
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

// A pill under the composer's text says who can reply. Tapping it opens the list: on a computer it drops below the pill,
// on a phone it rises as a sheet titled "Who can reply?".
export function ReplyPicker({ value, onChange }: { value: ReplySetting; onChange: (next: ReplySetting) => void }) {
  const desktop = useIsDesktop()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const current = OPTIONS[value]

  useEffect(() => {
    if (!open || !desktop) return
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
  }, [open, desktop])

  function pick(next: ReplySetting) {
    onChange(next)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Who can reply: ${current.title}`}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-[13px] font-semibold whitespace-nowrap text-foreground transition-colors duration-200 outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring max-sm:h-9"
      >
        <current.Icon className="size-[15px] shrink-0" strokeWidth={2} aria-hidden="true" />
        {current.pill}
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={2} aria-hidden="true" />
      </button>

      {desktop ? (
        <AnimatePresence>
          {open ? (
            <motion.div
              key="card"
              role="dialog"
              aria-label="Who can reply"
              initial={{ opacity: 0, scale: 0.92, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -4 }}
              transition={{ duration: 0.22, ease: EASE }}
              style={{ transformOrigin: "top left" }}
              className="absolute top-full left-0 z-40 mt-2 w-[300px] rounded-[24px] border border-border bg-popover p-2 text-popover-foreground shadow-[0_28px_70px_-20px_rgba(0,0,0,0.45)]"
            >
              <p className="px-3.5 pt-2 pb-1.5 text-[13px] font-semibold text-muted-foreground">Who can reply?</p>
              <ReplyList value={value} onPick={pick} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      ) : (
        <BottomSheet open={open} onClose={() => setOpen(false)} label="Who can reply">
          <div className="px-5 pt-2 pb-3">
            <h2 className="text-[18px] font-semibold tracking-tight">Who can reply?</h2>
            <p className="mt-1 text-[14px] text-muted-foreground">Choose who can reply to this post.</p>
          </div>
          <div className="px-2">
            <ReplyList value={value} onPick={pick} />
          </div>
        </BottomSheet>
      )}
    </div>
  )
}
