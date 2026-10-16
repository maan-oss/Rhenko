import Link from "next/link"
import { requireViewer } from "@/lib/auth"
import { analyticsFor } from "@/lib/data"
import { pluralize } from "@/lib/format"
import { exact } from "@/components/app/analytics-bits"
import { AnalyticsOverview } from "@/components/app/analytics-overview"
import { ComposeAction } from "@/components/app/compose-action"
import { EmptyState } from "@/components/app/empty-state"
import { PageHeader } from "@/components/app/page-header"

// Only the account's owner sees this page. It reads the account's own posts and profile, and every number on it is
// the one the data layer counted: nothing is rounded, abbreviated or worked out again here.
export default async function AnalyticsPage() {
  const viewer = await requireViewer()
  const stats = analyticsFor(viewer.id, viewer.handle)
  const topViews = Math.max(1, ...stats.topPosts.map((post) => post.views))

  return (
    <>
      <PageHeader title="Analytics" backHref="/" />

      <AnalyticsOverview days={stats.days} followers={stats.followers} />

      <section aria-labelledby="top" className="mt-8 flex flex-col border-t border-border">
        <div className="px-4 pt-5 pb-1">
          <h2 id="top" className="text-base font-semibold">
            Top posts
          </h2>
          <p className="text-[13px] text-muted-foreground">Most viewed in the last 28 days. Likes are all time.</p>
        </div>
        {stats.topPosts.length === 0 ? (
          <EmptyState title="No top posts yet" body="A post shows here once someone has viewed it in the last 28 days.">
            <ComposeAction>Write a post</ComposeAction>
          </EmptyState>
        ) : (
          <ul className="flex flex-col">
            {stats.topPosts.map((post) => (
              <li key={post.id} className="border-t border-border first:border-t-0">
                <Link
                  href={`/${post.handle}/status/${post.id}`}
                  className="flex flex-col gap-2.5 px-4 py-3.5 transition-colors duration-200 hover:bg-muted/50 active:bg-muted"
                >
                  <p className="line-clamp-2 text-[15px] leading-snug break-words">{post.body || "Post without text"}</p>
                  <div className="flex items-center gap-3">
                    <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <div className="h-full rounded-full bg-dusk" style={{ width: `${Math.max(4, Math.round((post.views / topViews) * 100))}%` }} />
                    </div>
                    <span className="shrink-0 text-[13px] text-muted-foreground tabular-nums">
                      {exact(post.views)} {pluralize(post.views, "view")} · {exact(post.likes)} {pluralize(post.likes, "like")}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="px-4 py-8 text-sm leading-relaxed text-muted-foreground">
        A view counts once per person for each post, when the post scrolls into view. A profile visit counts each person once every six hours. A new follower
        counts the day they followed. Your own views and visits are never counted. Days run from midnight to midnight UTC.
      </p>
    </>
  )
}
