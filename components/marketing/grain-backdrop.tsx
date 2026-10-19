"use client"

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { GrainGradient } from "@paper-design/shaders-react"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"

// The hero's backdrop: a slow grain gradient in greys, with a sparse field of points that drift and move away from
// the pointer. Both are decoration only, so they sit behind the content, do not take input, and stop when they are off
// screen. Under reduced motion the gradient holds one frame and the points stay still.

const PALETTE = {
  light: { colors: ["#2a2a2a", "#8a8a8a", "#e5e5e5", "#0a0a0a"], back: "#fafafa", dots: "10, 10, 10" },
  // Calm light: the same greys, lifted, so a line of text on it keeps its contrast.
  lightCalm: { colors: ["#2a2a2a", "#bcbcbc", "#f1f1f1", "#fafafa"], back: "#fafafa", dots: "10, 10, 10" },
  dark: { colors: ["#2a2a2a", "#4a4a4a", "#1c1c1c", "#f5f5f5"], back: "#0a0a0a", dots: "245, 245, 245" },
} as const

// `calm` lowers the grain for a band of text; `fade` softens the edges the gradient meets the page with.
export function GrainBackdrop({
  children,
  className,
  calm = false,
  fade = "bottom",
}: {
  children: ReactNode
  className?: string
  calm?: boolean
  fade?: "bottom" | "both"
}) {
  const { resolvedTheme } = useTheme()
  const narrow = useNarrowScreen()
  // Phones get the calm grain too. Their hero copy is smaller and sits on the grain, where the lighter grain keeps it readable.
  const quiet = calm || (narrow && resolvedTheme !== "dark")
  // The palette's name is the shader's key. The theme is only known after mount, so the shader is mounted again when the
  // name changes; otherwise it keeps the colours it was first drawn with (light, on a dark theme).
  const paletteName = resolvedTheme === "dark" ? "dark" : quiet ? "lightCalm" : "light"
  const palette = PALETTE[paletteName]
  const reduced = useReducedMotion()
  const layer = useRef<HTMLDivElement>(null)
  const onScreen = useOnScreen(layer)
  const hero = useRef<HTMLDivElement>(null)
  const settled = useSettledAfterPaint(hero)
  const webgl = useWebGL(settled)
  const shader = onScreen && webgl === true

  return (
    <div ref={hero} className={cn("relative isolate overflow-hidden", className)}>
      <div
        ref={layer}
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 -z-10",
          fade === "both"
            ? "[mask-image:linear-gradient(to_bottom,transparent,black_28%,black_72%,transparent)]"
            : "[mask-image:linear-gradient(to_bottom,black_55%,transparent_100%)]"
        )}
      >
        {/* The shader animates continuously, so it runs only while this part of the page is near the screen, and only where
            the browser can draw WebGL. Otherwise a flat grey ground stands in, which costs nothing. */}
        {shader ? (
          <GrainGradient
            key={paletteName}
            width="100%"
            height="100%"
            colors={[...palette.colors]}
            colorBack={palette.back}
            shape="corners"
            softness={0.7}
            intensity={quiet ? 0.2 : 0.35}
            noise={quiet ? 0.08 : 0.22}
            speed={reduced ? 0 : 0.35}
            minPixelRatio={1}
            maxPixelCount={1600 * 1000}
            fit="cover"
            style={{ opacity: resolvedTheme === "dark" ? 0.55 : 0.8 }}
          />
        ) : (
          <div className="absolute inset-0" style={{ background: FLAT_GROUND }} />
        )}
      </div>
      <PointField dots={palette.dots} reduced={reduced} />
      {children}
    </div>
  )
}

// The stand-in for the shader: the paper colour with a soft grey glow in the top left.
// The flat ground reads its colours from the theme's tokens, not from the resolved theme. The server cannot know the theme,
// and React does not correct a style attribute that differs from the server's markup during hydration, so a palette chosen
// in render would stay light on a dark theme.
const FLAT_GROUND = "radial-gradient(90% 70% at 18% 8%, var(--grain-glow), transparent 62%), var(--grain-back)"

// Whether this browser can draw the shader on its graphics hardware. It is null until the browser is asked, so the server's
// HTML and the first paint show the flat ground, and the shader is never mounted where it cannot run well. The question is
// asked only once `enabled` is set, which is after the hero has painted. Creating a WebGL context is itself costly, and it
// should not hold back the words. A browser that draws WebGL on the processor instead (SwiftShader, llvmpipe) cannot run the
// grain at a usable frame rate, so it gets the flat ground too. The answer is kept for the page, so each backdrop on it does
// not create its own context to ask.
let webglAnswer: boolean | null = null
function useWebGL(enabled: boolean): boolean | null {
  const [supported, setSupported] = useState<boolean | null>(null)
  useEffect(() => {
    if (!enabled) return
    if (webglAnswer === null) {
      try {
        const probe = document.createElement("canvas")
        const gl = (probe.getContext("webgl2") ?? probe.getContext("webgl")) as WebGLRenderingContextBase | null
        if (gl === null) {
          webglAnswer = false
        } else {
          // The renderer's name says whether the work is done on the processor. Without the extension, the name is not known,
          // and the shader is allowed to run.
          const info = gl.getExtension("WEBGL_debug_renderer_info")
          const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ""
          webglAnswer = !/swiftshader|llvmpipe|software/i.test(renderer)
        }
      } catch {
        webglAnswer = false
      }
    }
    // A one-time check of the browser after mount, which the server cannot make. It cannot be done during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(webglAnswer)
  }, [enabled])
  return supported
}

// Whether the page is ready for the shader: the hero's words have been painted and the page has loaded. The shader's set-up
// and its frames are the heaviest work on the landing, and on a slow device they hold back the words, which matter more than
// the grain arriving a moment later. The browser reports the words' paint as a largest-contentful-paint entry for an element
// inside the hero; entries for anything else (the header, the opening) do not count. Where the browser reports no such
// entries (Safari, Firefox), load alone is the signal. If no hero entry comes within six seconds of load, the shader goes
// ahead anyway, so the grain never waits on a page that does not report. Until then the flat ground stands in.
function useSettledAfterPaint(hero: React.RefObject<HTMLElement | null>) {
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    let painted = false
    let loaded = false
    let done = false
    let observer: PerformanceObserver | null = null
    let frame = 0
    let idle = 0
    let timer = 0
    let fallback = 0
    // Both signals are in: one frame after the paint, then a quiet moment for the browser, so the set-up starts after the
    // words are up. The timer is for browsers that lack idle callbacks.
    const begin = () => {
      if (done || !painted || !loaded) return
      done = true
      observer?.disconnect()
      window.clearTimeout(fallback)
      frame = requestAnimationFrame(() => {
        if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(() => setSettled(true), { timeout: 1000 })
        else timer = window.setTimeout(() => setSettled(true), 0)
      })
    }
    if (typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes?.includes("largest-contentful-paint")) {
      observer = new PerformanceObserver((list) => {
        const latest = list.getEntries().at(-1) as PerformanceEntry & { element?: Element | null }
        if (latest?.element && hero.current?.contains(latest.element)) {
          painted = true
          begin()
        }
      })
      observer.observe({ type: "largest-contentful-paint", buffered: true })
    } else {
      painted = true
    }
    const onLoad = () => {
      fallback = window.setTimeout(() => {
        painted = true
        begin()
      }, 6000)
      loaded = true
      begin()
    }
    if (document.readyState === "complete") onLoad()
    else window.addEventListener("load", onLoad, { once: true })
    return () => {
      observer?.disconnect()
      cancelAnimationFrame(frame)
      if (idle) window.cancelIdleCallback(idle)
      window.clearTimeout(timer)
      window.clearTimeout(fallback)
      window.removeEventListener("load", onLoad)
    }
  }, [hero])
  return settled
}

// Whether the element is within about a screen's worth of the viewport. It starts true, so nothing waits on the observer.
function useOnScreen(ref: React.RefObject<HTMLElement | null>) {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "120% 0px" })
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref])
  return visible
}

// Whether the screen is phone width (below the small breakpoint, 640px). The server cannot know the screen, so it answers no.
// That changes nothing it draws: the shader is only mounted after the browser has been checked, which is after mount.
const NARROW_QUERY = "(max-width: 639px)"
function useNarrowScreen() {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(NARROW_QUERY)
      query.addEventListener("change", notify)
      return () => query.removeEventListener("change", notify)
    },
    () => window.matchMedia(NARROW_QUERY).matches,
    () => false
  )
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReduced(query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])
  return reduced
}

type Point = { x: number; y: number; vx: number; vy: number; r: number }

// Points drift on a slow random walk, wrap at the edges, and are pushed a little away from the pointer.
function PointField({ dots, reduced }: { dots: string; reduced: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const context = canvas.getContext("2d")
    if (!context) return
    const parent = canvas.parentElement
    if (!parent) return

    let width = 0
    let height = 0
    let points: Point[] = []
    let frame = 0
    const pointer = { x: -9999, y: -9999 }
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const seed = () => {
      const count = Math.min(90, Math.round((width * height) / 15000))
      points = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.12,
        vy: (Math.random() - 0.5) * 0.12,
        r: 0.6 + Math.random() * 1.4,
      }))
    }

    const resize = () => {
      const rect = parent.getBoundingClientRect()
      width = rect.width
      height = rect.height
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      seed()
      draw(false)
    }

    const draw = (step: boolean) => {
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, width, height)
      context.fillStyle = `rgba(${dots}, 0.55)`
      for (const point of points) {
        if (step) {
          const dx = point.x - pointer.x
          const dy = point.y - pointer.y
          const distance = Math.hypot(dx, dy)
          if (distance < 120 && distance > 0) {
            const push = (120 - distance) / 120
            point.vx += (dx / distance) * push * 0.04
            point.vy += (dy / distance) * push * 0.04
          }
          point.vx *= 0.985
          point.vy *= 0.985
          point.x += point.vx
          point.y += point.vy
          if (point.x < 0) point.x += width
          if (point.x > width) point.x -= width
          if (point.y < 0) point.y += height
          if (point.y > height) point.y -= height
        }
        context.beginPath()
        context.arc(point.x, point.y, point.r, 0, Math.PI * 2)
        context.fill()
      }
    }

    const loop = () => {
      frame = requestAnimationFrame(loop)
      draw(true)
    }

    // The loop runs only while the backdrop is on screen.
    const observer = new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(frame)
      if (entry.isIntersecting && !reduced) frame = requestAnimationFrame(loop)
    })
    observer.observe(canvas)

    const onMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer.x = event.clientX - rect.left
      pointer.y = event.clientY - rect.top
    }
    const onLeave = () => {
      pointer.x = -9999
      pointer.y = -9999
    }

    const observerResize = new ResizeObserver(resize)
    observerResize.observe(parent)
    resize()
    if (!reduced) {
      window.addEventListener("pointermove", onMove, { passive: true })
      window.addEventListener("pointerleave", onLeave)
      frame = requestAnimationFrame(loop)
    }

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      observerResize.disconnect()
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerleave", onLeave)
    }
  }, [dots, reduced])

  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 -z-[5] opacity-70" />
}
