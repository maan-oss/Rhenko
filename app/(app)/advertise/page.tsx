import { Suspense } from "react"
import { requireViewer } from "@/lib/auth"
import { all, get } from "@/lib/db"
import { MICRO_PER_CENT } from "@/lib/ad-rules"
import { paymentsConfigured, CURRENCY } from "@/lib/payments"
import { ageFrom } from "@/lib/rules"
import { MINIMUM_AGE } from "@/lib/legal"
import { AdvertisePanel, type AdvertiseData, type CampaignRow } from "@/components/app/advertise-panel"
import { PageHeader } from "@/components/app/page-header"

type SearchParams = Promise<{ credit?: string | string[] }>

export default function AdvertisePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageHeader title="Advertising" backHref="/settings" />
      <Suspense fallback={null}>
        <AdvertiseBody searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function AdvertiseBody({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireViewer()
  const params = await searchParams
  const birthday = (await get<{ birthday: string | null }>("SELECT birthday FROM users WHERE id = ?", viewer.id))?.birthday ?? null
  const age = birthday ? ageFrom(birthday) : null
  const account = await get<{ id: string; business_name: string; country: string; contact_email: string; balance_micro: number }>(
    "SELECT id, business_name, country, contact_email, balance_micro FROM ad_accounts WHERE user_id = ?",
    viewer.id
  )
  const campaigns = account
    ? await all<{
        id: string
        headline: string
        status: CampaignRow["status"]
        review_note: string | null
        budget_micro: number
        spent_micro: number
        impressions: number
        clicks: number
      }>(
        "SELECT id, headline, status, review_note, budget_micro, spent_micro, impressions, clicks FROM ad_campaigns WHERE account_id = ? ORDER BY created_at DESC LIMIT 100",
        account.id
      )
    : []
  const data: AdvertiseData = {
    adult: age !== null && age >= MINIMUM_AGE,
    currency: CURRENCY,
    paymentsReady: paymentsConfigured(),
    creditAdded: params.credit === "added",
    account: account
      ? {
          businessName: account.business_name,
          country: account.country,
          contactEmail: account.contact_email,
          balance: Math.floor(account.balance_micro / MICRO_PER_CENT),
        }
      : null,
    campaigns: campaigns.map((campaign) => ({
      id: campaign.id,
      headline: campaign.headline,
      status: campaign.status,
      review_note: campaign.review_note,
      budget: Math.floor(campaign.budget_micro / MICRO_PER_CENT),
      spent: Math.floor(campaign.spent_micro / MICRO_PER_CENT),
      impressions: campaign.impressions,
      clicks: campaign.clicks,
    })),
  }
  return <AdvertisePanel data={data} />
}
