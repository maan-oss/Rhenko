"use client"

import { useRef, useState, type PointerEvent } from "react"
import { useReducedMotion } from "motion/react"

// The art beside the sign-in and sign-up forms: a ripple on still water. A post sends rings out from one point, and the
// rings flatten into a horizon. The rings are drawn in the page's own ink, so they read as black on paper and white in
// the dark theme. They spread out once on first paint. A tap on the panel drops a new ring where it lands, unless the
// person has asked for less motion.

const W = 1000
const H = 1250
const CX = 500
const CY = 600
const SQUASH = 0.3
const RING_COUNT = 58
const STROKE = 1.1

// The rings are computed with fixed numbers only, so the server and the browser draw the same shapes.
function ringPath(index: number): string {
  const base = 5 + Math.pow(index, 1.14) * 8.6
  const radius = base * (1 + 0.07 * Math.sin(index * 1.37 + 0.6) * Math.cos(index * 0.53))
  const points: string[] = []
  const steps = 300
  for (let k = 0; k <= steps; k++) {
    const t = (k / steps) * Math.PI * 2
    const wobble =
      1 +
      0.03 * Math.sin(2 * t + index * 0.21) +
      0.018 * Math.sin(3 * t - index * 0.29) +
      0.008 * Math.sin(5 * t + index * 0.16) +
      0.012 * Math.sin(2 * t + index * 0.7)
    const r = radius * wobble
    const x = CX + Math.cos(t) * r
    const y = CY + Math.sin(t) * r * SQUASH
    points.push(`${k === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
  }
  return `${points.join("")}Z`
}

const RINGS = Array.from({ length: RING_COUNT }, (_, index) => {
  const fade = Math.pow(index / (RING_COUNT - 1), 0.85)
  return {
    d: ringPath(index),
    opacity: (0.92 - 0.82 * fade).toFixed(3),
    delay: Math.round(index * 36),
  }
})

// Radii of a tapped ring, in the drawing's own units. Each tap sends three rings out, one behind the other. Their timing
// comes from CSS, which starts when the ring is drawn, so a tap always plays from the start.
const DROP_RADII = [170, 320, 480]
const DROP_DELAY_MS = [0, 220, 440]
const DROP_LIFE_MS = 3200

type Drop = { id: number; x: number; y: number }

export function AuthRipple() {
  const reduce = useReducedMotion()
  const svgRef = useRef<SVGSVGElement>(null)
  const nextId = useRef(0)
  const [drops, setDrops] = useState<Drop[]>([])

  function drop(event: PointerEvent<HTMLElement>) {
    const svg = svgRef.current
    if (reduce || !svg) return
    const ctm = svg.getScreenCTM()
    if (!ctm) return
    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const at = point.matrixTransform(ctm.inverse())
    const id = nextId.current++
    setDrops((current) => [...current.slice(-5), { id, x: at.x, y: at.y }])
    window.setTimeout(() => setDrops((current) => current.filter((item) => item.id !== id)), DROP_LIFE_MS)
  }

  return (
    <section
      aria-hidden="true"
      onPointerDown={drop}
      className="relative hidden cursor-default overflow-hidden bg-sidebar lg:flex lg:w-[44%] lg:shrink-0"
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        className="block size-full select-none"
      >
        <g fill="none" stroke="currentColor" strokeWidth={STROKE}>
          {RINGS.map((ring, index) => (
            <path
              key={index}
              d={ring.d}
              pathLength={1}
              strokeOpacity={ring.opacity}
              className="auth-ring"
              style={{ animationDelay: `${ring.delay}ms` }}
            />
          ))}
        </g>
        <circle cx={CX} cy={CY} r={4.5} fill="currentColor" />
        {drops.map((item) => (
          <g key={item.id} transform={`translate(${item.x.toFixed(1)} ${item.y.toFixed(1)})`} fill="none" stroke="currentColor" strokeWidth={STROKE + 0.1}>
            {DROP_RADII.map((radius, index) => (
              <ellipse
                key={index}
                cx={0}
                cy={0}
                rx={radius}
                ry={radius * SQUASH}
                className="auth-drop"
                style={{ animationDelay: `${DROP_DELAY_MS[index]}ms` }}
              />
            ))}
          </g>
        ))}
      </svg>
    </section>
  )
}
