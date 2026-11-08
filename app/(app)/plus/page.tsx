import { requireViewer } from "@/lib/auth"
import { billingState, priceIdFor, priceLabel } from "@/lib/payments"
import { PageHeader } from "@/components/app/page-header"
import { PlusScreen } from "@/components/app/plus-screen"
import { RevealSuspense } from "@/components/app/reveal-suspense"

type SearchParams = Promise<{ checkout?: string | string[] }>

// Rhenko Plus: what it changes, what it costs, and how to subscribe or change it. Stripe returns the person here.
export default function PlusPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageHeader title="Rhenko Plus" backHref="/settings" />
      <RevealSuspense>
        <PlusBody searchParams={searchParams} />
      </RevealSuspense>
    </>
  )
}

async function PlusBody({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireViewer()
  const params = await searchParams
  const state = await billingState(viewer)
  const plusId = priceIdFor("plus")
  const price = plusId ? await priceLabel(plusId) : null
  const checkout = typeof params.checkout === "string" ? params.checkout : ""
  return <PlusScreen viewer={viewer} state={state} price={price} checkout={checkout} />
}
