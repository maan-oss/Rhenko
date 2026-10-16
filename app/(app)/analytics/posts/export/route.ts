import { getViewer } from "@/lib/auth"
import { ownPostRows } from "@/lib/data"

// Every post the signed-in owner has written, one row each, newest first. The numbers are the ones the posts page shows.
// Only the signed-in owner can download their own numbers.
export async function GET() {
  const viewer = await getViewer()
  if (!viewer) return new Response("Log in to download your analytics.", { status: 401, headers: { "cache-control": "no-store" } })

  const now = Date.now()
  const rows = [
    "post_id,posted_at,text,views,likes,reposts,quotes,replies,bookmarks,engagement_rate",
    ...ownPostRows(viewer.id).map((post) =>
      [
        post.id,
        new Date(post.createdAt).toISOString(),
        quote(post.body),
        post.views,
        post.likes,
        post.reposts,
        post.quotes,
        post.replies,
        post.bookmarks,
        post.engagementRate ?? "",
      ].join(",")
    ),
  ]
  const filename = `rhenko-posts-${viewer.handle}-${new Date(now).toISOString().slice(0, 10)}.csv`

  return new Response(`${rows.join("\n")}\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  })
}

// Quoted for CSV. Text a spreadsheet could read as a formula gets a leading apostrophe, so opening the file never runs it.
function quote(text: string): string {
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}
