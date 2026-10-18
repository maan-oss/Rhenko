"use client"

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
import { motion, useReducedMotion } from "motion/react"
import { exact } from "@/components/app/analytics-bits"
import { pluralize } from "@/lib/format"

export type TrendPoint = { label: string; value: number }

const HEIGHT = 168
const TOP = 12
const BOTTOM = 4
// The first and last points sit this far in from the edges, so their dots are never cut off.
const INSET = 10
const EASE = [0.2, 0.7, 0.2, 1] as const

type Point = { x: number; y: number }

// A round top for the scale, a little above the biggest value, so the peak never touches the top edge.
function scaleTop(peak: number): number {
  if (peak <= 0) return 4
  const raw = peak * 1.1
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => s * magnitude >= raw) ?? 10
  return Math.ceil(step * magnitude)
}

// A smooth line through the points (Catmull-Rom, written as cubic segments). The control points are kept inside the plot,
// so the curve never dips below zero or rises above the scale.
function curve(points: Point[], minY: number, maxY: number): string {
  if (points.length === 0) return ""
  const clampY = (y: number) => Math.min(maxY, Math.max(minY, y))
  let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = i + 2 < points.length ? points[i + 2] : p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = clampY(p1.y + (p2.y - p0.y) / 6)
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = clampY(p2.y - (p3.y - p1.y) / 6)
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`
  }
  return d
}

// One line of values over time. The line draws itself in when it appears and redraws when the series changes. Hover, a
// finger or the arrow keys read out the value of any day. The line above the chart always says the peak, or what the
// point under the pointer is, so nothing covers the data and nothing moves when the reading changes.
export function TrendChart({
  points,
  caption,
  unit,
  empty,
}: {
  points: TrendPoint[]
  // Read out for screen readers, and used to restart the draw when the series changes.
  caption: string
  // The singular word for one of the values ("view").
  unit: string
  // What the line says when nothing has happened in the span.
  empty: string
}) {
  const frame = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [width, setWidth] = useState(0)
  const [active, setActive] = useState<number | null>(null)
  const reduce = useReducedMotion()
  // The gradient needs an id that is unique on the page and safe inside url(#...).
  const fadeId = `fade${useId().replace(/[^a-zA-Z0-9]/g, "")}`

  const count = points.length
  const peakIndex = points.reduce((best, point, index) => (point.value > points[best].value ? index : best), 0)
  const peak = count > 0 ? points[peakIndex].value : 0
  const quiet = peak === 0
  const top = scaleTop(peak)

  useEffect(() => {
    const element = frame.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const plotWidth = Math.max(0, width - INSET * 2)
  const baseY = HEIGHT - BOTTOM
  const xAt = (index: number) => INSET + (count > 1 ? (index / (count - 1)) * plotWidth : plotWidth / 2)
  const yAt = (value: number) => baseY - (value / top) * (baseY - TOP)
  const coords: Point[] = points.map((point, index) => ({ x: xAt(index), y: yAt(point.value) }))
  const line = curve(coords, TOP, baseY)
  const area = count > 1 ? `${line} L${xAt(count - 1).toFixed(1)},${baseY} L${xAt(0).toFixed(1)},${baseY} Z` : ""
  const hovered = active !== null && active < count ? active : null
  const last = count > 0 ? coords[count - 1] : null
  const drawKey = `${caption}:${count}`

  function indexAt(clientX: number): number {
    const box = frame.current?.getBoundingClientRect()
    if (!box || count === 0) return 0
    const share = (clientX - box.left - INSET) / Math.max(1, plotWidth)
    return Math.min(count - 1, Math.max(0, Math.round(share * (count - 1))))
  }

  // A mouse follows the pointer. A finger reads out only while it is down, so a scroll past the chart leaves no value behind.
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    dragging.current = true
    setActive(indexAt(event.clientX))
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" || dragging.current) setActive(indexAt(event.clientX))
  }
  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    dragging.current = false
    if (event.pointerType !== "mouse") setActive(null)
  }
  function onPointerLeave(event: PointerEvent<HTMLDivElement>) {
    dragging.current = false
    if (event.pointerType === "mouse") setActive(null)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (count === 0) return
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault()
      const from = active ?? count - 1
      const step = event.key === "ArrowRight" ? 1 : -1
      setActive(Math.min(count - 1, Math.max(0, from + step)))
    } else if (event.key === "Escape") {
      setActive(null)
    }
  }

  const middle = count > 2 ? Math.floor((count - 1) / 2) : null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-6 items-center text-sm tabular-nums">
        {hovered !== null ? (
          <p>
            <span className="text-muted-foreground">{points[hovered].label}</span>{" "}
            <span className="font-semibold">
              {exact(points[hovered].value)} {pluralize(points[hovered].value, unit)}
            </span>
          </p>
        ) : quiet ? (
          <p className="text-muted-foreground">{empty}</p>
        ) : (
          <p className="text-muted-foreground">
            Peak <span className="font-semibold text-foreground">{exact(peak)} {pluralize(peak, unit)}</span> on {points[peakIndex].label}
          </p>
        )}
      </div>

      <div
        ref={frame}
        role="group"
        aria-label={caption}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          dragging.current = false
          setActive(null)
        }}
        onPointerLeave={onPointerLeave}
        className="relative touch-pan-y cursor-crosshair rounded-xl outline-none"
        style={{ height: HEIGHT }}
      >
        <svg width={width} height={HEIGHT} className="block overflow-visible text-foreground" aria-hidden="true">
          <defs>
            <linearGradient id={fadeId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="currentColor" stopOpacity={0.12} />
              <stop offset="1" stopColor="currentColor" stopOpacity={0} />
            </linearGradient>
          </defs>
          <line x1={0} x2={width} y1={yAt(top / 2)} y2={yAt(top / 2)} strokeDasharray="3 5" className="stroke-border" />
          <line x1={0} x2={width} y1={baseY} y2={baseY} className="stroke-border" />
          {area ? (
            <motion.path
              key={`area-${drawKey}`}
              d={area}
              fill={`url(#${fadeId})`}
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.1, ease: EASE }}
            />
          ) : null}
          {line ? (
            <motion.path
              key={`line-${drawKey}`}
              d={line}
              fill="none"
              strokeWidth={2.25}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="stroke-foreground"
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.9, ease: EASE }}
            />
          ) : null}
          {hovered !== null ? (
            <>
              <line x1={coords[hovered].x} x2={coords[hovered].x} y1={TOP} y2={baseY} strokeWidth={1} className="stroke-foreground/25" />
              <circle cx={coords[hovered].x} cy={coords[hovered].y} r={5} strokeWidth={2} className="fill-background stroke-foreground" />
            </>
          ) : last && last.y < baseY ? (
            <circle cx={last.x} cy={last.y} r={3.5} className="fill-foreground" />
          ) : null}
        </svg>
      </div>

      <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
        <span>{points[0]?.label}</span>
        {middle !== null ? <span>{points[middle].label}</span> : null}
        <span>{points[count - 1]?.label}</span>
      </div>

      <ul className="sr-only">
        {points.map((point) => (
          <li key={point.label}>
            {point.label}: {exact(point.value)} {pluralize(point.value, unit)}
          </li>
        ))}
      </ul>
    </div>
  )
}
