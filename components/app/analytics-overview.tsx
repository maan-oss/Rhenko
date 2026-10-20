"use client"

import { useState } from "react"
import { motion } from "motion/react"
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"
import { CountUp } from "@/components/app/count-up"
import { exact } from "@/components/app/analytics-bits"
import { TAB_FILL } from "@/components/app/tabs"
import { TrendChart } from "@/components/app/trend-chart"
import { pluralize } from "@/lib/format"
import type { AnalyticsDay } from "@/lib/data"
import { DEFINITIONS } from "@/lib/metric-definitions"
import { cn } from "@/lib/utils"

type Measure = { label: string; unit: string; pick: (day: AnalyticsDay) => number; definition: string }

const MEASURES: Measure[] = [
  { label: "Post views", unit: "view", pick: (day) => day.views, definition: DEFINITIONS.views },
  { label: "Profile visits", unit: "visit", pick: (day) => day.visits, definition: DEFINITIONS.visits },
  { label: "New followers", unit: "new follower", pick: (day) => day.follows, definition: DEFINITIONS.follows },
]

const RANGES = [7, 14, 28] as const
type Range = (typeof RANGES)[number]

const ARROWS = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus } as const

function sum(days: AnalyticsDay[], pick: (day: AnalyticsDay) => number): number {
  return days.reduce((total, day) => total + pick(day), 0)
}

// The change from the span before, as a percentage. Activity after a span with none reads as new, not as a jump from zero.
function change(now: number, before: number): { text: string; direction: keyof typeof ARROWS } {
  if (before === 0) return now === 0 ? { text: "No change", direction: "flat" } : { text: "New", direction: "up" }
  const percent = Math.round(((now - before) / before) * 100)
  if (percent === 0) return { text: "No change", direction: "flat" }
  return { text: `${percent > 0 ? "+" : "−"}${Math.abs(percent)}%`, direction: percent > 0 ? "up" : "down" }
}

// The measure cards, the range and the chart. Each card shows its total for the chosen range, so a card and the chart
// always agree. The chart moves between measures and ranges without a page load.
export function AnalyticsOverview({ days, followers }: { days: AnalyticsDay[]; followers: number }) {
  const [measureIndex, setMeasureIndex] = useState(0)
  const [range, setRange] = useState<Range>(28)

  const measure = MEASURES[measureIndex]
  const current = days.slice(-range)
  const before = days.slice(-2 * range, -range)
  const totals = MEASURES.map((item) => ({ now: sum(current, item.pick), before: sum(before, item.pick) }))
  const selected = totals[measureIndex]
  const shift = change(selected.now, selected.before)
  const ShiftArrow = ARROWS[shift.direction]
  const series = current.map((day) => ({ label: day.label, value: measure.pick(day) }))

  return (
    <div className="flex flex-col gap-4 px-4 pt-4">
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="What to show">
        {MEASURES.map((item, index) => {
          const isSelected = index === measureIndex
          const total = totals[index]
          const cardShift = change(total.now, total.before)
          const Arrow = ARROWS[cardShift.direction]
          return (
            <button
              key={item.label}
              type="button"
              aria-pressed={isSelected}
              title={item.definition}
              onClick={() => setMeasureIndex(index)}
              className="group relative flex min-w-0 flex-col gap-2.5 rounded-2xl px-2.5 py-3 text-left outline-none transition-transform duration-150 select-none active:scale-[0.97]"
            >
              {isSelected ? (
                <motion.span layoutId="analytics-measure" className="absolute inset-0 rounded-2xl border border-foreground bg-foreground/[0.03]" transition={TAB_FILL} />
              ) : (
                <span className="absolute inset-0 rounded-2xl border border-border transition-colors duration-200 group-hover:border-foreground/30 group-hover:bg-foreground/[0.02]" />
              )}
              <span className="relative text-[12px] leading-tight whitespace-nowrap text-muted-foreground">{item.label}</span>
              <span className="relative text-[22px] leading-none font-semibold tabular-nums"><CountUp value={total.now} /></span>
              <span className={cn("relative flex items-center gap-1 text-xs tabular-nums", cardShift.direction === "up" ? "text-foreground" : "text-muted-foreground")}>
                <Arrow className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 leading-snug">{cardShift.text}</span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-[44px] leading-none font-semibold tracking-tight tabular-nums"><CountUp value={selected.now} /></p>
            <p className="flex flex-wrap items-center gap-x-1.5 text-sm">
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 font-semibold tabular-nums",
                  shift.direction === "up" ? "text-foreground" : "text-muted-foreground"
                )}
              >
                <ShiftArrow className="size-3.5" aria-hidden="true" />
                {shift.text}
              </span>
              <span className="text-muted-foreground">
                {shift.text === "New" ? "nothing before" : `vs the ${range} days before`}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 rounded-full bg-muted p-1" role="group" aria-label="Date range">
            {RANGES.map((option) => {
              const on = option === range
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setRange(option)}
                  className="tap-44 relative h-8 rounded-full px-3 text-[13px] font-semibold tabular-nums outline-none select-none"
                >
                  {on ? <motion.span layoutId="analytics-range" className="absolute inset-0 rounded-full bg-foreground" transition={TAB_FILL} /> : null}
                  <span className={cn("relative transition-colors duration-200", on ? "text-background" : "text-muted-foreground hover:text-foreground")}>
                    {option}d
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <TrendChart
          points={series}
          caption={`${measure.label}, each of the last ${range} days`}
          unit={measure.unit}
          empty={`No ${measure.label.toLowerCase()} in the last ${range} days yet.`}
        />

        <p className="text-sm leading-relaxed text-muted-foreground">{measure.definition}</p>

        <p className="text-sm text-muted-foreground tabular-nums">
          {exact(followers)} {pluralize(followers, "follower")} in total
        </p>
      </div>
    </div>
  )
}
