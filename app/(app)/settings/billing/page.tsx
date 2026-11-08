import { requireViewer } from "@/lib/auth"
import { billingState, priceIdFor, priceLabel } from "@/lib/payments"
import { BillingPanel } from "@/components/app/billing-panel"
import { PageHeader } from "@/components/app/page-header"
import { RevealSuspense } from "@/components/app/reveal-suspense"

type SearchParams = Promise<{ payouts?: string | string[] }>

const NOTICES: Record<string, string> = {
  "payouts:return": "Thanks, your payout details are saved. Stripe is checking them, and tips can reach you once it's done.",
  "payouts:refresh": "That Stripe link has expired. Tap Set up payouts to get a fresh one.",
}

export default function BillingPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageHeader title="Subscriptions and tips" backHref="/settings" />
      <RevealSuspense>
        <BillingBody searchParams={searchParams} />
      </RevealSuspense>
    </>
  )
}

async function BillingBody({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireViewer()
  const params = await searchParams
  const state = await billingState(viewer)
  const plusId = priceIdFor("plus")
  const plusPrice = plusId ? await priceLabel(plusId) : null
  const payouts = typeof params.payouts === "string" ? params.payouts : ""
  const notice = NOTICES[`payouts:${payouts}`] ?? null
  return <BillingPanel state={state} plusPrice={plusPrice} notice={notice} />
}
