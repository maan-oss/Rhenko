"use client"

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

// How many posts each source may add to a For you page's candidates before the ranking orders them. These are the
// server's limits from lib/data.ts (POOL_SIZE), not anyone's data, so the chart is the same for everyone.
const POOLS = [
  { key: "follow", label: "People you follow", limit: 200 },
  { key: "social", label: "Liked by people you follow", limit: 150 },
  { key: "affinity", label: "Authors you engage with", limit: 150 },
  { key: "repost", label: "Reposts from people you follow", limit: 100 },
  { key: "topic", label: "Topics you follow", limit: 100 },
  { key: "popular", label: "Popular right now", limit: 100 },
  { key: "explore", label: "Smaller accounts, new today", limit: 60 },
  { key: "fresh", label: "Newest from anyone", limit: 300 },
]

// Largest first, so the eye reads the sources from the widest limit down.
const SORTED = [...POOLS].sort((a, b) => b.limit - a.limit)

export function PoolsChart() {
  return (
    <div className="h-[400px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={SORTED} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 0 }} barCategoryGap="30%">
          <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="2 4" />
          <XAxis type="number" hide domain={[0, 330]} />
          <YAxis
            type="category"
            dataKey="label"
            width={290}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--foreground)", fontSize: 13, fontFamily: "var(--font-sora)" }}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const row = payload[0].payload as (typeof POOLS)[number]
              return (
                <div className="rounded-xl border border-border bg-popover px-3 py-2 text-[12.5px] shadow-lg">
                  <div className="font-semibold text-foreground">{row.label}</div>
                  <div className="text-muted-foreground">Up to {row.limit} posts</div>
                </div>
              )
            }}
          />
          <Bar dataKey="limit" radius={[0, 10, 10, 0]} maxBarSize={26}>
            {POOLS.map((pool) => (
              <Cell key={pool.key} style={{ fill: pool.key === "fresh" || pool.key === "follow" ? "var(--foreground)" : "var(--dusk)" }} />
            ))}
            <LabelList dataKey="limit" position="right" className="fill-foreground text-[12px] font-semibold" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
