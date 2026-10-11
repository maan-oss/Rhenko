"use client"

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

// The sign-in art. The Rhenko mark sits still at the centre. Around it, a faint mass of ink
// made of soft blobs drifts slowly and fuses where the blobs meet. The pointer pulls a
// blob after it with a little lag, like a thick liquid. Under reduced motion it stays still.

const VIEW_W = 600
const VIEW_H = 800
const CENTER = { x: 300, y: 400 }
const REST = { x: 420, y: 580 }
const LOGO = { x: 205, y: 305, size: 190 }

type Blob = { angle: number; speed: number; rx: number; ry: number; r: number; breath: number; phase: number }

const BLOBS: Blob[] = [
  { angle: 0.4, speed: 0.11, rx: 230, ry: 250, r: 62, breath: 0.6, phase: 0.2 },
  { angle: 2.1, speed: -0.08, rx: 200, ry: 300, r: 46, breath: 0.9, phase: 1.4 },
  { angle: 3.6, speed: 0.07, rx: 250, ry: 210, r: 74, breath: 0.4, phase: 2.2 },
  { angle: 4.9, speed: -0.1, rx: 205, ry: 240, r: 34, breath: 1.1, phase: 0.8 },
  { angle: 1.2, speed: 0.05, rx: 265, ry: 330, r: 30, breath: 0.7, phase: 3.1 },
  { angle: 5.6, speed: 0.13, rx: 215, ry: 180, r: 28, breath: 1.3, phase: 4.0 },
]

// Where a blob sits at time t, in view coordinates.
function placeBlob(blob: Blob, t: number) {
  const a = blob.angle + blob.speed * t
  return {
    cx: CENTER.x + blob.rx * Math.cos(a),
    cy: CENTER.y + blob.ry * Math.sin(a),
    r: blob.r * (1 + 0.08 * Math.sin(t * blob.breath + blob.phase)),
  }
}

export function AuthArt({ className }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const blobRefs = useRef<(SVGCircleElement | null)[]>([])
  const headRef = useRef<SVGCircleElement>(null)
  const trailRef = useRef<SVGCircleElement>(null)

  useEffect(() => {
    const wrapEl = wrapRef.current
    const headEl = headRef.current
    const trailEl = trailRef.current
    if (!wrapEl || !headEl || !trailEl) return
    // Typed, non-null copies, so the helpers below don't have to re-check them.
    const wrap: HTMLDivElement = wrapEl
    const head: SVGCircleElement = headEl
    const trail: SVGCircleElement = trailEl
    const blobs = blobRefs.current.filter((el): el is SVGCircleElement => Boolean(el))
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    const pointer = { inside: false, x: REST.x, y: REST.y }
    const headPos = { x: REST.x, y: REST.y }
    const trailPos = { x: REST.x, y: REST.y }
    let t = 0
    let last = 0
    let frame = 0

    // Map a client point into the art's view box. The art is cropped to fill, so the offsets matter.
    function toView(clientX: number, clientY: number) {
      const rect = wrap.getBoundingClientRect()
      const scale = Math.max(rect.width / VIEW_W, rect.height / VIEW_H)
      const ox = (rect.width - VIEW_W * scale) / 2
      const oy = (rect.height - VIEW_H * scale) / 2
      return { x: (clientX - rect.left - ox) / scale, y: (clientY - rect.top - oy) / scale }
    }

    function paint(dt: number) {
      t += dt
      const goal = pointer.inside ? pointer : { x: REST.x + 60 * Math.sin(t * 0.31), y: REST.y + 40 * Math.cos(t * 0.23) }
      // Exponential easing keeps the motion the same at any frame rate. The trail follows the head more slowly.
      const headK = 1 - Math.exp(-dt * 3.2)
      const trailK = 1 - Math.exp(-dt * 1.3)
      headPos.x += (goal.x - headPos.x) * headK
      headPos.y += (goal.y - headPos.y) * headK
      trailPos.x += (headPos.x - trailPos.x) * trailK
      trailPos.y += (headPos.y - trailPos.y) * trailK

      head.setAttribute("cx", headPos.x.toFixed(1))
      head.setAttribute("cy", headPos.y.toFixed(1))
      trail.setAttribute("cx", trailPos.x.toFixed(1))
      trail.setAttribute("cy", trailPos.y.toFixed(1))

      blobs.forEach((el, index) => {
        const { cx, cy, r } = placeBlob(BLOBS[index], t)
        el.setAttribute("cx", cx.toFixed(1))
        el.setAttribute("cy", cy.toFixed(1))
        el.setAttribute("r", r.toFixed(1))
      })
    }

    function loop(now: number) {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0
      last = now
      paint(dt)
      frame = requestAnimationFrame(loop)
    }

    function onMove(event: PointerEvent) {
      const point = toView(event.clientX, event.clientY)
      pointer.x = point.x
      pointer.y = point.y
      pointer.inside = true
    }
    function onLeave() {
      pointer.inside = false
    }

    if (still) {
      paint(0)
    } else {
      frame = requestAnimationFrame(loop)
      wrap.addEventListener("pointermove", onMove)
      wrap.addEventListener("pointerleave", onLeave)
    }

    return () => {
      cancelAnimationFrame(frame)
      wrap.removeEventListener("pointermove", onMove)
      wrap.removeEventListener("pointerleave", onLeave)
    }
  }, [])

  return (
    <div ref={wrapRef} aria-hidden="true" className={cn("absolute inset-0 overflow-hidden text-foreground", className)}>
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full">
        <defs>
          <filter id="auth-art-goo" x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="22" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 26 -12" />
          </filter>
        </defs>

        {/* The ink mass. It is tinted, so the mark stays the strongest thing in the panel. */}
        <g fill="currentColor" filter="url(#auth-art-goo)" opacity="0.22">
          {BLOBS.map((blob, index) => {
            const start = placeBlob(blob, 0)
            return (
              <circle
                key={index}
                ref={(el) => {
                  blobRefs.current[index] = el
                }}
                cx={start.cx.toFixed(1)}
                cy={start.cy.toFixed(1)}
                r={start.r.toFixed(1)}
              />
            )
          })}
          <circle ref={trailRef} cx={REST.x} cy={REST.y} r={24} />
          <circle ref={headRef} cx={REST.x} cy={REST.y} r={46} />
        </g>

        {/* The mark, crisp and full strength, at the centre of the art. */}
        <svg x={LOGO.x} y={LOGO.y} width={LOGO.size} height={LOGO.size} viewBox="585 310 388 388" className="overflow-visible">
          <path
            fill="currentColor"
            fillRule="evenodd"
            d="M735 310H823A150 150 0 0 0 973 460V548A150 150 0 0 0 823 698H735A150 150 0 0 0 585 548V460A150 150 0 0 0 735 310Z M779 450Q789 494 833 504Q789 514 779 558Q769 514 725 504Q769 494 779 450Z"
          />
        </svg>
      </svg>
    </div>
  )
}
