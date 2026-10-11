"use client"

import { EvilAreaChart } from "@/components/evilcharts/charts/recharts-area-chart"
import { EvilBarChart } from "@/components/evilcharts/charts/recharts-bar-chart"
import { EvilPieChart } from "@/components/evilcharts/charts/recharts-pie-chart"
import type { ChartConfig } from "@/components/evilcharts/ui/recharts-chart"

const monthly = [
  { month: "January", desktop: 342, mobile: 245 },
  { month: "February", desktop: 876, mobile: 654 },
  { month: "March", desktop: 512, mobile: 387 },
  { month: "April", desktop: 629, mobile: 521 },
  { month: "May", desktop: 458, mobile: 412 },
  { month: "June", desktop: 781, mobile: 598 },
  { month: "July", desktop: 394, mobile: 312 },
  { month: "August", desktop: 925, mobile: 743 },
]

const monthlyConfig = {
  desktop: { label: "Desktop", colors: { light: ["var(--chart-1)"], dark: ["var(--chart-1)"] } },
  mobile: { label: "Mobile", colors: { light: ["var(--chart-3)"], dark: ["var(--chart-3)"] } },
} satisfies ChartConfig

const sources = [
  { source: "direct", visitors: 275 },
  { source: "search", visitors: 200 },
  { source: "social", visitors: 187 },
  { source: "referral", visitors: 173 },
]

const sourceConfig = {
  visitors: { label: "Visitors" },
  direct: { label: "Direct", colors: { light: ["var(--chart-1)"], dark: ["var(--chart-1)"] } },
  search: { label: "Search", colors: { light: ["var(--chart-2)"], dark: ["var(--chart-2)"] } },
  social: { label: "Social", colors: { light: ["var(--chart-3)"], dark: ["var(--chart-3)"] } },
  referral: { label: "Referral", colors: { light: ["var(--chart-4)"], dark: ["var(--chart-4)"] } },
} satisfies ChartConfig

export function ChartsDemo() {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-2 border border-border p-4 md:col-span-2">
        <p className="text-sm font-semibold">Area chart</p>
        <p className="text-xs text-muted-foreground">Sample data</p>
        <div className="h-64 w-full min-w-0">
          <EvilAreaChart data={monthly} config={monthlyConfig} className="h-full w-full p-2">
            <EvilAreaChart.Grid />
            <EvilAreaChart.XAxis dataKey="month" tickFormatter={(v) => String(v).substring(0, 3)} />
            <EvilAreaChart.YAxis dataKey="desktop" />
            <EvilAreaChart.Legend isClickable />
            <EvilAreaChart.Tooltip />
            <EvilAreaChart.Area dataKey="desktop" variant="gradient" isClickable>
              <EvilAreaChart.ActiveDot variant="default" />
            </EvilAreaChart.Area>
            <EvilAreaChart.Area dataKey="mobile" variant="gradient" isClickable>
              <EvilAreaChart.ActiveDot variant="default" />
            </EvilAreaChart.Area>
          </EvilAreaChart>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-2 border border-border p-4">
        <p className="text-sm font-semibold">Bar chart</p>
        <p className="text-xs text-muted-foreground">Sample data</p>
        <div className="h-56 w-full min-w-0">
          <EvilBarChart data={monthly} config={monthlyConfig} className="h-full w-full p-2">
            <EvilBarChart.Grid />
            <EvilBarChart.XAxis dataKey="month" tickFormatter={(v) => String(v).substring(0, 3)} />
            <EvilBarChart.Legend />
            <EvilBarChart.Tooltip />
            <EvilBarChart.Bar dataKey="desktop" variant="default" />
          </EvilBarChart>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-2 border border-border p-4">
        <p className="text-sm font-semibold">Donut chart</p>
        <p className="text-xs text-muted-foreground">Sample data</p>
        <div className="h-56 w-full min-w-0">
          <EvilPieChart data={sources} dataKey="visitors" nameKey="source" config={sourceConfig} className="h-full w-full p-2">
            <EvilPieChart.Legend isClickable />
            <EvilPieChart.Tooltip />
            <EvilPieChart.Pie innerRadius={56} paddingAngle={2} cornerRadius={0} />
          </EvilPieChart>
        </div>
      </div>
    </div>
  )
}
