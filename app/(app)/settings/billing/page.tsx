import { requireViewer } from "@/lib/auth"
import { billingState, priceIdFor, priceLabel } from "@/lib/payments"
import { BillingPanel } from "@/components/app/billing-panel"
import { PageHeader } from "@/components/app/page-header"
import { RevealSuspense } from "@/components/app/reveal-suspense"

type SearchParams = Promise<{ checkout?: string | string[]; payouts?: string | string[] }>

const NOTICES: Record<string, string> = {
  "checkout:done": "Thanks. Your subscription shows here once Stripe confirms the payment, usually within a minute.",
  "checkout:cancelled": "Checkout was cancelled. Nothing was charged.",
  "payouts:return": "Payout details saved. Stripe checks them before tips can be paid to you.",
  "payouts:refresh": "That Stripe link has expired. Start the payout setup again.",
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
  const verifiedId = priceIdFor("verified")
  const [plusPrice, verifiedPrice] = await Promise.all([plusId ? await priceLabel(plusId) : null, verifiedId ? await priceLabel(verifiedId) : null])
  const checkout = typeof params.checkout === "string" ? params.checkout : ""
  const payouts = typeof params.payouts === "string" ? params.payouts : ""
  const notice = NOTICES[`checkout:${checkout}`] ?? NOTICES[`payouts:${payouts}`] ?? null
  return <BillingPanel state={state} plusPrice={plusPrice} verifiedPrice={verifiedPrice} notice={notice} />
}
