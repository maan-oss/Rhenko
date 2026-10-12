import type { Metadata } from "next"
import { Suspense } from "react"
import { connection } from "next/server"
import { Skeleton } from "@/components/ui/skeleton"
import { all, get, type Param } from "@/lib/db"
import { B, LegalPage, List, P, type LegalSection } from "@/app/_legal/shell"
import { NOTICE_KINDS } from "@/lib/legal"

export const metadata: Metadata = {
  title: { absolute: "Transparency · Rhenko" },
  description: "How many reports, notices, hidden posts and appeals this server has handled.",
}

// The figures come from this server's own records, read when the page is opened. They are not an audited report.

function count(sql: string, ...params: Param[]): number {
  return get<{ n: number }>(sql, ...params)?.n ?? 0
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2 text-[15px] last:border-b-0">
      <span>{label}</span>
      <span className="font-semibold tabular-nums">{value.toLocaleString("en")}</span>
    </div>
  )
}

async function Reports() {
  await connection()
  const total = count("SELECT COUNT(*) AS n FROM reports")
  const open = count("SELECT COUNT(*) AS n FROM reports WHERE resolved_at IS NULL")
  const hidden = count("SELECT COUNT(*) AS n FROM reports WHERE outcome = 'hidden'")
  const noAction = count("SELECT COUNT(*) AS n FROM reports WHERE outcome = 'no_action'")
  return (
    <div className="flex flex-col">
      <Figure label="Reports received" value={total} />
      <Figure label="Still waiting for a decision" value={open} />
      <Figure label="Reviewed, and the post hidden" value={hidden} />
      <Figure label="Reviewed, with no action" value={noAction} />
    </div>
  )
}

async function Notices() {
  await connection()
  const byKind = all<{ kind: string; n: number }>(
    "SELECT kind, COUNT(*) AS n FROM legal_notices WHERE kind <> 'authority_request' GROUP BY kind"
  )
  const received = byKind.reduce((sum, row) => sum + row.n, 0)
  const actioned = count("SELECT COUNT(*) AS n FROM legal_notices WHERE status = 'actioned'")
  const rejected = count("SELECT COUNT(*) AS n FROM legal_notices WHERE status = 'rejected'")
  const open = count("SELECT COUNT(*) AS n FROM legal_notices WHERE status = 'open' AND kind <> 'authority_request'")
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col">
        <Figure label="Notices received through the notice form" value={received} />
        <Figure label="Still open" value={open} />
        <Figure label="Actioned" value={actioned} />
        <Figure label="Rejected" value={rejected} />
      </div>
      <div className="flex flex-col">
        <p className="pb-2 text-sm text-muted-foreground">Received, by what the notice is about</p>
        {NOTICE_KINDS.map((kind) => (
          <Figure key={kind.id} label={kind.label} value={byKind.find((row) => row.kind === kind.id)?.n ?? 0} />
        ))}
      </div>
    </div>
  )
}

async function Hiding() {
  await connection()
  const hidden = count("SELECT COUNT(*) AS n FROM moderation_notices")
  const restored = count("SELECT COUNT(*) AS n FROM moderation_notices WHERE restored_at IS NOT NULL")
  const deleted = count(
    `SELECT COUNT(*) AS n FROM moderation_notices n
     WHERE n.restored_at IS NULL AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = n.post_id)`
  )
  const appeals = count("SELECT COUNT(*) AS n FROM appeals")
  const reversed = count("SELECT COUNT(*) AS n FROM appeals WHERE decision = 'reversed'")
  const upheld = count("SELECT COUNT(*) AS n FROM appeals WHERE decision = 'upheld'")
  const waiting = count("SELECT COUNT(*) AS n FROM appeals WHERE decided_at IS NULL")
  return (
    <div className="flex flex-col">
      <Figure label="Posts hidden, with a notice sent to the author" value={hidden} />
      <Figure label="Put back" value={restored} />
      <Figure label="Deleted from the server, and not put back" value={deleted} />
      <Figure label="Appeals made" value={appeals} />
      <Figure label="Appeals reversed" value={reversed} />
      <Figure label="Appeals not upheld, with the post deleted" value={upheld} />
      <Figure label="Appeals waiting for a decision" value={waiting} />
    </div>
  )
}

async function Requests() {
  await connection()
  const recorded = count("SELECT COUNT(*) AS n FROM legal_notices WHERE kind = 'authority_request'")
  return (
    <div className="flex flex-col">
      <Figure label="Orders and requests from courts or authorities" value={recorded} />
    </div>
  )
}

async function Advertising() {
  await connection()
  const campaigns = count("SELECT COUNT(*) AS n FROM ad_campaigns")
  const waiting = count("SELECT COUNT(*) AS n FROM ad_campaigns WHERE status = 'in_review'")
  const approved = count("SELECT COUNT(*) AS n FROM ad_campaigns WHERE reviewed_at IS NOT NULL AND status <> 'rejected'")
  const rejected = count("SELECT COUNT(*) AS n FROM ad_campaigns WHERE status = 'rejected'")
  const reports = count("SELECT COUNT(*) AS n FROM ad_reports")
  return (
    <div className="flex flex-col">
      <Figure label="Campaigns sent for review" value={campaigns} />
      <Figure label="Waiting for review" value={waiting} />
      <Figure label="Approved to run" value={approved} />
      <Figure label="Rejected" value={rejected} />
      <Figure label="Reports about ads" value={reports} />
    </div>
  )
}

function Waiting() {
  return <Skeleton className="h-40 w-full" />
}

const SECTIONS: LegalSection[] = [
  {
    id: "reports",
    title: "Reports",
    body: (
      <>
        <P>Reports sent by members, from the Report post option.</P>
        <Suspense fallback={<Waiting />}>
          <Reports />
        </Suspense>
      </>
    ),
  },
  {
    id: "notices",
    title: "Notices",
    body: (
      <>
        <P>Notices about content sent through the notice form.</P>
        <Suspense fallback={<Waiting />}>
          <Notices />
        </Suspense>
      </>
    ),
  },
  {
    id: "hiding",
    title: "Hidden posts and appeals",
    body: (
      <>
        <P>Posts hidden under the Community Rules or for a notice, and the appeals about them.</P>
        <Suspense fallback={<Waiting />}>
          <Hiding />
        </Suspense>
      </>
    ),
  },
  {
    id: "requests",
    title: "Requests from authorities",
    body: (
      <>
        <P>
          Orders and requests from courts and authorities that the operator has recorded. The content of a request is not
          published, where the law forbids it.
        </P>
        <Suspense fallback={<Waiting />}>
          <Requests />
        </Suspense>
      </>
    ),
  },
  {
    id: "advertising",
    title: "Advertising",
    body: (
      <>
        <P>Campaigns sent by advertisers, and the reports people have made about ads. The ad library lists every campaign that has run.</P>
        <Suspense fallback={<Waiting />}>
          <Advertising />
        </Suspense>
      </>
    ),
  },
  {
    id: "feeds",
    title: "How the feeds are ordered",
    body: (
      <List>
        <li>
          <B>For you</B> ranks the posts and reposts you are allowed to see by how likely you are to like, repost, bookmark or read
          them. Who you follow and what they like, your hashtags, how recent and how engaged a post is, and what you have already
          seen or read all count. Posts you mark Not interested leave your feed.
        </li>
        <li>
          The weights behind For you are learned from what people did after they were shown posts, refreshed about once an hour, and
          used only when they predict better than the defaults. The same weights apply to every account.
        </li>
        <li>
          <B>Following</B> shows posts and reposts from the people and topics you follow, newest first.
        </li>
        <li>
          <B>Explore</B> is sorted by top or by latest. Top adds up likes, reposts (counted twice) and replies.
        </li>
        <li>No feed is ranked by who has paid.</li>
        <li>
          Ads are placed after every eight posts in the home feeds. Each one is labelled Ad. They are not shown to people under 18 or to
          people who pay for Rhenko Plus.
        </li>
      </List>
    ),
  },
  {
    id: "paid",
    title: "What paid features change",
    body: (
      <List>
        <li>
          <B>Rhenko Plus</B> removes ads from the home feeds, and gives 24 hours to edit a post instead of one hour.
        </li>
        <li>
          <B>The paid subscriber ring</B> shows beside a name that the person pays. It changes nothing else.
        </li>
        <li>
          <B>Tips</B> are paid from one person to another. They do not change who sees a post.
        </li>
        <li>No paid feature changes how a post is ranked, how far it reaches, or who can see it.</li>
      </List>
    ),
  },
  {
    id: "notes",
    title: "How these figures are made",
    body: (
      <List>
        <li>They count records on this server since it was set up, and are read again each time this page is opened.</li>
        <li>They are not an audited report, and they do not include what happens outside this server.</li>
      </List>
    ),
  },
]

export default function TransparencyPage() {
  return (
    <Suspense fallback={null}>
      <TransparencyBody />
    </Suspense>
  )
}

// The date shown is the date the figures were read, so it is worked out on each request.
async function TransparencyBody() {
  await connection()
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
  return (
    <LegalPage
      title="Transparency"
      updated={today}
      intro="How many reports, notices, hidden posts and appeals this server has handled, and what came of them."
      sections={SECTIONS}
      other={{ href: "/legal", label: "All legal documents" }}
    />
  )
}
