import Link from "next/link"
import { ArrowDown, ArrowUp } from "lucide-react"
import { requireViewer } from "@/lib/auth"
import { ownPostRows, type OwnPostRow } from "@/lib/data"
import { pluralize } from "@/lib/format"
import { exact } from "@/components/app/analytics-bits"
import { ComposeAction } from "@/components/app/compose-action"
import { EmptyState } from "@/components/app/empty-state"
import { PageHeader } from "@/components/app/page-header"
import { LocalTime } from "@/components/app/time-text"

// The table shows this many rows at most, in the chosen order. The CSV file always has every post.
const SHOWN = 200

// The count columns, after the post itself. The post column sorts by date.
const COUNTS = [
  { key: "views", label: "Views" },
  { key: "likes", label: "Likes" },
  { key: "reposts", label: "Reposts" },
  { key: "quotes", label: "Quotes" },
  { key: "replies", label: "Replies" },
  { key: "bookmarks", label: "Bookmarks" },
  { key: "engagement", label: "Engagement" },
] as const

type SortKey = "date" | (typeof COUNTS)[number]["key"]
const SORT_KEYS: SortKey[] = ["date", ...COUNTS.map((column) => column.key)]
type Direction = "asc" | "desc"

function valueOf(row: OwnPostRow, key: SortKey): number {
  if (key === "date") return row.createdAt
  if (key === "engagement") return row.engagementRate ?? -1
  return row[key]
}

// Ties fall back to newest first, so the order never shuffles between loads.
function sortRows(rows: OwnPostRow[], key: SortKey, direction: Direction): OwnPostRow[] {
  const sign = direction === "asc" ? 1 : -1
  return [...rows].sort((a, b) => sign * (valueOf(a, key) - valueOf(b, key)) || b.createdAt - a.createdAt)
}

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined
}

// A header is a link, so sorting works without any script. A column's first click sorts it highest first.
function header(key: SortKey, label: string, current: SortKey, direction: Direction, className: string) {
  const active = key === current
  const next: Direction = active && direction === "desc" ? "asc" : "desc"
  const Arrow = direction === "asc" ? ArrowUp : ArrowDown
  return (
    <th
      scope="col"
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : undefined}
      className={className}
    >
      <Link
        href={`/analytics/posts?sort=${key}&dir=${next}`}
        className={`inline-flex items-center gap-1 rounded-md outline-none transition-colors duration-200 hover:text-foreground focus-visible:ring-2 focus-visible:ring-dusk/50 ${active ? "text-foreground" : ""}`}
      >
        {label}
        {active ? <Arrow className="size-3" aria-hidden="true" /> : null}
      </Link>
    </th>
  )
}

// Sorting is in the links themselves, so the table orders without any script.
export default async function PostsAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const viewer = await requireViewer()
  const params = await searchParams
  const requested = single(params.sort)
  const key: SortKey = SORT_KEYS.find((candidate) => candidate === requested) ?? "date"
  const direction: Direction = single(params.dir) === "asc" ? "asc" : "desc"

  const rows = sortRows(ownPostRows(viewer.id), key, direction)
  const shown = rows.slice(0, SHOWN)

  return (
    <>
      <PageHeader title="All posts" backHref="/analytics" />

      <div className="flex flex-col gap-4 px-4 pt-4 pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground tabular-nums">
            {exact(rows.length)} {pluralize(rows.length, "post")}
          </p>
          <a
            href="/analytics/posts/export"
            download
            className="inline-flex h-10 items-center rounded-full border border-border px-4 text-sm font-semibold transition-[background-color,transform] duration-200 hover:bg-foreground/5 active:scale-[0.98]"
          >
            Download all posts as CSV
          </a>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No posts yet" body="Every post you publish shows here, with its views and actions.">
          <ComposeAction>Write a post</ComposeAction>
        </EmptyState>
      ) : (
        <div className="overflow-x-auto px-4">
          <table className="w-full min-w-[560px] border-collapse text-[13px] tabular-nums">
            <thead>
              <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
                {header("date", "Post", key, direction, "sticky left-0 z-[1] bg-background py-2.5 pr-3 text-left font-medium")}
                {COUNTS.map((column) => header(column.key, column.label, key, direction, "px-1 py-2.5 text-right font-medium whitespace-nowrap"))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.id} className="group border-b border-border">
                  <td className="sticky left-0 z-[1] min-w-[150px] max-w-[190px] bg-background py-3 pr-3 align-top transition-colors duration-200 group-hover:bg-muted">
                    <Link href={`/${viewer.handle}/status/${row.id}/analytics`} className="line-clamp-2 text-[14px] leading-snug break-words">
                      {row.body || "Photo or video post"}
                    </Link>
                    <LocalTime at={row.createdAt} variant="day" className="mt-1 block text-[12px] text-muted-foreground" />
                  </td>
                  <td className="px-1 py-3 text-right align-top font-semibold transition-colors duration-200 group-hover:bg-muted">{exact(row.views)}</td>
                  <td className="px-1 py-3 text-right align-top transition-colors duration-200 group-hover:bg-muted">{exact(row.likes)}</td>
                  <td className="px-1 py-3 text-right align-top transition-colors duration-200 group-hover:bg-muted">{exact(row.reposts)}</td>
                  <td className="px-1 py-3 text-right align-top transition-colors duration-200 group-hover:bg-muted">{exact(row.quotes)}</td>
                  <td className="px-1 py-3 text-right align-top transition-colors duration-200 group-hover:bg-muted">{exact(row.replies)}</td>
                  <td className="px-1 py-3 text-right align-top transition-colors duration-200 group-hover:bg-muted">{exact(row.bookmarks)}</td>
                  <td className="px-1 py-3 text-right align-top transition-colors duration-200 group-hover:bg-muted">
                    {row.engagementRate === null ? "–" : `${exact(row.engagementRate)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > SHOWN ? (
        <p className="px-4 pt-4 text-sm text-muted-foreground">
          Showing the first {exact(SHOWN)} of {exact(rows.length)} posts in this order. The CSV file has every post.
        </p>
      ) : null}

      <p className="px-4 py-8 text-sm leading-relaxed text-muted-foreground">
        Views and actions are counted for all time, the same way as on each post&apos;s page. Engagement is the likes, reposts, quotes, replies and
        bookmarks, divided by views. A post with no views has no engagement rate.
      </p>
    </>
  )
}
