// What a boost shows its owner: the post as its ad will look, what each budget buys, and the balance. The boost sheet, which
// opens over the post, and the boost page, which a link can open directly, both read it from here, so they never disagree.
import { get } from "@/lib/db"
import { BOOST_BUDGETS, MICRO_PER_CENT, boostCopy, boostViews, hostOf, type AdView } from "@/lib/ad-rules"
import { CURRENCY } from "@/lib/payments"

export type BoostOption = { amount: number; views: number }

export type BoostSetup =
  | { kind: "missing" }
  | { kind: "boosted"; campaignId: string }
  | { kind: "blocked"; handle: string; message: string; needsAccount: boolean }
  | {
      kind: "ready"
      handle: string
      postId: string
      ad: AdView
      options: BoostOption[]
      currency: string
      // In minor units (cents).
      balance: number
    }

// Only the author of a live, top-level text post can boost it. Anyone else gets "missing", as if the post were not there.
export async function boostSetupFor(viewerId: string, postId: string): Promise<BoostSetup> {
  const post = await get<{ body: string; handle: string; has_extra: number }>(
    `SELECT p.body, u.handle,
       CASE WHEN p.media_file IS NOT NULL OR EXISTS (SELECT 1 FROM post_media m WHERE m.post_id = p.id)
         OR EXISTS (SELECT 1 FROM polls pl WHERE pl.post_id = p.id) THEN 1 ELSE 0 END AS has_extra
     FROM posts p JOIN users u ON u.id = p.author_id
     WHERE p.id = ? AND p.author_id = ? AND p.reply_to_id IS NULL AND p.is_draft = 0 AND p.publish_at IS NULL AND p.removed_at IS NULL`,
    postId,
    viewerId
  )
  if (!post) return { kind: "missing" }

  const live = await get<{ id: string }>(
    "SELECT id FROM ad_campaigns WHERE post_id = ? AND status IN ('in_review', 'active', 'paused') ORDER BY created_at DESC LIMIT 1",
    postId
  )
  if (live) return { kind: "boosted", campaignId: live.id }

  const blocked = (message: string, needsAccount = false): BoostSetup => ({ kind: "blocked", handle: post.handle, message, needsAccount })
  const account = await get<{ business_name: string; balance_micro: number; status: string }>(
    "SELECT business_name, balance_micro, status FROM ad_accounts WHERE user_id = ?",
    viewerId
  )
  if (!account) return blocked("A boost is an ad, so it needs an advertising account first.", true)
  if (account.status !== "active") return blocked("Your advertising account is not active, so you cannot boost a post right now.")
  if (post.has_extra === 1) return blocked("Only text posts can be boosted for now.")

  const publicUrl = (process.env.RHENKO_PUBLIC_URL ?? "").replace(/\/+$/, "")
  const made = publicUrl ? boostCopy({ text: post.body, handle: post.handle, postId }, publicUrl) : { problem: "Boosts are not set up on this server yet." }
  if ("problem" in made) return blocked(made.problem)

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
  return {
    kind: "ready",
    handle: post.handle,
    postId,
    ad,
    options: BOOST_BUDGETS.map((amount) => ({ amount, views: boostViews(amount) })),
    currency: CURRENCY,
    balance: Math.floor(account.balance_micro / MICRO_PER_CENT),
  }
}
