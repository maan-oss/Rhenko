"use client"

import { useEffect, useRef, useState } from "react"
import { Smile } from "lucide-react"
import { cn } from "@/lib/utils"

const EMOJI = [
  "😀", "😂", "🥹", "😍", "🥰", "😎", "🤔", "😅", "😭", "😡", "🙏", "👏",
  "👍", "👎", "🙌", "💪", "🔥", "✨", "🎉", "💯", "❤️", "💜", "🫶", "👀",
  "🚀", "☕", "🌙", "☀️", "🌧️", "🍕", "🎧", "📚", "💡", "✅", "❌", "⚡",
]

export function EmojiPicker({ onPick, className }: { onPick: (emoji: string) => void; className?: string }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(event: MouseEvent) {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Add emoji"
        aria-expanded={open}
        className="tap-44 grid size-10 place-items-center rounded-full text-foreground transition-colors duration-200 hover:bg-foreground/5 sm:size-9"
      >
        <Smile className="size-5" />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Emoji"
          className="absolute bottom-11 left-0 z-40 grid w-[280px] max-w-[calc(100vw-2rem)] grid-cols-6 gap-1 rounded-2xl border border-border bg-popover p-2 shadow-lg"
        >
          {EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onPick(emoji)
                setOpen(false)
              }}
              className="tap-44 grid size-10 place-items-center rounded-lg text-xl transition-colors hover:bg-muted sm:size-9"
              aria-label={`Insert ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
