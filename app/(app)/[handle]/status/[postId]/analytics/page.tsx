import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { requireViewer } from "@/lib/auth"
import { postAnalytics } from "@/lib/data"
import { pluralize } from "@/lib/format"
import { DailyChart, StatGrid, exact } from "@/components/app/analytics-bits"
import { PageHeader } from "@/components/app/page-header"
import { LocalTime } from "@/components/app/time-text"

type Params = Promise<{ handle: string; postId: string }>

// Existence checks run before anything streams, so a missing record gets a real 404.
export const instant = false

// Only the author sees a post's analytics, and only once the post is live. Anyone else, and a draft or a scheduled post,
// gets the same page as a missing post. Every number is the one the data layer counted.
export default async function PostAnalyticsPage({ params }: { params: Params }) {
  const viewer = await requireViewer()
  const { handle, postId } = await params
  const stats = postAnalytics(postId, viewer.id)
  if (!stats) notFound()
  if (stats.handle.toLowerCase() !== handle.toLowerCase()) redirect(`/${stats.handle}/status/${stats.id}/analytics`)

  const statusHref = `/${stats.handle}/status/${stats.id}`
  const quiet = stats.views === 0

  // The five ways people respond, each with its own count. The bars compare them with one another.
  const actions = [
    { label: "Likes", count: stats.likes },
    { label: "Reposts", count: stats.reposts },
    { label: "Quotes", count: stats.quotes },
    { label: "Replies", count: stats.replies },
    { label: "Bookmarks", count: stats.bookmarks },
  ]
  const biggest = Math.max(1, ...actions.map((row) => row.count))

  return (
    <>
      <PageHeader title="Post analytics" backHref={statusHref} />

      <Link href={statusHref} className="flex flex-col gap-1.5 border-b border-border px-4 py-4 transition-colors duration-200 hover:bg-muted/50">
        <p className="line-clamp-3 text-[15px] leading-relaxed break-words">{stats.body || "Photo or video post"}</p>
        <span className="text-[13px] text-muted-foreground">
          Posted <LocalTime at={stats.createdAt} variant="full" />
        </span>
      </Link>

      <StatGrid
        columns={3}
        items={[
          { label: "Views", note: "People who saw it", value: exact(stats.views) },
          { label: "Engagement", note: "Actions per view", value: stats.engagementRate === null ? "—" : `${exact(stats.engagementRate)}%` },
          { label: "Likes", note: "All time", value: exact(stats.likes) },
          { label: "Reposts", note: "All time", value: exact(stats.reposts) },
          { label: "Quotes", note: "All time", value: exact(stats.quotes) },
          { label: "Replies", note: "All time", value: exact(stats.replies) },
        ]}
      />

      <DailyChart
        id="daily"
        title="Views, last 14 days"
        caption="Views of this post for each of the last 14 days"
        series={[{ label: "Views", unit: "view", bar: "bg-foreground" }]}
        days={stats.days.map((day) => ({ label: day.label, values: [day.views] }))}
        note={
          <>
            <p className="text-sm text-muted-foreground tabular-nums">
              {exact(stats.views)} {pluralize(stats.views, "view")} all time
            </p>
            {quiet ? <p className="text-sm text-muted-foreground">No one has seen this post yet. Views appear as people scroll past it.</p> : null}
          </>
        }
      />

      <section aria-labelledby="breakdown" className="flex flex-col px-4 py-5">
        <h2 id="breakdown" className="pb-2 text-base font-semibold">
          Actions
        </h2>
        <ul className="flex flex-col divide-y divide-border">
          {actions.map((row) => (
            <li key={row.label} className="flex flex-col gap-2 py-3">
              <div className="flex items-baseline justify-between gap-3 text-[15px]">
                <span>{row.label}</span>
                <span className="font-semibold tabular-nums">{exact(row.count)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div className="h-full rounded-full bg-foreground" style={{ width: `${Math.round((row.count / biggest) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <p className="px-4 pb-8 text-sm text-muted-foreground">
        A view counts once per person, when the post scrolls into view. Your own views are never counted. Engagement is the likes, reposts, quotes, replies and
        bookmarks the post has received, divided by its views. Days run from midnight to midnight UTC.
      </p>
    </>
  )
}
