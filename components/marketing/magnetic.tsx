"use client"

import { useRef, type ReactNode } from "react"

// Pulls a control a few pixels toward the pointer while it hovers, on mouse-style pointers only. Touch and reduced motion
// get the plain control.
export function Magnetic({ children, strength = 0.22 }: { children: ReactNode; strength?: number }) {
  const ref = useRef<HTMLSpanElement>(null)

  function onMove(event: React.PointerEvent<HTMLSpanElement>) {
    if (event.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const box = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - (box.left + box.width / 2)
    const y = event.clientY - (box.top + box.height / 2)
    const node = ref.current
    if (node) node.style.transform = `translate3d(${x * strength}px, ${y * strength}px, 0)`
  }

  function onLeave() {
    if (ref.current) ref.current.style.transform = "translate3d(0, 0, 0)"
  }

  return (
    <span ref={ref} onPointerMove={onMove} onPointerLeave={onLeave} className="inline-flex transition-transform duration-300 ease-out">
      {children}
    </span>
  )
}
