// Legal facts the pages, sign-up, moderation and the background tick all read, so the numbers in the policies and the
// behaviour of the app cannot drift apart. Pure values, so client components can import them.

// Bump this whenever the Terms or the Privacy Policy change in a way that matters. Every account must accept the current
// version before it can use the app.
export const TERMS_VERSION = "2026-10-12-2"
export const LEGAL_UPDATED = "12 October 2026"

// Rhenko is for adults. 18 is the age at which India's DPDP Act stops treating someone as a child (so no parental
// consent flow is needed), and it is above Australia's under-16 rule for age-restricted social media, the UK and EU
// child-protection duties, and COPPA.
export const MINIMUM_AGE = 18

// A notice about hidden content can be answered for this many days. After that, or once an appeal is decided, the hidden
// post is deleted.
export const APPEAL_DAYS = 30
const DAY = 24 * 60 * 60 * 1000
export const APPEAL_MS = APPEAL_DAYS * DAY

// How long each kind of record is kept. The Privacy Policy states these, and the background tick enforces them.
export const RETENTION = {
  viewsDays: 90,
  visitsDays: 90,
  // Which posts were put in someone's For you, how long they were on screen, and the training they feed.
  feedSignalsDays: 30,
  // A "not now" on a connection suggestion. Where someone is, and their languages, are kept until they change them.
  dismissedConnectionsDays: 180,
  readNotificationsDays: 180,
  legalNoticesDays: 365 * 3,
  // A finished question for Sahayak: the question text, kept only so the answer can be checked and retried. The answer itself is a post.
  sahayakDays: 30,
  // When an account was made from, signed in from or passed a check: the network as a keyed hash that cannot be read back to an
  // address. The browser is not kept. Used to see many accounts coming from one place (lib/risk.ts).
  signalsDays: 30,
}

// Why a post was hidden or removed. A moderator picks one of these, and the notice the author sees names it.
export const MODERATION_CATEGORIES = [
  { id: "child_abuse", label: "Child sexual abuse material" },
  { id: "intimate_image", label: "Intimate image shared without consent" },
  { id: "illegal", label: "Illegal content" },
  { id: "copyright", label: "Copyright infringement" },
  { id: "impersonation", label: "Impersonation" },
  { id: "privacy", label: "Private information shared without consent" },
  { id: "harassment", label: "Harassment or abuse" },
  { id: "hate", label: "Hateful conduct" },
  { id: "violence", label: "Violent or threatening content" },
  { id: "spam", label: "Spam or manipulation" },
  { id: "rules", label: "Breaks our Rules" },
] as const

export function categoryLabel(id: string): string {
  return MODERATION_CATEGORIES.find((c) => c.id === id)?.label ?? "Breaks our Rules"
}

// The kinds of notice a person can send from the public form. Each one asks for what the law needs for that kind.
export const NOTICE_KINDS = [
  { id: "copyright", label: "Copyright infringement" },
  { id: "intimate_image", label: "Intimate image shared without consent" },
  { id: "child_abuse", label: "Child sexual abuse material" },
  { id: "impersonation", label: "Impersonation" },
  { id: "privacy", label: "Private information shared without consent" },
  { id: "illegal", label: "Other illegal content" },
] as const

export function noticeKindLabel(id: string): string {
  return NOTICE_KINDS.find((k) => k.id === id)?.label ?? "Other illegal content"
}

// Notices that must be acted on at once. Their post is hidden as soon as the notice arrives, and a person reviews it after.
export const URGENT_KINDS: ReadonlySet<string> = new Set(["intimate_image", "child_abuse"])

// A notice about an intimate image must be acted on within this many hours of its arrival: the TAKE IT DOWN Act requires a covered
// platform to remove the content within 48 hours of a valid request made through its posted process. The deadline is kept on the
// notice (legal_notices.due_by), and the command line lists the ones past it.
export const INTIMATE_REMOVAL_HOURS = 48

// After a counter-notice, a post removed for copyright goes back no sooner than 10 and no later than 14 business days after the
// counter-notice was received, unless the copyright owner has told us it has started a court action (17 U.S.C. 512(g)(2)(C)).
export const COUNTER_RESTORE_BUSINESS_DAYS = { from: 10, by: 14 } as const
