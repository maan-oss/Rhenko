"use client"

import { useEffect, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useDragControls, useReducedMotion } from "motion/react"

const noopSubscribe = () => () => {}
function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false)
}

// A sheet that rises from the bottom of the phone. It has a grab handle that drags it down to close,
// a dimmed scrim behind it, and Escape. The handle takes the drag, so the page underneath can still scroll.
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
  const controls = useDragControls()

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
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[80] bg-foreground/30 backdrop-blur-[3px]"
          />
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={label}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 42, mass: 0.9 }}
            drag="y"
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 600) onClose()
            }}
            className="fixed inset-x-0 bottom-0 z-[90] mx-auto flex max-h-[88dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-[32px] border-x border-t border-border bg-popover text-popover-foreground shadow-[0_-30px_70px_-20px_rgba(0,0,0,0.5)]"
          >
            <div
              className="flex shrink-0 cursor-grab touch-none justify-center pt-2.5 pb-1 active:cursor-grabbing"
              onPointerDown={(event) => controls.start(event)}
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
