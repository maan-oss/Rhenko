import type { ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { pluralize } from "@/lib/format"
import { cn } from "@/lib/utils"

// The pieces the two analytics pages share. Every number is written out in full, exactly as the data layer counted it.

const EXACT = new Intl.NumberFormat("en-US")

export function exact(value: number): string {
  return EXACT.format(value)
}

export type StatItem = { label: string; value: string; note: string }

// A grid of headline numbers. Two across on a phone, and as many as `columns` says from the medium breakpoint up.
export function StatGrid({ items, columns }: { items: StatItem[]; columns: 3 | 4 }) {
  return (
    <div className={cn("grid grid-cols-2 gap-px border-b border-border bg-border", columns === 4 ? "md:grid-cols-4" : "md:grid-cols-3")}>
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-col gap-1 bg-background px-4 py-4">
          <p className="text-sm text-muted-foreground">{item.label}</p>
          <p className="text-2xl font-bold break-words tabular-nums">{item.value}</p>
          <p className="text-xs text-muted-foreground">{item.note}</p>
        </div>
      ))}
    </div>
  )
}

// `unit` is the singular word for one count in the series ("view"), used in the tooltip over each day.
export type ChartSeries = { label: string; unit: string; bar: string }
export type ChartDay = { label: string; values: number[] }

function Bar({ value, peak, className }: { value: number; peak: number; className: string }) {
  const height = value === 0 ? 0 : Math.max(4, Math.round((value / peak) * 100))
  return <div className={cn("w-full rounded-t-sm", className)} style={{ height: `${height}%` }} />
}

// Bars for each of the last days, oldest on the left, one bar per series in a day. The chart has no scale of its own, so
// the tallest bar says what it stands for, and a table under it lists every day's numbers for anyone who wants them.
export function DailyChart({
  id,
  title,
  caption,
  series,
  days,
  note,
}: {
  id: string
  title: string
  // What the chart shows, said once for people who can't see it.
  caption: string
  series: ChartSeries[]
  days: ChartDay[]
  // Shown above the chart, such as the reason it is empty.
  note?: ReactNode
}) {
  const peak = Math.max(1, ...days.flatMap((day) => day.values))
  const quiet = days.every((day) => day.values.every((value) => value === 0))
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 border-b border-border px-4 py-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id={id} className="text-base font-semibold">
          {title}
        </h2>
        {series.length > 1 ? (
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {series.map((item) => (
              <li key={item.label} className="flex items-center gap-1.5">
                <span className={cn("size-2.5 rounded-sm", item.bar)} aria-hidden="true" /> {item.label}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {note}

      <div className="flex h-44 items-end gap-1.5 border-b border-border" role="img" aria-label={caption}>
        {days.map((day) => (
          <div
            key={day.label}
            className="flex h-full min-w-0 flex-1 flex-col justify-end"
            title={`${day.label}: ${day.values.map((value, index) => `${exact(value)} ${pluralize(value, series[index].unit)}`).join(", ")}`}
          >
            <div className="flex h-full items-end gap-0.5">
              {day.values.map((value, index) => (
                <Bar key={series[index].label} value={value} peak={peak} className={series[index].bar} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between gap-3 text-xs text-muted-foreground">
        <span>{days[0]?.label}</span>
        {quiet ? null : <span className="text-center">Tallest bar: {exact(peak)}</span>}
        <span>{days[days.length - 1]?.label}</span>
      </div>

      <details className="group rounded-2xl border border-border">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 text-sm font-semibold marker:content-none [&::-webkit-details-marker]:hidden">
          Daily numbers
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full text-sm tabular-nums">
            <caption className="sr-only">{caption}, newest day first</caption>
            <thead>
              <tr className="text-muted-foreground">
                <th scope="col" className="px-4 py-2 text-left font-medium">
                  Day
                </th>
                {series.map((item) => (
                  <th key={item.label} scope="col" className="px-4 py-2 text-right font-medium">
                    {item.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...days].reverse().map((day) => (
                <tr key={day.label} className="border-t border-border">
                  <th scope="row" className="px-4 py-2 text-left font-normal">
                    {day.label}
                  </th>
                  {day.values.map((value, index) => (
                    <td key={series[index].label} className="px-4 py-2 text-right">
                      {exact(value)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  )
}
