import Link from "next/link"
import { requireViewer } from "@/lib/auth"
import { analyticsFor } from "@/lib/data"
import { formatCount, pluralize } from "@/lib/format"
import { PageHeader } from "@/components/app/page-header"
import { cn } from "@/lib/utils"

// Only the account's owner sees this page. It reads the account's own posts and profile.
export default async function AnalyticsPage() {
  const viewer = await requireViewer()
  const stats = analyticsFor(viewer.id, viewer.handle)
  const peak = Math.max(1, ...stats.days.flatMap((day) => [day.views, day.visits]))
  const quiet = stats.days.every((day) => day.views === 0 && day.visits === 0)

  const tiles = [
    { label: "Post views", sub: "Last 28 days", value: stats.views28 },
    { label: "Profile visits", sub: "Last 28 days", value: stats.visits28 },
    { label: "Followers", sub: "All time", value: stats.followers },
    { label: "New followers", sub: "Last 28 days", value: stats.newFollowers28 },
  ]

  return (
    <>
      <PageHeader title="Analytics" backHref="/" />

      <div className="grid grid-cols-2 gap-px border-b border-border bg-border md:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="flex flex-col gap-1 bg-background px-4 py-4">
            <p className="text-sm text-muted-foreground">{tile.label}</p>
            <p className="text-2xl font-bold tabular-nums">{formatCount(tile.value)}</p>
            <p className="text-xs text-muted-foreground">{tile.sub}</p>
          </div>
        ))}
      </div>

      <section aria-labelledby="daily" className="flex flex-col gap-4 border-b border-border px-4 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="daily" className="text-base font-semibold">
            Last 14 days
          </h2>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-dusk" aria-hidden /> Post views
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-muted-foreground/50" aria-hidden /> Profile visits
            </span>
          </div>
        </div>

        {quiet ? <p className="text-sm text-muted-foreground">No views or visits in the last 14 days yet.</p> : null}
        <div className="flex h-44 items-end gap-1.5" role="img" aria-label="Post views and profile visits for each of the last 14 days">
          {stats.days.map((day) => (
            <div key={day.label} className="flex h-full flex-1 flex-col justify-end" title={`${day.label}: ${day.views} views, ${day.visits} visits`}>
              <div className="flex h-full items-end gap-0.5">
                <Bar value={day.views} peak={peak} className="bg-dusk" />
                <Bar value={day.visits} peak={peak} className="bg-muted-foreground/50" />
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{stats.days[0]?.label}</span>
          <span>{stats.days[stats.days.length - 1]?.label}</span>
        </div>
      </section>

      <section aria-labelledby="top" className="flex flex-col">
        <h2 id="top" className="px-4 pt-5 pb-2 text-base font-semibold">
          Top posts
        </h2>
        {stats.topPosts.length === 0 ? (
          <p className="px-4 pb-8 text-muted-foreground">Posts that people have seen will show up here.</p>
        ) : (
          <ul className="flex flex-col">
            {stats.topPosts.map((post) => (
              <li key={post.id} className="border-t border-border">
                <Link href={`/${post.handle}/status/${post.id}`} className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-muted/50">
                  <p className="line-clamp-2 text-[15px]">{post.body}</p>
                  <span className="text-[13px] text-muted-foreground tabular-nums">
                    {formatCount(post.views)} {pluralize(post.views, "view")} · {formatCount(post.likes)} {pluralize(post.likes, "like")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="px-4 py-6 text-sm text-muted-foreground">
        A view counts once per person when a post scrolls into view. A profile visit counts each person once every six hours. Your own visits and views are never counted.
      </p>
    </>
  )
}

function Bar({ value, peak, className }: { value: number; peak: number; className: string }) {
  const height = value === 0 ? 0 : Math.max(4, Math.round((value / peak) * 100))
  return <div className={cn("w-full rounded-t-sm", className)} style={{ height: `${height}%` }} />
}
