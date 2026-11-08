import { notFound } from "next/navigation"
import Link from "@/components/app/link"
import { requireAgreedViewer } from "@/lib/auth"
import { get } from "@/lib/db"
import { CAMPAIGN_STATUS_LABEL, MICRO_PER_CENT, hostOf, type AdView } from "@/lib/ad-rules"
import { CURRENCY } from "@/lib/payments"
import { formatMoney } from "@/lib/money"
import { AdCard } from "@/components/app/ad-card"
import { CampaignControls } from "@/components/app/campaign-controls"
import { PageHeader } from "@/components/app/page-header"

type Params = Promise<{ id: string }>
type Status = "in_review" | "rejected" | "active" | "paused" | "ended"

// One boost or campaign: how it is doing, what it has spent, the ad as it runs, and the controls. Only its owner sees it.
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
  const budget = Math.floor(row.budget_micro / MICRO_PER_CENT)
  const spent = Math.floor(row.spent_micro / MICRO_PER_CENT)
  const left = Math.max(0, budget - spent)
  const clickRate = row.impressions === 0 ? "0%" : `${((row.clicks / row.impressions) * 100).toFixed(1)}%`
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

  const stats: { label: string; value: string }[] = [
    { label: "Views", value: row.impressions.toLocaleString("en-US") },
    { label: "Clicks", value: row.clicks.toLocaleString("en-US") },
    { label: "Click rate", value: clickRate },
    { label: "Spent", value: formatMoney(spent, CURRENCY) },
    { label: "Left of budget", value: formatMoney(left, CURRENCY) },
  ]

  return (
    <>
      <PageHeader title={isBoost ? "Boost" : "Campaign"} backHref="/advertise" />

      <section aria-labelledby="campaign-status" className="flex flex-col gap-3 px-4 pt-4">
        <h2 id="campaign-status" className="sr-only">
          Status
        </h2>
        <p className="text-[15px] font-semibold">{statusText}</p>
        {row.status === "in_review" ? <p className="text-[15px] text-muted-foreground">A person checks it before it runs.</p> : null}
        {row.status === "rejected" && row.review_note ? <p className="text-[15px]">Reason: {row.review_note}</p> : null}
        {isBoost && row.handle ? (
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-[15px]">
            <Link href={`/${row.handle}/status/${row.post_id}`} className="font-semibold underline underline-offset-4">
              Open the post
            </Link>
            <Link href={`/${row.handle}/status/${row.post_id}/analytics`} className="font-semibold underline underline-offset-4">
              Post analytics
            </Link>
          </p>
        ) : null}
      </section>

      <section aria-labelledby="campaign-stats" className="mt-4 flex flex-col border-t border-border px-4 pt-4">
        <h2 id="campaign-stats" className="sr-only">
          Numbers
        </h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col gap-1">
              <dt className="text-[13px] text-muted-foreground">{stat.label}</dt>
              <dd className="text-[22px] font-semibold tabular-nums">{stat.value}</dd>
            </div>
          ))}
        </dl>
        <p className="pt-4 text-[13px] text-muted-foreground">
          A view is one person seeing the ad on one day. Clicks are counted but not who made them.
        </p>
      </section>

      <CampaignControls campaignId={row.id} status={row.status} isBoost={isBoost} />

      <section aria-labelledby="campaign-ad" className="mt-2 flex flex-col border-t border-border pt-4">
        <h2 id="campaign-ad" className="px-4 pb-1 text-lg font-semibold">
          How it looks
        </h2>
        <AdCard ad={ad} preview />
      </section>
    </>
  )
}
