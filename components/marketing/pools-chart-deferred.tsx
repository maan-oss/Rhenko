"use client"

import { lazy, Suspense, useEffect, useRef, useState } from "react"

// The chart library is large. It is downloaded only when the chart is about to scroll into view, so a visitor who never
// reaches that part of the page never downloads it. The space is reserved, so nothing moves when the chart arrives.
const PoolsChart = lazy(() => import("@/components/marketing/pools-chart").then((m) => ({ default: m.PoolsChart })))

export function DeferredPoolsChart() {
  const slot = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)

  useEffect(() => {
    const element = slot.current
    if (near || !element) return
    if (typeof IntersectionObserver === "undefined") {
      // A browser without the observer loads the chart straight away, after the page has been painted.
      const timer = window.setTimeout(() => setNear(true), 0)
      return () => window.clearTimeout(timer)
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true)
          observer.disconnect()
        }
      },
      { rootMargin: "400px 0px" }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [near])

  return (
    <div ref={slot} className="h-[400px] w-full">
      {near ? (
        <Suspense fallback={null}>
          <PoolsChart />
        </Suspense>
      ) : null}
    </div>
  )
}
