"use client"

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

// The sign-in art is liquid metal. A polished medallion of metal sits at the centre, with the Rhenko mark
// cut out of it, so the mark stays crisp and shows the panel's own colour. Droplets orbit the medallion,
// drift into it and merge. The medallion is alive: its edge swells toward the pointer, a click sends a
// ripple through it and throws droplets off that fall back in, and the light in the metal follows the
// pointer. The metal colours come from the theme tokens, so it reads in light and dark. Under reduced
// motion it holds still.

const VIEW_W = 600
const VIEW_H = 800
const CENTER = { x: 300, y: 400 }
const LOGO = { x: 205, y: 305, size: 190 }
const REST = { x: CENTER.x + 120, y: CENTER.y + 140 }
const MARK =
  "M735 310H823A150 150 0 0 0 973 460V548A150 150 0 0 0 823 698H735A150 150 0 0 0 585 548V460A150 150 0 0 0 735 310Z M779 450Q789 494 833 504Q789 514 779 558Q769 514 725 504Q769 494 779 450Z"

// The medallion. It must cover the mark's farthest corner even when its edge is pushed in by its wobble.
const COIN_R = 150
const COIN_POINTS = 56

// Each droplet orbits the medallion on its own slow path and breathes a little.
// `pull` is how strongly the pointer drags it.
const DROPS = [
  { orbit: 0.4, speed: 0.11, rx: 200, ry: 210, r: 40, breath: 0.6, phase: 0.2, pull: 1 },
  { orbit: 2.1, speed: -0.09, rx: 180, ry: 240, r: 30, breath: 0.9, phase: 1.4, pull: 0.8 },
  { orbit: 3.6, speed: 0.075, rx: 230, ry: 195, r: 46, breath: 0.4, phase: 2.2, pull: 0.6 },
  { orbit: 4.9, speed: -0.105, rx: 175, ry: 205, r: 24, breath: 1.1, phase: 0.8, pull: 1 },
  { orbit: 1.2, speed: 0.05, rx: 250, ry: 275, r: 22, breath: 0.7, phase: 3.1, pull: 0.5 },
  { orbit: 5.6, speed: 0.13, rx: 195, ry: 170, r: 20, breath: 1.3, phase: 4.0, pull: 0.9 },
]
type DropSpec = (typeof DROPS)[number]

const SPLASH_MAX = 10
const SPRING = 1.6 // pull back to the orbit
const DAMP = 3 // slows every droplet so the motion reads as thick liquid
const POINTER_PULL = 320

// Where a droplet's orbit puts it at time t.
function homeOf(drop: DropSpec, t: number) {
  const a = drop.orbit + drop.speed * t
  return { x: CENTER.x + drop.rx * Math.cos(a), y: CENTER.y + drop.ry * Math.sin(a) }
}

const START = DROPS.map((drop) => homeOf(drop, 0))

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

// Smallest signed difference between two angles.
function angleGap(a: number, b: number) {
  let d = a - b
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

// A droplet stretches along the way it is moving, and keeps its area as it does.
function shape(el: SVGEllipseElement, x: number, y: number, r: number, vx: number, vy: number) {
  const stretch = 1 + Math.min(0.5, Math.hypot(vx, vy) / 500)
  const angle = (Math.atan2(vy, vx) * 180) / Math.PI
  el.setAttribute("cx", x.toFixed(1))
  el.setAttribute("cy", y.toFixed(1))
  el.setAttribute("rx", (r * stretch).toFixed(1))
  el.setAttribute("ry", (r / Math.sqrt(stretch)).toFixed(1))
  el.setAttribute("transform", `rotate(${angle.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})`)
}

export function AuthArt({ className }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const coinRef = useRef<SVGPathElement>(null)
  const dropRefs = useRef<(SVGEllipseElement | null)[]>([])
  const splashRefs = useRef<(SVGEllipseElement | null)[]>([])
  const headRef = useRef<SVGCircleElement>(null)
  const trailRef = useRef<SVGCircleElement>(null)
  const lightRef = useRef<SVGFEPointLightElement>(null)

  useEffect(() => {
    const wrapEl = wrapRef.current
    const coinEl = coinRef.current
    const headEl = headRef.current
    const trailEl = trailRef.current
    const lightEl = lightRef.current
    if (!wrapEl || !coinEl || !headEl || !trailEl || !lightEl) return
    // Typed, non-null copies, so the helpers below don't have to re-check them.
    const wrap: HTMLDivElement = wrapEl
    const coin: SVGPathElement = coinEl
    const head: SVGCircleElement = headEl
    const trail: SVGCircleElement = trailEl
    const light: SVGFEPointLightElement = lightEl
    const dropEls = dropRefs.current.filter((el): el is SVGEllipseElement => Boolean(el))
    const splashEls = splashRefs.current.filter((el): el is SVGEllipseElement => Boolean(el))
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    const drops = START.map((start) => ({ x: start.x, y: start.y, vx: 0, vy: 0 }))
    const ax = new Float64Array(drops.length)
    const ay = new Float64Array(drops.length)
    const splashes = Array.from({ length: SPLASH_MAX }, () => ({ x: 0, y: 0, vx: 0, vy: 0, r: 0, life: 0, total: 1 }))
    const pointer = { inside: false, x: REST.x, y: REST.y }
    const headPos = { x: REST.x, y: REST.y }
    const trailPos = { x: REST.x, y: REST.y }
    const lightPos = { x: -80, y: -120 }
    // How far the pointer's pull has risen, so the medallion swells in and out instead of snapping.
    let pull = 0
    // Seconds since the last click. Beyond a few seconds the ripple has died away.
    let ripple = Infinity
    let t = 0
    let last = 0
    let frame = 0

    // Map a client point into the art's view box. The art is cropped to fill, so the offsets matter.
    function toView(clientX: number, clientY: number) {
      const rect = wrap.getBoundingClientRect()
      const scale = Math.max(rect.width / VIEW_W, rect.height / VIEW_H)
      const ox = (rect.width - VIEW_W * scale) / 2
      const oy = (rect.height - VIEW_H * scale) / 2
      return {
        x: clamp((clientX - rect.left - ox) / scale, 0, VIEW_W),
        y: clamp((clientY - rect.top - oy) / scale, 0, VIEW_H),
      }
    }

    // A click sends a ripple through the medallion, throws the droplets outward and flicks off a few beads.
    function burst(px: number, py: number) {
      ripple = 0
      for (const drop of drops) {
        const dx = drop.x - px
        const dy = drop.y - py
        const dist = Math.hypot(dx, dy) + 1
        const power = 380 / (1 + dist / 140)
        drop.vx += (dx / dist) * power
        drop.vy += (dy / dist) * power
      }
      let spawned = 0
      for (const splash of splashes) {
        if (splash.life > 0) continue
        const angle = Math.random() * Math.PI * 2
        const speed = 160 + Math.random() * 170
        const life = 1.1 + Math.random() * 0.6
        splash.x = px
        splash.y = py
        splash.vx = Math.cos(angle) * speed
        splash.vy = Math.sin(angle) * speed
        splash.r = 13 + Math.random() * 11
        splash.total = life
        splash.life = life
        spawned += 1
        if (spawned >= 6) break
      }
    }

    function step(dt: number) {
      t += dt
      ripple += dt

      // The head follows the pointer with a little lag, and the trail follows the head more slowly.
      // With no pointer over the art, the head drifts on its own.
      const goal = pointer.inside
        ? pointer
        : { x: CENTER.x + 200 * Math.cos(t * 0.21 + 1.2), y: CENTER.y + 240 * Math.sin(t * 0.16) }
      const headK = 1 - Math.exp(-dt * 4)
      const trailK = 1 - Math.exp(-dt * 1.8)
      headPos.x += (goal.x - headPos.x) * headK
      headPos.y += (goal.y - headPos.y) * headK
      trailPos.x += (headPos.x - trailPos.x) * trailK
      trailPos.y += (headPos.y - trailPos.y) * trailK
      pull += ((pointer.inside ? 1 : 0) - pull) * (1 - Math.exp(-dt * 3))

      // Each droplet has a spring to its orbit, is dragged toward the head while the pointer is over the art,
      // and is pushed off its neighbours when they overlap, so they stay separate beads until they meet.
      ax.fill(0)
      ay.fill(0)
      for (let i = 0; i < drops.length; i++) {
        const drop = drops[i]
        const home = homeOf(DROPS[i], t)
        ax[i] += SPRING * (home.x - drop.x)
        ay[i] += SPRING * (home.y - drop.y)
        if (pointer.inside) {
          const dx = headPos.x - drop.x
          const dy = headPos.y - drop.y
          const dist = Math.hypot(dx, dy) + 1
          const strength = (POINTER_PULL * DROPS[i].pull) / (1 + dist / 150)
          ax[i] += (dx / dist) * strength
          ay[i] += (dy / dist) * strength
        }
      }
      for (let i = 0; i < drops.length; i++) {
        for (let j = i + 1; j < drops.length; j++) {
          const a = drops[i]
          const b = drops[j]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const dist = Math.hypot(dx, dy) + 0.01
          const min = (DROPS[i].r + DROPS[j].r) * 0.7
          if (dist >= min) continue
          const push = (min - dist) * 18
          const nx = dx / dist
          const ny = dy / dist
          ax[i] -= nx * push
          ay[i] -= ny * push
          ax[j] += nx * push
          ay[j] += ny * push
        }
      }
      for (let i = 0; i < drops.length; i++) {
        const drop = drops[i]
        drop.vx += (ax[i] - DAMP * drop.vx) * dt
        drop.vy += (ay[i] - DAMP * drop.vy) * dt
        drop.x = clamp(drop.x + drop.vx * dt, 30, VIEW_W - 30)
        drop.y = clamp(drop.y + drop.vy * dt, 40, VIEW_H - 40)
      }

      // Thrown droplets are pulled back toward the medallion, so they rejoin it.
      for (const splash of splashes) {
        if (splash.life <= 0) continue
        splash.life -= dt
        splash.vx += ((CENTER.x - splash.x) * 0.5 - splash.vx * 2.2) * dt
        splash.vy += ((CENTER.y - splash.y) * 0.5 - splash.vy * 2.2) * dt
        splash.x += splash.vx * dt
        splash.y += splash.vy * dt
      }

      // The light follows the pointer, and drifts across the top of the panel when the pointer is away.
      const lightGoal = pointer.inside
        ? { x: pointer.x - 40, y: pointer.y - 70 }
        : { x: CENTER.x + 240 * Math.cos(t * 0.19), y: 150 + 90 * Math.sin(t * 0.23) }
      const lightK = 1 - Math.exp(-dt * 2.5)
      lightPos.x += (lightGoal.x - lightPos.x) * lightK
      lightPos.y += (lightGoal.y - lightPos.y) * lightK
    }

    // The medallion's edge: a slow wobble, a swell toward the pointer, and a ripple after a click.
    function coinPath() {
      const toward = Math.atan2(headPos.y - CENTER.y, headPos.x - CENTER.x)
      const reach = pull * (1 / (1 + Math.hypot(headPos.x - CENTER.x, headPos.y - CENTER.y) / 260))
      const rippling = ripple < 3
      let d = ""
      for (let i = 0; i < COIN_POINTS; i++) {
        const theta = (i / COIN_POINTS) * Math.PI * 2
        let r = COIN_R + 5 * Math.sin(3 * theta + t * 0.9) + 3.5 * Math.sin(5 * theta - t * 1.1)
        const facing = Math.max(0, Math.cos(angleGap(theta, toward)))
        r += 34 * reach * facing ** 6
        if (rippling) r += 10 * Math.exp(-ripple * 2.2) * Math.sin(4 * theta - ripple * 12)
        const x = CENTER.x + r * Math.cos(theta)
        const y = CENTER.y + r * Math.sin(theta)
        d += `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`
      }
      return `${d}Z`
    }

    function shapeOf(splash: { r: number; life: number; total: number }) {
      return splash.r * Math.min(1, (splash.life / splash.total) * 1.6)
    }

    function render() {
      coin.setAttribute("d", coinPath())

      head.setAttribute("cx", headPos.x.toFixed(1))
      head.setAttribute("cy", headPos.y.toFixed(1))
      trail.setAttribute("cx", trailPos.x.toFixed(1))
      trail.setAttribute("cy", trailPos.y.toFixed(1))

      drops.forEach((drop, index) => {
        const el = dropEls[index]
        if (!el) return
        const spec = DROPS[index]
        const r = spec.r * (1 + 0.07 * Math.sin(t * spec.breath + spec.phase))
        shape(el, drop.x, drop.y, r, drop.vx, drop.vy)
      })

      splashes.forEach((splash, index) => {
        const el = splashEls[index]
        if (!el) return
        if (splash.life <= 0) {
          el.setAttribute("rx", "0")
          el.setAttribute("ry", "0")
          return
        }
        shape(el, splash.x, splash.y, shapeOf(splash), splash.vx, splash.vy)
      })

      light.setAttribute("x", lightPos.x.toFixed(1))
      light.setAttribute("y", lightPos.y.toFixed(1))
    }

    function frameTick(dt: number) {
      step(dt)
      render()
    }

    function loop(now: number) {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0
      last = now
      frameTick(dt)
      frame = requestAnimationFrame(loop)
    }

    function onMove(event: PointerEvent) {
      const point = toView(event.clientX, event.clientY)
      pointer.x = point.x
      pointer.y = point.y
      pointer.inside = true
    }
    function onDown(event: PointerEvent) {
      const point = toView(event.clientX, event.clientY)
      pointer.x = point.x
      pointer.y = point.y
      pointer.inside = true
      burst(point.x, point.y)
    }
    function onLeave() {
      pointer.inside = false
    }

    if (still) {
      frameTick(0)
    } else {
      frame = requestAnimationFrame(loop)
      wrap.addEventListener("pointermove", onMove)
      wrap.addEventListener("pointerdown", onDown)
      wrap.addEventListener("pointerleave", onLeave)
    }

    return () => {
      cancelAnimationFrame(frame)
      wrap.removeEventListener("pointermove", onMove)
      wrap.removeEventListener("pointerdown", onDown)
      wrap.removeEventListener("pointerleave", onLeave)
    }
  }, [])

  return (
    <div ref={wrapRef} aria-hidden="true" className={cn("absolute inset-0 overflow-hidden", className)}>
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full">
        <defs>
          {/* The metal runs from the theme's top highlight to its base, so it reads as polished in both themes. */}
          <linearGradient id="auth-art-metal" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={VIEW_W} y2={VIEW_H}>
            <stop offset="0" style={{ stopColor: "var(--metal-top)" }} />
            <stop offset="0.55" style={{ stopColor: "var(--metal-mid)" }} />
            <stop offset="1" style={{ stopColor: "var(--metal-bottom)" }} />
          </linearGradient>

          {/* Blur, then sharpen the edge into a bead of liquid, then light the bead so it glints. */}
          <filter id="auth-art-liquid" x="-40%" y="-40%" width="180%" height="180%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="15" result="blur" />
            <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -11" result="body" />
            <feSpecularLighting in="body" surfaceScale="6" specularConstant="1.1" specularExponent="28" lightingColor="#ffffff" result="glint">
              <fePointLight ref={lightRef} x={-80} y={-120} z="200" />
            </feSpecularLighting>
            <feComposite in="glint" in2="body" operator="in" result="glintIn" />
            <feMerge>
              <feMergeNode in="body" />
              <feMergeNode in="glintIn" />
            </feMerge>
          </filter>

          {/* The mark is cut out of the medallion, so it stays crisp and shows the panel behind it. */}
          <mask id="auth-art-cut" maskUnits="userSpaceOnUse" x="0" y="0" width={VIEW_W} height={VIEW_H}>
            <rect width={VIEW_W} height={VIEW_H} fill="#fff" />
            <path
              fill="#000"
              fillRule="evenodd"
              d={MARK}
              transform={`translate(${LOGO.x} ${LOGO.y}) scale(${LOGO.size / 388}) translate(-585 -310)`}
            />
          </mask>
        </defs>

        <g mask="url(#auth-art-cut)">
          <g filter="url(#auth-art-liquid)" fill="url(#auth-art-metal)">
            <path ref={coinRef} d={`M${CENTER.x - COIN_R} ${CENTER.y}A${COIN_R} ${COIN_R} 0 1 0 ${CENTER.x + COIN_R} ${CENTER.y}A${COIN_R} ${COIN_R} 0 1 0 ${CENTER.x - COIN_R} ${CENTER.y}Z`} />
            {DROPS.map((drop, index) => (
              <ellipse
                key={index}
                ref={(el) => {
                  dropRefs.current[index] = el
                }}
                cx={START[index].x.toFixed(1)}
                cy={START[index].y.toFixed(1)}
                rx={drop.r}
                ry={drop.r}
              />
            ))}
            {Array.from({ length: SPLASH_MAX }, (_, index) => (
              <ellipse
                key={`splash-${index}`}
                ref={(el) => {
                  splashRefs.current[index] = el
                }}
                cx={REST.x}
                cy={REST.y}
                rx={0}
                ry={0}
              />
            ))}
            <circle ref={trailRef} cx={REST.x} cy={REST.y} r={20} />
            <circle ref={headRef} cx={REST.x} cy={REST.y} r={36} />
          </g>
        </g>
      </svg>
    </div>
  )
}
