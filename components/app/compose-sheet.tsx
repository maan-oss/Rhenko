"use client"

import { useEffect, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { X } from "lucide-react"
import { Composer, type CircleOption } from "@/components/app/composer"
import type { AvatarUser } from "@/components/app/avatar"

const SPRING = { type: "spring", stiffness: 380, damping: 36 } as const
const EASE = [0.22, 1, 0.36, 1] as const
const INSTANT = { duration: 0 } as const

type ComposeSheetProps = {
  open: boolean
  onClose: () => void
  viewer: AvatarUser
  circles: CircleOption[]
}

// Writing a post opens here, as a pop-up over the page you are on, rather than as a page of its own. It grows from the corner
// of the + square, where it came from, and folds back into that corner. It is built the first time it opens and then kept, so
// a post started and then closed is still there the next time.
export function ComposeSheet({ open, onClose, viewer, circles }: ComposeSheetProps) {
  const reduce = useReducedMotion()
  const [built, setBuilt] = useState(open)
  // Built during the render that opens it, so the first open has the composer ready to animate in.
  if (open && !built) setBuilt(true)

  const panelRef = useRef<HTMLElement>(null)
  // The latest close handler, read by the listeners below, so they are not re-attached on every render.
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  // While open: the page behind does not scroll, Escape closes, and the text field takes the cursor once the pop-up has begun to
  // open, so the keyboard comes up with it.
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeRef.current()
    }
    window.addEventListener("keydown", onKey)
    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLTextAreaElement>("[data-composer-field]")?.focus({ preventScroll: true })
    })
    return () => {
      window.cancelAnimationFrame(frame)
      document.body.style.overflow = previous
      window.removeEventListener("keydown", onKey)
    }
  }, [open])

  if (!built) return null

  const panel = {
    open: { opacity: 1, scale: 1, visibility: "visible", transition: reduce ? INSTANT : { ...SPRING, opacity: { duration: 0.18 } } },
    closed: {
      opacity: 0,
      scale: 0.9,
      transition: reduce ? INSTANT : { duration: 0.2, ease: EASE },
      transitionEnd: { visibility: "hidden" },
    },
  } as const

  return (
    <>
      <motion.div
        aria-hidden="true"
        onClick={onClose}
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={reduce ? INSTANT : { duration: 0.22, ease: EASE }}
        style={{ pointerEvents: open ? "auto" : "none" }}
        className="fixed inset-0 z-50 bg-foreground/25 backdrop-blur-[2px] lg:hidden"
      />
      <motion.section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="New post"
        inert={!open}
        initial={false}
        variants={panel}
        animate={open ? "open" : "closed"}
        style={{ transformOrigin: "bottom right" }}
        className="fixed inset-x-2 top-2 bottom-2 z-50 flex flex-col overflow-hidden rounded-[32px] border border-border bg-background shadow-[0_30px_80px_-24px_rgba(0,0,0,0.55)] lg:hidden"
      >
        <header className="relative flex h-14 shrink-0 items-center justify-center">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            title="Close"
            className="tap-44 absolute top-1/2 left-2 grid size-10 -translate-y-1/2 place-items-center rounded-full text-foreground transition-colors duration-200 outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-[22px]" strokeWidth={1.9} aria-hidden="true" />
          </button>
          <h2 className="text-[17px] font-semibold tracking-tight">New post</h2>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pt-3 pb-[max(20px,env(safe-area-inset-bottom,0px))]">
          <Composer viewer={viewer} circles={circles} placeholder="Write something" compact fill onPosted={onClose} />
        </div>
      </motion.section>
    </>
  )
}
