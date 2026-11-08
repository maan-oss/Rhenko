import { notFound } from "next/navigation"
import { requireAgreedViewer } from "@/lib/auth"
import { get } from "@/lib/db"
import { CAMPAIGN_STATUS_LABEL, MICRO_PER_CENT, hostOf, type AdView } from "@/lib/ad-rules"
import { CURRENCY } from "@/lib/payments"
import { CampaignView } from "@/components/app/campaign-view"
import { PageHeader } from "@/components/app/page-header"

type Params = Promise<{ id: string }>
type Status = "in_review" | "rejected" | "active" | "paused" | "ended"

// One boost or campaign: how it is doing, what it has spent, the controls, and the ad as it runs. Only its owner sees it.
export default async function CampaignPage({ params }: { params: Params }) {
  const viewer = await requireAgreedViewer()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const row = await get<{
    id: string
    headline: string
    body: string
    cta: string
    link_url: string
    status: Status
    review_note: string | null
    budget_micro: number
    spent_micro: number
    impressions: number
    clicks: number
    post_id: string | null
    business_name: string
    handle: string | null
    post_gone: number
  }>(
    `SELECT c.id, c.headline, c.body, c.cta, c.link_url, c.status, c.review_note, c.budget_micro, c.spent_micro,
       c.impressions, c.clicks, c.post_id, a.business_name,
       (SELECT u.handle FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = c.post_id) AS handle,
       CASE WHEN c.post_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = c.post_id AND p.removed_at IS NULL) THEN 1 ELSE 0 END AS post_gone
     FROM ad_campaigns c JOIN ad_accounts a ON a.id = c.account_id
     WHERE c.id = ? AND a.user_id = ?`,
    id,
    viewer.id
  )
  if (!row) notFound()

  const isBoost = row.post_id !== null
  const stopped = row.post_gone === 1 && (row.status === "active" || row.status === "paused" || row.status === "in_review")
  const statusText = stopped ? "Stopped. The post is no longer on Rhenko." : CAMPAIGN_STATUS_LABEL[row.status]

  // The owner's preview: the same card people see, with no click counted and no report button.
  const ad: AdView = {
    id: row.id,
    headline: row.headline,
    body: row.body,
    cta: row.cta,
    href: row.link_url,
    advertiser: row.business_name,
    host: hostOf(row.link_url),
    boost: isBoost,
    byline: row.handle ? `@${row.handle}` : undefined,
  }

  return (
    <>
      <PageHeader title={isBoost ? "Boost" : "Campaign"} backHref="/advertise" />
      <CampaignView
        campaign={{
          id: row.id,
          isBoost,
          status: row.status,
          statusText,
          reviewNote: row.review_note,
          post: isBoost && row.handle ? { href: `/${row.handle}/status/${row.post_id}`, analyticsHref: `/${row.handle}/status/${row.post_id}/analytics` } : null,
          views: row.impressions,
          clicks: row.clicks,
          budget: Math.floor(row.budget_micro / MICRO_PER_CENT),
          spent: Math.floor(row.spent_micro / MICRO_PER_CENT),
          currency: CURRENCY,
          ad,
        }}
      />
    </>
  )
}
