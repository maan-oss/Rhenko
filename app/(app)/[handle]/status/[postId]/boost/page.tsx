import type { ReactNode } from "react"
import { notFound, redirect } from "next/navigation"
import { requireAgreedViewer } from "@/lib/auth"
import { get } from "@/lib/db"
import { BOOST_BUDGETS, MICRO_PER_CENT, boostCopy, boostViews, hostOf, type AdView } from "@/lib/ad-rules"
import { CURRENCY } from "@/lib/payments"
import { BoostView } from "@/components/app/boost-view"
import { PageHeader } from "@/components/app/page-header"
import Link from "@/components/app/link"

type Params = Promise<{ handle: string; postId: string }>

// Boosting a post, the way X does it: the post as it will look, what each budget buys, and the send. A post that is already
// boosted goes to its boost page instead. Only the author can boost, and only a live top-level text post.
export default async function BoostPostPage({ params }: { params: Params }) {
  const viewer = await requireAgreedViewer()
  const { handle, postId } = await params
  const post = await get<{ body: string; handle: string; has_extra: number }>(
    `SELECT p.body, u.handle,
       CASE WHEN p.media_file IS NOT NULL OR EXISTS (SELECT 1 FROM post_media m WHERE m.post_id = p.id)
         OR EXISTS (SELECT 1 FROM polls pl WHERE pl.post_id = p.id) THEN 1 ELSE 0 END AS has_extra
     FROM posts p JOIN users u ON u.id = p.author_id
     WHERE p.id = ? AND p.author_id = ? AND p.reply_to_id IS NULL AND p.is_draft = 0 AND p.publish_at IS NULL AND p.removed_at IS NULL`,
    postId,
    viewer.id
  )
  if (!post) notFound()
  if (post.handle.toLowerCase() !== handle.toLowerCase()) redirect(`/${post.handle}/status/${postId}/boost`)

  const live = await get<{ id: string }>(
    "SELECT id FROM ad_campaigns WHERE post_id = ? AND status IN ('in_review', 'active', 'paused') ORDER BY created_at DESC LIMIT 1",
    postId
  )
  if (live) redirect(`/advertise/campaigns/${live.id}`)

  const statusHref = `/${post.handle}/status/${postId}`
  const account = await get<{ business_name: string; balance_micro: number; status: string }>(
    "SELECT business_name, balance_micro, status FROM ad_accounts WHERE user_id = ?",
    viewer.id
  )

  let body: ReactNode
  if (!account) {
    body = (
      <section className="flex flex-col gap-3 px-4 py-4">
        <p className="text-[15px]">A boost is an ad, so it needs an advertising account first.</p>
        <Link href="/advertise" className="w-fit font-semibold underline underline-offset-4">
          Set up advertising
        </Link>
      </section>
    )
  } else if (account.status !== "active") {
    body = <p className="px-4 py-4 text-[15px]">Your advertising account is not active, so you cannot boost a post right now.</p>
  } else if (post.has_extra === 1) {
    body = <p className="px-4 py-4 text-[15px]">Only text posts can be boosted for now.</p>
  } else {
    const publicUrl = (process.env.RHENKO_PUBLIC_URL ?? "").replace(/\/+$/, "")
    const made = publicUrl ? boostCopy({ text: post.body, handle: post.handle, postId }, publicUrl) : { problem: "Boosts are not set up on this server yet." }
    if ("problem" in made) {
      body = <p className="px-4 py-4 text-[15px]">{made.problem}</p>
    } else {
      const ad: AdView = {
        id: "",
        headline: made.copy.headline,
        body: made.copy.body,
        cta: made.copy.cta,
        href: made.copy.link,
        advertiser: account.business_name,
        host: hostOf(made.copy.link),
        boost: true,
        byline: `@${post.handle}`,
      }
      const options = BOOST_BUDGETS.map((amount) => ({ amount, views: boostViews(amount) }))
      body = (
        <BoostView
          postId={postId}
          ad={ad}
          options={options}
          currency={CURRENCY}
          balance={Math.floor(account.balance_micro / MICRO_PER_CENT)}
        />
      )
    }
  }

  return (
    <>
      <PageHeader title="Boost post" backHref={statusHref} />
      {body}
    </>
  )
}
