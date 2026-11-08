import type { AdView } from "@/lib/ad-rules"
import { AdCard } from "@/components/app/ad-card"
import { BoostForm, type BoostOption } from "@/components/app/boost-form"

// A post's boost page: the post as it will look to people, then the budget and the send. Only the author sees it.
export function BoostView({
  postId,
  ad,
  options,
  currency,
  balance,
}: {
  postId: string
  ad: AdView
  options: BoostOption[]
  currency: string
  // The balance in minor units (cents).
  balance: number
}) {
  return (
    <>
      <section aria-labelledby="how-it-looks" className="flex flex-col">
        <h2 id="how-it-looks" className="px-4 pt-5 pb-1 text-base font-semibold">
          How it will look
        </h2>
        <AdCard ad={ad} preview />
      </section>
      <BoostForm postId={postId} options={options} currency={currency} balance={balance} />
    </>
  )
}
