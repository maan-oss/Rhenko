import { createHash } from "node:crypto"
import { newId, runChanges } from "@/lib/auth"
import { all, get, run, transaction } from "@/lib/db"
import type { FeedItem, Page } from "@/lib/data"
import { AD_EVERY, impressionCostMicro, hostOf, type AdView, type FeedEntry } from "@/lib/ad-rules"
import { MINIMUM_AGE } from "@/lib/legal"
import { ageFrom } from "@/lib/rules"

// Ads in the home feeds. An ad goes after every AD_EVERY posts. It is shown only to adults who are not Plus subscribers,
// and a campaign with a topic only to people who follow that topic. Each impression is charged once per person per
// campaign per day, and the charge is written to the ledger under a unique reference, so a reload never charges twice.

export type { AdView, AdItem, FeedEntry } from "@/lib/ad-rules"
export { isAdItem } from "@/lib/ad-rules"

// Whether this person may see ads at all: an adult with a birthday on record, who does not pay for Plus.
async function maySeeAds(viewerId: string): Promise<boolean> {
  const row = await get<{ birthday: string | null; plus: number }>(
    `SELECT u.birthday,
       EXISTS(SELECT 1 FROM subscriptions s WHERE s.user_id = u.id AND s.kind = 'plus' AND s.status IN ('active', 'trialing')) AS plus
     FROM users u WHERE u.id = ? AND u.deactivated_at IS NULL`,
    viewerId
  )
  if (!row || row.plus === 1 || !row.birthday) return false
  const age = ageFrom(row.birthday)
  return age !== null && age >= MINIMUM_AGE
}

type Candidate = {
  id: string
  headline: string
  body: string
  cta: string
  link_url: string
  account_id: string
  business_name: string
}

// Campaigns that may run now, the ones that have spent the least of their budget first, with a random order between
// equals so one campaign does not always come first.
async function candidatesFor(viewerId: string, limit: number): Promise<Candidate[]> {
  return await all<Candidate>(
    `SELECT c.id, c.headline, c.body, c.cta, c.link_url, c.account_id, a.business_name
     FROM ad_campaigns c JOIN ad_accounts a ON a.id = c.account_id
     WHERE c.status = 'active' AND a.status = 'active' AND c.spent_micro < c.budget_micro AND a.balance_micro >= ?
       AND (c.topic IS NULL OR EXISTS (SELECT 1 FROM topic_follows tf WHERE tf.user_id = ? AND tf.tag = c.topic))
     ORDER BY CAST(c.spent_micro AS REAL) / c.budget_micro ASC, RANDOM()
     LIMIT ?`,
    impressionCostMicro(),
    viewerId,
    limit
  )
}

// Records one impression for a person today. Returns false when the ad cannot be paid for, so it is not shown. An ad
// already charged to this person today is shown again without a second charge.
async function charge(candidate: Candidate, viewerId: string): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10)
  // The ledger keeps a one-way code for the person, never their identifier, so a charge can be told apart from another
  // without the ledger saying who saw the ad.
  const reference = `${candidate.id}:${createHash("sha256").update(`${viewerId}:${day}`).digest("hex")}`
  const cost = impressionCostMicro()
  return await transaction(async () => {
    const state = await get<{ status: string; spent_micro: number; budget_micro: number; balance_micro: number }>(
      `SELECT c.status, c.spent_micro, c.budget_micro, a.balance_micro
       FROM ad_campaigns c JOIN ad_accounts a ON a.id = c.account_id WHERE c.id = ?`,
      candidate.id
    )
    if (!state || state.status !== "active") return false
    if (await get("SELECT 1 AS found FROM ad_ledger WHERE kind = 'spend' AND reference = ?", reference)) return true
    if (state.balance_micro < cost) return false
    if (state.spent_micro + cost > state.budget_micro) {
      await run("UPDATE ad_campaigns SET status = 'ended' WHERE id = ? AND status = 'active'", candidate.id)
      return false
    }
    const written = await runChanges(
      "INSERT INTO ad_ledger (id, account_id, kind, amount_micro, reference, created_at) VALUES (?, ?, 'spend', ?, ?, ?) ON CONFLICT DO NOTHING",
      newId(),
      candidate.account_id,
      cost,
      reference,
      Date.now()
    )
    if (written === 0) return true
    await run("UPDATE ad_campaigns SET spent_micro = spent_micro + ?, impressions = impressions + 1 WHERE id = ?", cost, candidate.id)
    await run("UPDATE ad_accounts SET balance_micro = balance_micro - ? WHERE id = ?", cost, candidate.account_id)
    if (state.spent_micro + cost >= state.budget_micro) {
      await run("UPDATE ad_campaigns SET status = 'ended' WHERE id = ?", candidate.id)
    }
    return true
  })
}

// Adds ads to one page of a home feed. The page's cursor is unchanged, so paging still works. Ads are placed only among
// posts, never inside a reply or a thread (the home feeds hold no replies that are not top-level).
export async function withAds(page: Page<FeedItem>, viewerId: string): Promise<Page<FeedEntry>> {
  const slots = Math.floor(page.items.length / AD_EVERY)
  if (slots === 0 || !await maySeeAds(viewerId)) return page
  const chosen: AdView[] = []
  for (const candidate of await candidatesFor(viewerId, slots * 3)) {
    if (chosen.length >= slots) break
    if (!await charge(candidate, viewerId)) continue
    chosen.push({
      id: candidate.id,
      headline: candidate.headline,
      body: candidate.body,
      cta: candidate.cta,
      href: `/api/ads/click/${candidate.id}`,
      advertiser: candidate.business_name,
      host: hostOf(candidate.link_url),
    })
  }
  if (chosen.length === 0) return page
  const items: FeedEntry[] = []
  let next = 0
  page.items.forEach((item, index) => {
    items.push(item)
    if ((index + 1) % AD_EVERY === 0 && next < chosen.length) {
      const ad = chosen[next++]
      items.push({ key: `ad:${ad.id}:${index}`, ad })
    }
  })
  return { items, next: page.next }
}
