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
export const AD_BUDGET_MIN = 100
export const AD_BUDGET_MAX = 1_000_000
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

export function policyProblem(text: string): string | null {
  for (const rule of BLOCKED) if (rule.pattern.test(text)) return rule.reason
  return null
}

// A topic as people follow it: lower case, without the #, so it matches the topics people follow.
export function normalizeTopic(value: string): string {
  return value.replace(/^#/, "").toLowerCase()
}

export type CampaignFields = {
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
export function adLinkProblem(link: string): string | null {
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

// What an ad shows. The button goes to the site's own redirect, which counts the click and then sends the person on.
export type AdView = {
  id: string
  headline: string
  body: string
  cta: string
  href: string
  advertiser: string
  host: string
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
