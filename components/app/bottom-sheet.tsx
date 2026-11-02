"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { SHEET_SETTLE, SPRING_SHEET } from "@/components/app/motion"

const noopSubscribe = () => () => {}
function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false)
}

// The sheet rests at its content's height, up to a little over half the screen. Pulled up, it grows to nearly the whole
// screen. Pushed down it first shrinks back, and a second push closes it.
const REST_HEIGHT = "62dvh"
const FULL_HEIGHT = "92dvh"

// How far (px) or how fast (px per ms) a drag must go to count as a pull up or a push down.
const PULL_UP_DISTANCE = -60
const PULL_UP_SPEED = -0.5
const PUSH_DOWN_DISTANCE = 110
const PUSH_DOWN_SPEED = 0.6

// A sheet that rises from the bottom of the phone, with a dimmed scrim behind it and Escape to close. Its grab handle takes the
// drag, so the page underneath can still scroll.
export function BottomSheet({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean
  onClose: () => void
  label: string
  children: React.ReactNode
}) {
  const mounted = useMounted()
  const reduce = useReducedMotion()
  const [full, setFull] = useState(false)
  const [shownOpen, setShownOpen] = useState(open)
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef({ y: 0, time: 0 })

  // Each time the sheet opens or closes it starts resting, not full, and not dragged.
  if (shownOpen !== open) {
    setShownOpen(open)
    setFull(false)
    setOffset(0)
  }

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

  function handleDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    start.current = { y: event.clientY, time: event.timeStamp }
    setDragging(true)
  }

  function handleMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return
    const dy = event.clientY - start.current.y
    // Pulling up gives a little, so the sheet looks taut; pushing down follows the finger.
    setOffset(dy < 0 ? dy * 0.2 : dy)
  }

  function handleUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return
    const dy = event.clientY - start.current.y
    const speed = dy / Math.max(1, event.timeStamp - start.current.time)
    setDragging(false)
    if (!full && (dy < PULL_UP_DISTANCE || speed < PULL_UP_SPEED)) {
      setFull(true)
      setOffset(0)
    } else if (dy > PUSH_DOWN_DISTANCE || speed > PUSH_DOWN_SPEED) {
      if (full) {
        setFull(false)
        setOffset(0)
      } else {
        // Closing keeps the offset, so the exit starts from where the finger let go.
        onClose()
      }
    } else {
      setOffset(0)
    }
  }

  if (!mounted) return null
  return createPortal(
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            key="scrim"
            aria-hidden="true"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-[80] bg-foreground/30 backdrop-blur-[3px]"
          />
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={label}
            initial={{ y: "100%", maxHeight: REST_HEIGHT }}
            animate={{ y: offset, height: full ? FULL_HEIGHT : "auto", maxHeight: full ? FULL_HEIGHT : REST_HEIGHT }}
            exit={{ y: "100%", transition: SHEET_SETTLE }}
            transition={dragging || reduce ? { duration: 0 } : SPRING_SHEET}
            className="fixed inset-x-0 bottom-0 z-[90] mx-auto flex w-full max-w-[560px] flex-col overflow-hidden rounded-t-[32px] border-x border-t border-border bg-popover text-popover-foreground shadow-[0_-30px_70px_-20px_rgba(0,0,0,0.5)]"
          >
            <div
              className="flex shrink-0 cursor-grab touch-none justify-center pt-2.5 pb-1 active:cursor-grabbing"
              onPointerDown={handleDown}
              onPointerMove={handleMove}
              onPointerUp={handleUp}
              onPointerCancel={handleUp}
            >
              <span aria-hidden="true" className="h-1.5 w-11 rounded-full bg-foreground/20" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(20px,env(safe-area-inset-bottom))]">{children}</div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>,
    document.body
  )
}
