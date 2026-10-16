import { getViewer } from "@/lib/auth"
import { analyticsFor } from "@/lib/data"

const DAY_MS = 24 * 60 * 60 * 1000

// The owner's last 28 days as a CSV file, one row per UTC day, oldest first. The numbers are the same ones the analytics page
// shows: nothing is rounded or worked out again here. Only the signed-in owner can download their own numbers.
export async function GET() {
  const viewer = await getViewer()
  if (!viewer) return new Response("Log in to download your analytics.", { status: 401, headers: { "cache-control": "no-store" } })

  const now = Date.now()
  const days = analyticsFor(viewer.id, viewer.handle, now).days.slice(-28)
  const today = Math.floor(now / DAY_MS)
  const rows = [
    "date,post_views,profile_visits,new_followers",
    ...days.map((day, index) => {
      const date = new Date((today - (days.length - 1 - index)) * DAY_MS).toISOString().slice(0, 10)
      return [date, day.views, day.visits, day.follows].join(",")
    }),
  ]
  const filename = `rhenko-analytics-${viewer.handle}-${new Date(now).toISOString().slice(0, 10)}.csv`

  return new Response(`${rows.join("\n")}\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  })
}
