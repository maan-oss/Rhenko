"use client"

import { useEffect, useRef } from "react"
import { useReducedMotion } from "motion/react"

// The art beside the sign-in and sign-up forms: white strands flowing over black, the way a fluid hero draws its light.
// They draw in once on first paint. After that they move only while the pointer moves across the panel, so every motion
// answers a person. Under reduced motion they are drawn once, still. The panel is decorative, so it is hidden from screen
// readers.

const INK = "#0b0b0b"
const COLUMNS = 15
const ROWS = 8
const STEPS = 150
const STEP = 3.2
const DRAW_MS = 2000
// How far the flow turns for each pixel the pointer travels.
const FLOW_PER_PX = 0.0045

// The direction of the flow at a point. Fixed numbers only, so the same shape is drawn on every visit.
function angleAt(x: number, y: number, phase: number): number {
  return (
    Math.sin(x * 0.0041 + phase * 0.9) * 1.6 +
    Math.cos(y * 0.0054 - phase * 0.6) * 1.2 +
    Math.sin((x + y) * 0.0028 + phase * 0.4) * 1.0
  )
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export function AuthFlow() {
  const reduce = useReducedMotion()
  const panel = useRef<HTMLElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const section = panel.current
    const el = canvas.current
    const ctx = el?.getContext("2d")
    if (!section || !el || !ctx) return

    let width = 0
    let height = 0
    let phase = 0.8
    let grow = reduce ? 1 : 0
    let started = 0
    let drawingFrame = 0
    let queuedFrame = 0
    let pointer: { x: number; y: number } | null = null

    function draw() {
      if (!ctx || width === 0) return
      const dpr = window.devicePixelRatio || 1
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = INK
      ctx.fillRect(0, 0, width, height)
      ctx.lineWidth = 1
      ctx.lineCap = "round"
      const visible = Math.max(2, Math.round(STEPS * grow))
      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLUMNS; col++) {
          let x = -60 + (col * (width + 120)) / (COLUMNS - 1)
          let y = -60 + (row * (height + 120)) / (ROWS - 1)
          // Strands differ in brightness, so the field has depth rather than one flat tone.
          const alpha = 0.16 + 0.1 * ((row * 7 + col * 3) % 5)
          ctx.beginPath()
          ctx.moveTo(x, y)
          for (let k = 0; k < visible; k++) {
            const angle = angleAt(x, y, phase)
            x += Math.cos(angle) * STEP
            y += Math.sin(angle) * STEP
            ctx.lineTo(x, y)
          }
          // A faint wide halo under each strand gives the soft light of a fluid hero; the thin line keeps it crisp.
          ctx.lineWidth = 6
          ctx.strokeStyle = `rgba(255, 255, 255, ${(alpha * 0.12).toFixed(3)})`
          ctx.stroke()
          ctx.lineWidth = 1
          ctx.strokeStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`
          ctx.stroke()
        }
      }
    }

    function drawEntrance(now: number) {
      if (!started) started = now
      const t = Math.min(1, (now - started) / DRAW_MS)
      grow = easeOut(t)
      draw()
      if (t < 1) drawingFrame = requestAnimationFrame(drawEntrance)
    }

    function queueDraw() {
      if (queuedFrame) return
      queuedFrame = requestAnimationFrame(() => {
        queuedFrame = 0
        draw()
      })
    }

    function size() {
      const box = section!.getBoundingClientRect()
      width = box.width
      height = box.height
      const dpr = window.devicePixelRatio || 1
      el!.width = Math.round(width * dpr)
      el!.height = Math.round(height * dpr)
      draw()
    }

    function onMove(event: PointerEvent) {
      if (pointer) {
        const distance = Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y)
        phase += distance * FLOW_PER_PX
        queueDraw()
      }
      pointer = { x: event.clientX, y: event.clientY }
    }

    function onLeave() {
      pointer = null
    }

    const observer = new ResizeObserver(size)
    observer.observe(section)
    if (!reduce) {
      drawingFrame = requestAnimationFrame(drawEntrance)
      section.addEventListener("pointermove", onMove)
      section.addEventListener("pointerleave", onLeave)
    }
    size()

    return () => {
      observer.disconnect()
      cancelAnimationFrame(drawingFrame)
      cancelAnimationFrame(queuedFrame)
      section.removeEventListener("pointermove", onMove)
      section.removeEventListener("pointerleave", onLeave)
    }
  }, [reduce])

  return (
    <section
      ref={panel}
      aria-hidden="true"
      className="relative hidden overflow-hidden lg:flex lg:w-[44%] lg:shrink-0"
      style={{ background: INK }}
    >
      <canvas ref={canvas} className="absolute inset-0 block size-full" />
    </section>
  )
}
