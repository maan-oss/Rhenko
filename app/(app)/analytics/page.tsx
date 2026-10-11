import Link from "next/link"
import { requireViewer } from "@/lib/auth"
import { analyticsFor } from "@/lib/data"
import { pluralize } from "@/lib/format"
import { DailyChart, StatGrid, exact } from "@/components/app/analytics-bits"
import { ComposeAction } from "@/components/app/compose-action"
import { EmptyState } from "@/components/app/empty-state"
import { PageHeader } from "@/components/app/page-header"

// Only the account's owner sees this page. It reads the account's own posts and profile, and every number on it is
// the one the data layer counted: nothing is rounded, abbreviated or worked out again here.
export default async function AnalyticsPage() {
  const viewer = await requireViewer()
  const stats = analyticsFor(viewer.id, viewer.handle)
  const quiet = stats.days.every((day) => day.views === 0 && day.visits === 0)

  return (
    <>
      <PageHeader title="Analytics" backHref="/" />

      <StatGrid
        columns={4}
        items={[
          { label: "Post views", note: "Last 28 days", value: exact(stats.views28) },
          { label: "Profile visits", note: "Last 28 days", value: exact(stats.visits28) },
          { label: "Followers", note: "All time", value: exact(stats.followers) },
          { label: "New followers", note: "Last 28 days", value: exact(stats.newFollowers28) },
        ]}
      />

      <DailyChart
        id="daily"
        title="Last 14 days"
        caption="Post views and profile visits for each of the last 14 days"
        series={[
          { label: "Post views", unit: "view", bar: "bg-dusk" },
          { label: "Profile visits", unit: "visit", bar: "bg-muted-foreground/50" },
        ]}
        days={stats.days.map((day) => ({ label: day.label, values: [day.views, day.visits] }))}
        note={
          quiet ? (
            <p className="text-sm text-muted-foreground">No views or visits in the last 14 days yet. They appear as people open your posts and your profile.</p>
          ) : null
        }
      />

      <section aria-labelledby="top" className="flex flex-col">
        <div className="px-4 pt-5 pb-2">
          <h2 id="top" className="text-base font-semibold">
            Top posts
          </h2>
          <p className="text-[13px] text-muted-foreground">The posts people viewed most in the last 28 days. Likes are all time.</p>
        </div>
        {stats.topPosts.length === 0 ? (
          <EmptyState title="No top posts yet" body="A post shows here once someone has viewed it in the last 28 days.">
            <ComposeAction>Write a post</ComposeAction>
          </EmptyState>
        ) : (
          <ul className="flex flex-col">
            {stats.topPosts.map((post) => (
              <li key={post.id} className="border-t border-border">
                <Link href={`/${post.handle}/status/${post.id}`} className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-muted/50">
                  <p className="line-clamp-2 text-[15px] break-words">{post.body || "Post without text"}</p>
                  <span className="text-[13px] text-muted-foreground tabular-nums">
                    {exact(post.views)} {pluralize(post.views, "view")} · {exact(post.likes)} {pluralize(post.likes, "like")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="px-4 py-6 text-sm text-muted-foreground">
        A view counts once per person for each post, when the post scrolls into view. A profile visit counts each person once every six hours. Your own views and
        visits are never counted. Days run from midnight to midnight UTC.
      </p>
    </>
  )
}
