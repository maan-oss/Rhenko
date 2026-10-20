"use client"

import { useEffect, useRef, useState } from "react"
import { animate, useReducedMotion } from "motion/react"
import { exact } from "@/components/app/analytics-bits"

// A figure that counts from its old value to a new one when it changes. The first render shows the exact number, so the
// page reads correctly before anything moves; people who ask for less motion get the new number at once.
export function CountUp({ value, className }: { value: number; className?: string }) {
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(value)
  const from = useRef(value)

  useEffect(() => {
    if (reduce || from.current === value) {
      from.current = value
      setShown(value)
      return
    }
    const controls = animate(from.current, value, {
      duration: 0.45,
      ease: [0.2, 0.7, 0.2, 1],
      onUpdate: (current) => setShown(Math.round(current)),
    })
    from.current = value
    return () => controls.stop()
  }, [value, reduce])

  return <span className={className}>{exact(shown)}</span>
}
