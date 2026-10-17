import { Suspense } from "react"
import { connection } from "next/server"
import { requireViewer } from "@/lib/auth"
import { all } from "@/lib/db"
import { categoryLabel } from "@/lib/legal"
import { PageHeader } from "@/components/app/page-header"
import { AppealForm } from "@/components/app/appeal-form"

export default function NoticesPage() {
  return (
    <Suspense fallback={null}>
      <NoticesBody />
    </Suspense>
  )
}

type NoticeRow = {
  id: string
  category: string
  explanation: string
  excerpt: string
  created_at: number
  appeal_until: number
  restored_at: number | null
  post_exists: number
  appeal_id: string | null
  appeal_decided_at: number | null
  appeal_note: string
}

type ReportRow = {
  id: string
  reason: string
  created_at: number
  resolved_at: number | null
  outcome: string | null
}

// The time the page is read. Read after connection(), so the page is never built with a fixed clock.
async function clock(): Promise<number> {
  await connection()
  return Date.now()
}

function when(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
}

// What has happened to a hidden post, and whether its author can still appeal. The text says what happens next.
function statusOf(notice: NoticeRow, now: number): { text: string; appealable: boolean } {
  if (notice.restored_at !== null) return { text: `Put back on ${when(notice.restored_at)}. The post is as it was.`, appealable: false }
  if (notice.post_exists === 0) return { text: "Deleted. The post and its files are gone.", appealable: false }
  if (notice.appeal_id !== null) {
    if (notice.appeal_decided_at === null) return { text: "Your appeal is waiting for a decision.", appealable: false }
    const reason = notice.appeal_note ? ` ${notice.appeal_note}` : ""
    return { text: `Your appeal was not successful.${reason} The post will be deleted.`, appealable: false }
  }
  if (now <= notice.appeal_until) {
    return { text: `Hidden. You can appeal until ${when(notice.appeal_until)}.`, appealable: true }
  }
  return { text: "Hidden. The time to appeal has passed, and the post will be deleted.", appealable: false }
}

function reportStatus(report: ReportRow): string {
  if (report.resolved_at === null) return "Waiting for a decision."
  if (report.outcome === "hidden") return "Reviewed. The post was hidden."
  if (report.outcome === "no_action") return "Reviewed. No action was taken."
  return "Reviewed."
}

async function NoticesBody() {
  await connection()
  const viewer = await requireViewer()
  const now = await clock()
  const notices = await all<NoticeRow>(
    `SELECT n.id, n.category, n.explanation, n.excerpt, n.created_at, n.appeal_until, n.restored_at,
            (SELECT COUNT(*) FROM posts p WHERE p.id = n.post_id) AS post_exists,
            a.id AS appeal_id, a.decided_at AS appeal_decided_at, COALESCE(a.decision_note, '') AS appeal_note
     FROM moderation_notices n
     LEFT JOIN appeals a ON a.notice_id = n.id
     WHERE n.user_id = ?
     ORDER BY n.created_at DESC
     LIMIT 100`,
    viewer.id
  )
  const reports = await all<ReportRow>(
    `SELECT id, reason, created_at, resolved_at, outcome FROM reports
     WHERE reporter_id = ? ORDER BY created_at DESC LIMIT 100`,
    viewer.id
  )

  return (
    <>
      <PageHeader title="Notices" backHref="/settings" />
      <section className="flex flex-col gap-4 border-b border-border px-4 py-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">About your posts</h2>
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            When a post breaks the rules, it is hidden and you are told why. You can appeal within 30 days. A person decides each
            appeal.
          </p>
        </div>
        {notices.length === 0 ? (
          <p className="text-[15px] text-muted-foreground">None of your posts has been hidden.</p>
        ) : null}
        {notices.map((notice) => {
          const status = statusOf(notice, now)
          return (
            <article key={notice.id} className="flex flex-col gap-3 rounded-2xl border border-border p-5">
              <header className="flex flex-col gap-1">
                <h3 className="text-[15px] font-semibold">{categoryLabel(notice.category)}</h3>
                <p className="text-sm text-muted-foreground">Sent {when(notice.created_at)}</p>
              </header>
              <p className="text-[15px] leading-relaxed">{notice.explanation}</p>
              {notice.excerpt ? (
                <blockquote className="border-l-2 border-border pl-3 text-[14px] leading-relaxed text-muted-foreground">
                  {notice.excerpt}
                </blockquote>
              ) : null}
              <p className="text-[15px] font-semibold">{status.text}</p>
              {status.appealable ? <AppealForm noticeId={notice.id} /> : null}
            </article>
          )
        })}
      </section>
      <section className="flex flex-col gap-4 px-4 py-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Your reports</h2>
          <p className="text-[15px] leading-relaxed text-muted-foreground">Reports you have sent, and what came of each.</p>
        </div>
        {reports.length === 0 ? <p className="text-[15px] text-muted-foreground">You have not reported anything.</p> : null}
        {reports.map((report) => (
          <article key={report.id} className="flex flex-col gap-1 rounded-2xl border border-border p-5">
            <h3 className="text-[15px] font-semibold">{report.reason}</h3>
            <p className="text-sm text-muted-foreground">Sent {when(report.created_at)}</p>
            <p className="text-[15px]">{reportStatus(report)}</p>
          </article>
        ))}
      </section>
    </>
  )
}
