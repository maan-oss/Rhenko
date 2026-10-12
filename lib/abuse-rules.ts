// Spam and manipulation checks for a post. Pure: it reads a post's text and facts about its author's recent activity, and
// returns a score from 0 to 100 with the reasons for it. Nothing here touches the database. lib/abuse.ts gathers the facts.
//
// Below LIMIT_AT a post goes out as usual. From LIMIT_AT it goes out, but it stays out of other people's For you feeds and
// does not notify anyone. From HOLD_AT it is hidden, and its author gets a notice they can appeal, the same as any other
// moderation action. Every signal is capped, so one kind of evidence cannot hold a post on its own.

export const LIMIT_AT = 50
export const HOLD_AT = 75

export type AbuseFacts = {
  // Days-old accounts are the newest kind of bot. Hours, so a new account is judged in its first day.
  accountAgeHours: number
  // Posts by this author in the last ten minutes, not counting this one.
  recentPosts: number
  // Earlier posts by this author with the same text in the last day.
  sameTextBySelf: number
  // Other accounts that posted the same text in the last hour.
  sameTextOthers: number
  // Spam notices ever given to this account.
  spamNotices: number
  // Reports received in the last 30 days against this account or its posts.
  reports: number
}

export type AbuseVerdict = {
  score: number
  action: "allow" | "limit" | "hold"
  // Plain-English reasons, strongest first. The author sees these when a post is held.
  reasons: string[]
}

type Kind = "pitch" | "contact" | "urgency"

// Phrases seen in scams and in bought engagement. A phrase counts once per post. Each one is a family of wordings, so
// "claim your gift" and "claim your reward" are the same signal. A "pitch" offers money, a prize, free gifts, followers or
// a trading group; a "contact" sends the reader to a private message or a link; "urgency" pushes them to act now. A pitch
// that also contacts, or contacts through a link, gets an extra signal (see assessPost), because either alone is common in
// ordinary posts. Most phrases on their own stay under LIMIT_AT.
const PHRASES: { re: RegExp; points: number; reason: string; kind: Kind }[] = [
  { re: /\bguaranteed (returns?|profits?|income|earnings)\b/i, points: 25, reason: "promises guaranteed returns", kind: "pitch" },
  { re: /\b(double|triple|10x) your (money|investment|crypto|bitcoin|btc)\b/i, points: 25, reason: "promises to multiply money", kind: "pitch" },
  { re: /\brisk[- ]free (returns?|profits?|investments?)\b/i, points: 20, reason: "promises risk-free returns", kind: "pitch" },
  { re: /\b(earn|make)\s+(\$|£|€|₹)?\s?\d[\d,]*\s*(a|per|every)\s+(day|hour|week)\b/i, points: 20, reason: "promises a set daily or weekly income", kind: "pitch" },
  { re: /\b(earn|make)\s+(\$|£|€|₹)\s?\d[\d,]*\s*(daily|weekly|monthly)\b/i, points: 20, reason: "promises a set daily or weekly income", kind: "pitch" },
  { re: /\b(no|zero) experience (needed|required|necessary)\b|\bzero experience\b/i, points: 12, reason: "promises easy income with no experience", kind: "pitch" },
  { re: /\bwork from home\b.{0,30}\b(earn|\$|£|€|₹)/i, points: 15, reason: "advertises work-from-home earnings", kind: "pitch" },
  { re: /\bclaim (your|the|this|a|an)\b.{0,20}\b(reward|prize|gift|airdrop|bonus|cash|winnings?)\b/i, points: 25, reason: "asks you to claim a prize", kind: "pitch" },
  { re: /\byou (have |has )?(won|been selected|were selected)\b/i, points: 20, reason: "tells you that you have won or been picked", kind: "pitch" },
  { re: /\bfree\b.{0,25}\b(crypto|bitcoin|btc|eth|robux|gift cards?|airdrop|iphone)\b/i, points: 25, reason: "offers free crypto or gifts", kind: "pitch" },
  { re: /\b(crypto|forex|binary options)\s+(signals?|mentor(ship)?|group|trading course)\b/i, points: 20, reason: "sells trading signals or groups", kind: "pitch" },
  { re: /\b(private|premium|vip|paid)\s+(signals?|channel|group)\b/i, points: 15, reason: "sells trading signals or groups", kind: "pitch" },
  { re: /\b(massive|huge|insane|crazy|big)\s+gains\b/i, points: 12, reason: "promises big gains", kind: "pitch" },
  { re: /\b(cheap|low|best) prices?\b|\binstant delivery\b/i, points: 8, reason: "uses bargain or instant-delivery language", kind: "pitch" },
  { re: /\b\d{2,3}\s?%\s+(win rate|accuracy|success rate)\b/i, points: 12, reason: "claims a high win rate", kind: "pitch" },
  { re: /\bfollow (for|4) follow\b|\bl4l\b|\bf4f\b/i, points: 20, reason: "trades follows", kind: "pitch" },
  { re: /\b(buy|cheap)\s+(followers|likes|views|subscribers)\b/i, points: 25, reason: "sells followers, likes or views", kind: "pitch" },
  { re: /\bget \d[\d,]*\s+(followers|subscribers|likes|views)\b/i, points: 20, reason: "promises followers, likes or views", kind: "pitch" },
  { re: /\b100%\s+(legit|safe|real|guaranteed)\b/i, points: 10, reason: "claims to be 100% safe", kind: "pitch" },
  { re: /\b(dm|message|inbox|pm|whatsapp|telegram|text)\s+(me|us)\b/i, points: 15, reason: "asks you to message privately", kind: "contact" },
  { re: /\bconnect your (crypto )?wallet\b/i, points: 20, reason: "asks you to connect a crypto wallet", kind: "contact" },
  { re: /\b(my|this) (referral |affiliate )?link\b/i, points: 10, reason: "sends you to a link in their profile or shop", kind: "contact" },
  { re: /\b(click|tap) (here|the link|below|this link)\b/i, points: 10, reason: "asks you to click through", kind: "contact" },
  { re: /\b(visit|check out) my (site|page|shop|store|profile)\b|\blink in (my )?(bio|profile)\b/i, points: 10, reason: "sends you to a link in their profile or shop", kind: "contact" },
  { re: /\blimited (time|slots|spots|offer|seats)\b|\b(spots|seats|slots) (are |is )?(limited|left|running out)\b/i, points: 8, reason: "creates a limited-time rush", kind: "urgency" },
  { re: /\b(act|hurry|sign up|join)\s+(now|today)\b/i, points: 6, reason: "pushes you to act now", kind: "urgency" },
  { re: /\bbefore (it expires|midnight|they run out|it'?s gone|the offer ends)\b/i, points: 6, reason: "sets a deadline", kind: "urgency" },
]

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"]+|\bwww\.[^\s<>"]+|\b[a-z0-9-]+\.(?:com|net|org|io|co|xyz|top|click|link|site|online|live|ly|gg|info|shop)(?:\/[^\s<>"]*)?/gi
const SHORTENER_PATTERN = /\b(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|rb\.gy|cutt\.ly|shorturl\.at|tiny\.cc)\b/gi
const RISKY_TLD_PATTERN = /\.(?:xyz|top|click|link|site|online|live|shop)\b/gi
const MENTION_PATTERN = /(?:^|[^A-Za-z0-9_@])@[A-Za-z0-9_]{3,15}\b/g
const TAG_PATTERN = /(?:^|\s)#[\p{L}\p{N}_]{1,50}/gu
const EMOJI_PATTERN = /\p{Extended_Pictographic}/gu

// Lower-case words only, with links and punctuation removed, so the same message posted with different links or
// punctuation still matches. Text shorter than 12 characters is never compared: "hi" or a picture-only post would match
// every other one.
export function normalizeForDuplicates(body: string): string {
  const words = body
    .toLowerCase()
    .replace(/https?:\/\/\S+|www\.\S+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
  return words.length >= 12 ? words : ""
}

// The highest tier the value reaches. Tiers are ordered by threshold, and the last one met wins.
function tier(value: number, tiers: [number, number, string][]): { points: number; reason: string } | null {
  let hit: { points: number; reason: string } | null = null
  for (const [at, points, reason] of tiers) {
    if (value >= at) hit = { points, reason }
  }
  return hit
}

function count(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length
}

export function assessPost(body: string, facts: AbuseFacts): AbuseVerdict {
  const found: { points: number; reason: string }[] = []
  const add = (points: number, reason: string) => {
    if (points > 0) found.push({ points, reason })
  }
  const addTier = (value: number, tiers: [number, number, string][]) => {
    const hit = tier(value, tiers)
    if (hit) found.push(hit)
  }

  // The text.
  let pitch = false
  let contact = false
  for (const phrase of PHRASES) {
    if (!phrase.re.test(body)) continue
    add(phrase.points, phrase.reason)
    if (phrase.kind === "pitch") pitch = true
    if (phrase.kind === "contact") contact = true
  }

  const links = count(body, URL_PATTERN)
  addTier(links, [[3, 10, "contains several links"], [5, 20, "contains many links"]])
  if (links > 0) contact = true
  const shorteners = count(body, SHORTENER_PATTERN)
  if (shorteners >= 1) add(20, "uses a link shortener")
  if (shorteners >= 2) add(15, "uses several link shorteners")
  const risky = count(body, RISKY_TLD_PATTERN)
  if (risky >= 1) add(8, "links to a site with a suspicious address")
  if (risky >= 2) add(15, "links to several sites with suspicious addresses")
  const words = body.replace(URL_PATTERN, " ").trim().length
  if (links > 0 && (words < 8 || (links >= 3 && words < 20))) add(12, "is mostly links")
  if (pitch && contact) add(15, "pitches something and sends you somewhere to get it")

  addTier(count(body, MENTION_PATTERN), [[5, 10, "mentions many people"], [10, 35, "mentions a long list of people"]])
  addTier(count(body, TAG_PATTERN), [[5, 10, "uses many hashtags"], [8, 25, "stuffs in hashtags"], [12, 35, "stuffs in a long list of hashtags"]])
  const letters = count(body, /\p{L}/gu)
  const capitals = count(body, /\p{Lu}/gu)
  if (letters >= 25 && capitals / letters >= 0.7) add(8, "shouts in capitals")
  if (/(.)\1{7,}/u.test(body) || /[!?]{4,}/.test(body)) add(6, "repeats characters or punctuation")
  addTier(count(body, EMOJI_PATTERN), [[10, 8, "uses a lot of emoji"]])

  // The account and what it has been doing.
  addTier(facts.recentPosts, [[30, 20, "posts very often"], [60, 40, "posts in a flood"]])
  addTier(facts.sameTextBySelf, [[1, 20, "posts the same text again"], [3, 35, "posts the same text over and over"]])
  addTier(facts.sameTextOthers, [[2, 25, "posts the same text as other accounts"], [5, 45, "posts the same text from a network of accounts"]])
  if (facts.accountAgeHours < 24) add(15, "is from an account less than a day old")
  else if (facts.accountAgeHours < 168) add(8, "is from an account less than a week old")
  addTier(facts.spamNotices, [[1, 15, "has had spam removed before"], [2, 30, "has had spam removed several times"]])
  addTier(facts.reports, [[3, 12, "has been reported several times"], [8, 25, "has been reported by many people"]])

  found.sort((a, b) => b.points - a.points)
  const score = Math.min(100, found.reduce((sum, item) => sum + item.points, 0))
  const action = score >= HOLD_AT ? "hold" : score >= LIMIT_AT ? "limit" : "allow"
  return { score, action, reasons: found.map((item) => item.reason) }
}
