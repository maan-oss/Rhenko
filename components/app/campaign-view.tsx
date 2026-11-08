import Link from "@/components/app/link"
import { AdCard } from "@/components/app/ad-card"
import { CampaignControls } from "@/components/app/campaign-controls"
import type { AdView } from "@/lib/ad-rules"
import { formatMoney } from "@/lib/money"

type Status = "in_review" | "rejected" | "active" | "paused" | "ended"

export type CampaignDetails = {
  id: string
  isBoost: boolean
  status: Status
  // The status in words, including when the post behind a boost has been removed.
  statusText: string
  reviewNote: string | null
  // For a boost: where the post and its analytics are. Null for a campaign that is not on a post.
  post: { href: string; analyticsHref: string } | null
  views: number
  clicks: number
  // Money in minor units (cents), as formatMoney takes it.
  budget: number
  spent: number
  currency: string
  // The ad as people see it, shown to the owner with no click counted.
  ad: AdView
}

// One boost or campaign for its owner: how it is doing, what it has spent, the controls, and the ad as it runs.
export function CampaignView({ campaign: c }: { campaign: CampaignDetails }) {
  const left = Math.max(0, c.budget - c.spent)
  const share = c.budget > 0 ? Math.min(100, (c.spent / c.budget) * 100) : 0
  const clickRate = c.views === 0 ? "0%" : `${((c.clicks / c.views) * 100).toFixed(1)}%`

  return (
    <>
      <section aria-labelledby="campaign-status" className="flex flex-col gap-5 px-4 pt-5">
        <h2 id="campaign-status" className="sr-only">
          Status
        </h2>
        <div className="flex flex-col gap-1">
          <p className="text-[15px] font-semibold">{c.statusText}</p>
          {c.status === "in_review" ? <p className="text-[15px] text-muted-foreground">A person checks it before it runs.</p> : null}
          {c.status === "rejected" && c.reviewNote ? <p className="text-[15px]">Reason: {c.reviewNote}</p> : null}
          {c.post ? (
            <p className="flex flex-wrap gap-x-5 gap-y-2 pt-1 text-[15px]">
              <Link href={c.post.href} className="font-semibold underline underline-offset-4">
                Open the post
              </Link>
              <Link href={c.post.analyticsHref} className="font-semibold underline underline-offset-4">
                Post analytics
              </Link>
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-[44px] leading-none font-semibold tracking-tight tabular-nums">{c.views.toLocaleString("en-US")}</p>
          <p className="text-sm text-muted-foreground">Views</p>
        </div>

        <div className="flex flex-col gap-2">
          <div
            role="progressbar"
            aria-label="Budget spent"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(share)}
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full rounded-full bg-foreground transition-[width] duration-500" style={{ width: `${share}%` }} />
          </div>
          <p className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[13px] text-muted-foreground tabular-nums">
            <span>{formatMoney(c.spent, c.currency)} spent</span>
            <span>
              {formatMoney(left, c.currency)} left of {formatMoney(c.budget, c.currency)}
            </span>
          </p>
        </div>
      </section>

      <section aria-labelledby="campaign-numbers" className="mt-6 flex flex-col border-t border-border px-4">
        <h2 id="campaign-numbers" className="sr-only">
          Numbers
        </h2>
        <ul className="flex flex-col">
          <li className="flex items-baseline justify-between gap-3 py-3.5 text-[15px]">
            <span>Clicks</span>
            <span className="font-semibold tabular-nums">{c.clicks.toLocaleString("en-US")}</span>
          </li>
          <li className="flex items-baseline justify-between gap-3 border-t border-border py-3.5 text-[15px]">
            <span>Click rate</span>
            <span className="font-semibold tabular-nums">{clickRate}</span>
          </li>
        </ul>
        <p className="pt-1 pb-4 text-[13px] text-muted-foreground">
          A view is one person seeing the ad on one day. Clicks are counted, but not who made them.
        </p>
      </section>

      <CampaignControls campaignId={c.id} status={c.status} isBoost={c.isBoost} />

      <section aria-labelledby="campaign-ad" className="flex flex-col border-t border-border">
        <h2 id="campaign-ad" className="px-4 pt-5 pb-1 text-base font-semibold">
          How people see it
        </h2>
        <AdCard ad={c.ad} preview />
      </section>
    </>
  )
}
