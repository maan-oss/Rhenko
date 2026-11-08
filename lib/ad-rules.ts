// Advertising rules. Pure values and checks, so the advertiser's form and the server run exactly the same rules.

import type { FeedItem } from "@/lib/data"
// Advertising is paid in advance and charged per thousand impressions. An impression is a view of an ad by one person on
// one day, counted once however often that person reloads the feed that day.

export const AD_HEADLINE_MAX = 60
export const AD_BODY_MAX = 140
export const AD_CTA_MAX = 20
export const AD_LINK_MAX = 300
export const AD_TOPIC_MAX = 30
export const AD_CAMPAIGNS_WAITING_MAX = 10
// Budgets are in minor units (cents). A campaign's budget is at least 1.00 and at most 10,000.00.
const AD_BUDGET_MIN = 100
const AD_BUDGET_MAX = 1_000_000
// One ad at most after every this many posts in a feed. Never inside a reply or a thread.
export const AD_EVERY = 8

// Money inside the ad ledger is in micro-units: one cent is 10,000 micro-units, so a fraction of a cent is never lost.
export const MICRO_PER_CENT = 10_000

// The amounts an advertiser can add to the balance at once, in cents.
export const ADD_CREDIT_OPTIONS = [2500, 5000, 10_000, 25_000]

// The price of one thousand impressions, in cents. Set by RHENKO_AD_CPM_CENTS. Clamped so a typo cannot make ads free
// or ruinously expensive.
export function cpmCents(): number {
  const value = Number(process.env.RHENKO_AD_CPM_CENTS ?? 200)
  return Number.isFinite(value) ? Math.min(Math.max(Math.round(value), 10), 5000) : 200
}

// The cost of one impression, in micro-units.
export function impressionCostMicro(): number {
  return Math.round((cpmCents() * MICRO_PER_CENT) / 1000)
}

// Categories the policy does not allow. This is a first screen for the obvious cases only. A person reads every campaign
// before it can run, and that review decides.
const BLOCKED: { pattern: RegExp; reason: string }[] = [
  { pattern: /\b(casino|sportsbook|betting|gambl\w*|poker)\b/i, reason: "Ads for gambling are not allowed." },
  { pattern: /\b(crypto\w*|bitcoin|ethereum|memecoin|nft|token presale)\b/i, reason: "Ads for crypto assets are not allowed." },
  {
    pattern: /\b(forex|binary options|trading signals?|guaranteed returns?|invest now|payday loans?|instant loans?)\b/i,
    reason: "Ads for financial products such as trading, investing or loans are not allowed.",
  },
  {
    pattern: /\b(vote for|election|candidate|political|referendum|for (?:president|prime minister|parliament|senate))\b/i,
    reason: "Political ads are not allowed.",
  },
  { pattern: /\b(real[- ]money (?:games?|gaming)|cash prizes? games?)\b/i, reason: "Ads for real-money games are not allowed." },
]

function policyProblem(text: string): string | null {
  for (const rule of BLOCKED) if (rule.pattern.test(text)) return rule.reason
  return null
}

// A topic as people follow it: lower case, without the #, so it matches the topics people follow.
export function normalizeTopic(value: string): string {
  return value.replace(/^#/, "").toLowerCase()
}

type CampaignFields = {
  headline: string
  body: string
  cta: string
  link: string
  topic: string
  budgetMinor: number
}

// The first problem with a campaign as written, or null when it may be sent for review.
export function campaignProblem(fields: CampaignFields): string | null {
  if (fields.headline.trim().length < 3) return "Write a headline of at least 3 characters."
  if ([...fields.headline].length > AD_HEADLINE_MAX) return `Headlines can have up to ${AD_HEADLINE_MAX} characters.`
  if ([...fields.body].length < 10) return "Write a line of at least 10 characters."
  if ([...fields.body].length > AD_BODY_MAX) return `The text can have up to ${AD_BODY_MAX} characters.`
  if (fields.cta.trim().length < 2) return "Write the button text, such as Learn more."
  if ([...fields.cta].length > AD_CTA_MAX) return `The button text can have up to ${AD_CTA_MAX} characters.`
  const linkProblem = adLinkProblem(fields.link)
  if (linkProblem) return linkProblem
  if (fields.topic !== "" && !/^[a-z0-9_]{1,30}$/.test(fields.topic)) return "A topic is one word of letters, numbers or underscores."
  if (!Number.isInteger(fields.budgetMinor) || fields.budgetMinor < AD_BUDGET_MIN || fields.budgetMinor > AD_BUDGET_MAX) {
    return "The budget is between 1.00 and 10,000.00."
  }
  const text = [fields.headline, fields.body, fields.cta].join(" ")
  return policyProblem(text)
}

// Ads link to a secure address only. The address is shown to people, so it is checked as written.
function adLinkProblem(link: string): string | null {
  if (link.length === 0 || link.length > AD_LINK_MAX) return `Enter a web address of up to ${AD_LINK_MAX} characters.`
  let url: URL
  try {
    url = new URL(link)
  } catch {
    return "Enter a valid web address that starts with https://."
  }
  if (url.protocol !== "https:") return "The address must start with https://."
  if (url.hostname === "localhost" || url.hostname.endsWith(".local") || url.hostname.endsWith(".internal")) {
    return "Enter a public web address."
  }
  return null
}

// Boosts. A boost makes one of the author's own text posts into an ad. The policy screen reads the whole post, not only the part an
// ad shows. The campaign is reviewed like any other, and it is labelled Ad. The amounts are the most a boost can spend, in dollars.
export const BOOST_BUDGETS = [5, 10, 25, 50]
// The most of a post an ad shows. A longer post is cut at a word, and the button opens the whole post.
export const BOOST_BODY_MAX = 1000
const BOOST_CTA = "View post"

export type BoostCopy = { headline: string; body: string; cta: string; link: string }

// The ad for a post, or the reason it cannot be boosted. publicUrl is the site's address without a trailing slash. The policy
// screen reads the whole post. The ad keeps the post's own words, as written, cut at a word when the post is longer than the limit.
export function boostCopy(post: { text: string; handle: string; postId: string }, publicUrl: string): { copy: BoostCopy } | { problem: string } {
  const flat = post.text.replace(/\s+/g, " ").trim()
  if ([...flat].length < 10) return { problem: "Boosts need at least 10 characters of text. Add more to the post first." }
  const problem = policyProblem(flat)
  if (problem) return { problem }
  const words = post.text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()
  return {
    copy: {
      headline: clip(flat, AD_HEADLINE_MAX),
      body: clip(words, BOOST_BODY_MAX),
      cta: BOOST_CTA,
      link: `${publicUrl}/${post.handle}/status/${post.postId}`,
    },
  }
}

// How many views a budget buys at the current price, at most. A view is one person seeing the ad on one day.
export function boostViews(dollars: number): number {
  return Math.floor((dollars * 100 * MICRO_PER_CENT) / impressionCostMicro())
}

// SQL for a campaign that may run or be listed: not a boost, or a boost whose post is still on Rhenko and whose author has not
// closed their account. The campaign table must be aliased c.
export const LIVE_CAMPAIGN_SQL = `(c.post_id IS NULL OR EXISTS (SELECT 1 FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = c.post_id AND p.removed_at IS NULL AND u.deactivated_at IS NULL))`

// The first max characters, cut at a word where one is near, with an ellipsis when cut.
function clip(text: string, max: number): string {
  const chars = [...text]
  if (chars.length <= max) return text
  const cut = chars.slice(0, max - 1).join("")
  const space = cut.lastIndexOf(" ")
  const kept = space > (max - 1) * 0.6 ? cut.slice(0, space) : cut
  return `${kept.replace(/[\s,.;:!?-]+$/, "")}…`
}

// What an ad shows. The button goes to the site's own redirect, which counts the click and then sends the person on.
export type AdView = {
  id: string
  headline: string
  body: string
  cta: string
  href: string
  advertiser: string
  host: string
  // A boost: the body is the post's own words, and byline names its author.
  boost?: boolean
  byline?: string
}

// What each campaign status is called on the advertiser's pages.
export const CAMPAIGN_STATUS_LABEL: Record<"in_review" | "rejected" | "active" | "paused" | "ended", string> = {
  in_review: "Waiting for review",
  rejected: "Not approved",
  active: "Running",
  paused: "Paused",
  ended: "Ended",
}

export type AdItem = { key: string; ad: AdView }

// A row of a feed: a post, or an ad between posts.
export type FeedEntry = FeedItem | AdItem

export function isAdItem(entry: FeedEntry): entry is AdItem {
  return "ad" in entry
}

// The address without its path, for showing next to an ad: "example.com".
export function hostOf(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}
