import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { requireViewer } from "@/lib/auth"
import { postAnalytics } from "@/lib/data"
import { pluralize } from "@/lib/format"
import { exact } from "@/components/app/analytics-bits"
import { PageHeader } from "@/components/app/page-header"
import { TrendChart } from "@/components/app/trend-chart"
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

  // The five ways people respond, each with its own count. The bars compare them with one another.
  const actions = [
    { label: "Likes", count: stats.likes },
    { label: "Reposts", count: stats.reposts },
    { label: "Quotes", count: stats.quotes },
    { label: "Replies", count: stats.replies },
    { label: "Bookmarks", count: stats.bookmarks },
  ]

  return (
    <>
      <PageHeader title="Post analytics" backHref={statusHref} />

      <Link href={statusHref} className="flex flex-col gap-1.5 border-b border-border px-4 py-4 transition-colors duration-200 hover:bg-muted/50 active:bg-muted">
        <p className="line-clamp-3 text-[15px] leading-relaxed break-words">{stats.body || "Photo or video post"}</p>
        <span className="text-[13px] text-muted-foreground">
          Posted <LocalTime at={stats.createdAt} variant="full" />
        </span>
      </Link>

      <section aria-labelledby="views" className="flex flex-col gap-4 px-4 pt-5">
        <div className="flex flex-col gap-2">
          <h2 id="views" className="sr-only">
            Views
          </h2>
          <p className="text-[44px] leading-none font-semibold tracking-tight tabular-nums">{exact(stats.views)}</p>
          <p className="text-sm text-muted-foreground tabular-nums">
            {pluralize(stats.views, "view")} in total ·{" "}
            {stats.engagementRate === null ? "No engagement yet" : `${exact(stats.engagementRate)}% engagement`}
          </p>
        </div>
        <TrendChart
          points={stats.days.map((day) => ({ label: day.label, value: day.views }))}
          caption="Views of this post for each of the last 14 days"
          unit="view"
          empty="No one has seen this post yet."
        />
      </section>

      <section aria-labelledby="breakdown" className="mt-8 flex flex-col border-t border-border px-4 pt-5 pb-2">
        <h2 id="breakdown" className="pb-2 text-base font-semibold">
          Actions
        </h2>
        <ul className="flex flex-col">
          {actions.map((row) => (
            <li key={row.label} className="flex items-baseline justify-between gap-3 border-t border-border py-3.5 text-[15px] first:border-t-0">
              <span>{row.label}</span>
              <span className="font-semibold tabular-nums">{exact(row.count)}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="px-4 py-8 text-sm leading-relaxed text-muted-foreground">
        A view counts once per person, when the post scrolls into view. Your own views are never counted. Engagement is the likes, reposts, quotes, replies and
        bookmarks the post has received, divided by its views. Days run from midnight to midnight UTC.
      </p>
    </>
  )
}
