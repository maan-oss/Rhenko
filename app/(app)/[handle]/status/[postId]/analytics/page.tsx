import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { requireViewer } from "@/lib/auth"
import { postAnalytics } from "@/lib/data"
import { formatCount } from "@/lib/format"
import { PageHeader } from "@/components/app/page-header"
import { LocalTime } from "@/components/app/time-text"

type Params = Promise<{ handle: string; postId: string }>

// Existence checks run before anything streams, so a missing record gets a real 404.
export const instant = false

// Only the author sees a post's analytics. Anyone else gets the same page as a missing post.
export default async function PostAnalyticsPage({ params }: { params: Params }) {
  const viewer = await requireViewer()
  const { handle, postId } = await params
  const stats = postAnalytics(postId, viewer.id)
  if (!stats) notFound()
  if (stats.handle.toLowerCase() !== handle.toLowerCase()) redirect(`/${stats.handle}/status/${stats.id}/analytics`)

  const statusHref = `/${stats.handle}/status/${stats.id}`
  const peak = Math.max(1, ...stats.days.map((day) => day.views))
  const quiet = stats.views === 0

  const tiles = [
    { label: "Views", value: formatCount(stats.views), sub: "People who saw it" },
    { label: "Engagement", value: stats.engagementRate === null ? "—" : `${stats.engagementRate}%`, sub: "Actions per view" },
    { label: "Likes", value: formatCount(stats.likes), sub: "All time" },
    { label: "Reposts", value: formatCount(stats.reposts), sub: "All time" },
    { label: "Quotes", value: formatCount(stats.quotes), sub: "All time" },
    { label: "Replies", value: formatCount(stats.replies), sub: "All time" },
  ]

  const rows = [
    { label: "Likes", count: stats.likes },
    { label: "Reposts", count: stats.reposts },
    { label: "Quotes", count: stats.quotes },
    { label: "Replies", count: stats.replies },
    { label: "Bookmarks", count: stats.bookmarks },
  ]

  return (
    <>
      <PageHeader title="Post analytics" backHref={statusHref} />

      <Link href={statusHref} className="flex flex-col gap-1.5 border-b border-border px-4 py-4 transition-colors duration-200 hover:bg-muted/50">
        <p className="line-clamp-3 text-[15px] leading-relaxed">{stats.body || "Photo or video post"}</p>
        <span className="text-[13px] text-muted-foreground">
          Posted <LocalTime at={stats.createdAt} variant="full" />
        </span>
      </Link>

      <div className="grid grid-cols-2 gap-px border-b border-border bg-border md:grid-cols-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="flex flex-col gap-1 bg-background px-4 py-4">
            <p className="text-sm text-muted-foreground">{tile.label}</p>
            <p className="text-2xl font-bold tabular-nums">{tile.value}</p>
            <p className="text-xs text-muted-foreground">{tile.sub}</p>
          </div>
        ))}
      </div>

      <section aria-labelledby="daily" className="flex flex-col gap-4 border-b border-border px-4 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="daily" className="text-base font-semibold">
            Views, last 14 days
          </h2>
          <p className="text-sm text-muted-foreground tabular-nums">{formatCount(stats.views)} in total</p>
        </div>
        {quiet ? <p className="text-sm text-muted-foreground">No one has seen this post yet. Views appear as people scroll past it.</p> : null}
        <div className="flex h-44 items-end gap-1.5" role="img" aria-label="Views of this post for each of the last 14 days">
          {stats.days.map((day) => (
            <div key={day.label} className="flex h-full flex-1 flex-col justify-end" title={`${day.label}: ${day.views} views`}>
              <div className="flex h-full items-end">
                <div
                  className="w-full rounded-t-sm bg-foreground"
                  style={{ height: day.views === 0 ? 0 : `${Math.max(4, Math.round((day.views / peak) * 100))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{stats.days[0]?.label}</span>
          <span>{stats.days[stats.days.length - 1]?.label}</span>
        </div>
      </section>

      <section aria-labelledby="breakdown" className="flex flex-col px-4 py-5">
        <h2 id="breakdown" className="pb-2 text-base font-semibold">
          Actions
        </h2>
        <ul className="flex flex-col divide-y divide-border">
          {rows.map((row) => {
            const share = stats.views > 0 ? Math.round((row.count / stats.views) * 1000) / 10 : null
            return (
              <li key={row.label} className="flex flex-col gap-2 py-3">
                <div className="flex items-baseline justify-between gap-3 text-[15px]">
                  <span>{row.label}</span>
                  <span className="tabular-nums">
                    <span className="font-semibold">{formatCount(row.count)}</span>
                    <span className="ml-2 text-muted-foreground">{share === null ? "No views yet" : `${share}% of views`}</span>
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <div className="h-full rounded-full bg-foreground" style={{ width: `${Math.min(100, share ?? 0)}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <p className="px-4 pb-8 text-sm text-muted-foreground">
        A view counts once per person when the post scrolls into view. Your own views are never counted. Engagement is likes, reposts, quotes, replies and bookmarks divided by views.
      </p>
    </>
  )
}
