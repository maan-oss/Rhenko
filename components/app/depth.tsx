"use client"

import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from "react"
import { cn } from "@/lib/utils"

// A surface that tilts toward the pointer and catches a light where the pointer is. Mouse only: a finger or a pen does not
// tilt the plane, and reduced motion keeps it flat (both are enforced in globals.css as well, so nothing depends on this
// script running). The tilt is at most `max` degrees, so the content stays easy to read while it moves.
export function DepthTilt({
  children,
  max = 5,
  className,
  style,
  glare = true,
}: {
  children: ReactNode
  max?: number
  className?: string
  style?: CSSProperties
  glare?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  function move(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") return
    const element = ref.current
    if (!element) return
    const box = element.getBoundingClientRect()
    const x = (event.clientX - box.left) / box.width
    const y = (event.clientY - box.top) / box.height
    element.style.setProperty("--ry", `${(x - 0.5) * 2 * max}deg`)
    element.style.setProperty("--rx", `${(0.5 - y) * 2 * max}deg`)
    element.style.setProperty("--hx", `${x * 100}%`)
    element.style.setProperty("--hy", `${y * 100}%`)
  }

  function rest() {
    const element = ref.current
    if (!element) return
    element.style.setProperty("--rx", "0deg")
    element.style.setProperty("--ry", "0deg")
  }

  return (
    <div ref={ref} onPointerMove={move} onPointerLeave={rest} className={cn("depth-plane", className)} style={style}>
      {children}
      {glare ? <span aria-hidden className="depth-glare" /> : null}
    </div>
  )
}
