import { requireViewer } from "@/lib/auth"
import { billingState, completeCheckout, priceIdFor, priceLabel } from "@/lib/payments"
import { PageHeader } from "@/components/app/page-header"
import { PlusScreen } from "@/components/app/plus-screen"
import { RevealSuspense } from "@/components/app/reveal-suspense"

type SearchParams = Promise<{ checkout?: string | string[]; session_id?: string | string[] }>

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
  const checkout = first(params.checkout)
  const sessionId = first(params.session_id)
  // Stripe sends the person back with the id of the checkout they paid. Reading it now turns Plus on at once.
  if (checkout === "done" && sessionId) await completeCheckout(viewer, sessionId)
  const plusId = priceIdFor("plus")
  const [state, price] = await Promise.all([billingState(viewer), plusId ? priceLabel(plusId) : null])
  return <PlusScreen viewer={viewer} state={state} price={price} checkout={checkout} />
}

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ""
}
