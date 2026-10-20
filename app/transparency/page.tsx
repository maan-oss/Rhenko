import type { Metadata } from "next"
import { Suspense } from "react"
import { connection } from "next/server"
import { Skeleton } from "@/components/ui/skeleton"
import { all, get, type Param } from "@/lib/db"
import { B, LegalPage, List, P, type LegalSection } from "@/app/_legal/shell"
import { NOTICE_KINDS } from "@/lib/legal"

export const metadata: Metadata = {
  title: { absolute: "Transparency · Rhenko" },
  description: "How many reports, notices, hidden posts and appeals this server has handled.",
}

// The figures come from this server's own records, read when the page is opened. They are not an audited report.

async function count(sql: string, ...params: Param[]): Promise<number> {
  return (await get<{ n: number }>(sql, ...params))?.n ?? 0
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2 text-[15px] last:border-b-0">
      <span>{label}</span>
      <span className="font-semibold tabular-nums">{value.toLocaleString("en")}</span>
    </div>
  )
}

async function Reports() {
  await connection()
  const total = await count("SELECT COUNT(*) AS n FROM reports")
  const open = await count("SELECT COUNT(*) AS n FROM reports WHERE resolved_at IS NULL")
  const hidden = await count("SELECT COUNT(*) AS n FROM reports WHERE outcome = 'hidden'")
  const noAction = await count("SELECT COUNT(*) AS n FROM reports WHERE outcome = 'no_action'")
  return (
    <div className="flex flex-col">
      <Figure label="Reports received" value={total} />
      <Figure label="Still waiting for a decision" value={open} />
      <Figure label="Reviewed, and the post hidden" value={hidden} />
      <Figure label="Reviewed, with no action" value={noAction} />
    </div>
  )
}

async function Notices() {
  await connection()
  const byKind = await all<{ kind: string; n: number }>(
    "SELECT kind, COUNT(*) AS n FROM legal_notices WHERE kind <> 'authority_request' GROUP BY kind"
  )
  const received = byKind.reduce((sum, row) => sum + row.n, 0)
  const actioned = await count("SELECT COUNT(*) AS n FROM legal_notices WHERE status = 'actioned'")
  const rejected = await count("SELECT COUNT(*) AS n FROM legal_notices WHERE status = 'rejected'")
  const open = await count("SELECT COUNT(*) AS n FROM legal_notices WHERE status = 'open' AND kind <> 'authority_request'")
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col">
        <Figure label="Notices received through the notice form" value={received} />
        <Figure label="Still open" value={open} />
        <Figure label="Actioned" value={actioned} />
        <Figure label="Rejected" value={rejected} />
      </div>
      <div className="flex flex-col">
        <p className="pb-2 text-sm text-muted-foreground">Received, by what the notice is about</p>
        {NOTICE_KINDS.map((kind) => (
          <Figure key={kind.id} label={kind.label} value={byKind.find((row) => row.kind === kind.id)?.n ?? 0} />
        ))}
      </div>
    </div>
  )
}

async function Hiding() {
  await connection()
  const hidden = await count("SELECT COUNT(*) AS n FROM moderation_notices")
  const restored = await count("SELECT COUNT(*) AS n FROM moderation_notices WHERE restored_at IS NOT NULL")
  const deleted = await count(
    `SELECT COUNT(*) AS n FROM moderation_notices n
     WHERE n.restored_at IS NULL AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = n.post_id)`
  )
  const appeals = await count("SELECT COUNT(*) AS n FROM appeals")
  const reversed = await count("SELECT COUNT(*) AS n FROM appeals WHERE decision = 'reversed'")
  const upheld = await count("SELECT COUNT(*) AS n FROM appeals WHERE decision = 'upheld'")
  const waiting = await count("SELECT COUNT(*) AS n FROM appeals WHERE decided_at IS NULL")
  return (
    <div className="flex flex-col">
      <Figure label="Posts hidden, with a notice sent to the author" value={hidden} />
      <Figure label="Put back" value={restored} />
      <Figure label="Deleted from the server, and not put back" value={deleted} />
      <Figure label="Appeals made" value={appeals} />
      <Figure label="Appeals reversed" value={reversed} />
      <Figure label="Appeals not upheld, with the post deleted" value={upheld} />
      <Figure label="Appeals waiting for a decision" value={waiting} />
    </div>
  )
}

async function Requests() {
  await connection()
  const recorded = await count("SELECT COUNT(*) AS n FROM legal_notices WHERE kind = 'authority_request'")
  return (
    <div className="flex flex-col">
      <Figure label="Orders and requests from courts or authorities" value={recorded} />
    </div>
  )
}

async function Advertising() {
  await connection()
  const campaigns = await count("SELECT COUNT(*) AS n FROM ad_campaigns")
  const waiting = await count("SELECT COUNT(*) AS n FROM ad_campaigns WHERE status = 'in_review'")
  const approved = await count("SELECT COUNT(*) AS n FROM ad_campaigns WHERE reviewed_at IS NOT NULL AND status <> 'rejected'")
  const rejected = await count("SELECT COUNT(*) AS n FROM ad_campaigns WHERE status = 'rejected'")
  const reports = await count("SELECT COUNT(*) AS n FROM ad_reports")
  return (
    <div className="flex flex-col">
      <Figure label="Campaigns sent for review" value={campaigns} />
      <Figure label="Waiting for review" value={waiting} />
      <Figure label="Approved to run" value={approved} />
      <Figure label="Rejected" value={rejected} />
      <Figure label="Reports about ads" value={reports} />
    </div>
  )
}

function Waiting() {
  return <Skeleton className="h-40 w-full" />
}

const SECTIONS: LegalSection[] = [
  {
    id: "reports",
    title: "Reports",
    body: (
      <>
        <P>Reports sent by members, from the Report post option.</P>
        <Suspense fallback={<Waiting />}>
          <Reports />
        </Suspense>
      </>
    ),
  },
  {
    id: "notices",
    title: "Notices",
    body: (
      <>
        <P>Notices about content sent through the notice form.</P>
        <Suspense fallback={<Waiting />}>
          <Notices />
        </Suspense>
      </>
    ),
  },
  {
    id: "hiding",
    title: "Hidden posts and appeals",
    body: (
      <>
        <P>Posts hidden under the Community Rules or for a notice, and the appeals about them.</P>
        <Suspense fallback={<Waiting />}>
          <Hiding />
        </Suspense>
      </>
    ),
  },
  {
    id: "requests",
    title: "Requests from authorities",
    body: (
      <>
        <P>
          Orders and requests from courts and authorities that the operator has recorded. The content of a request is not
          published, where the law forbids it.
        </P>
        <Suspense fallback={<Waiting />}>
          <Requests />
        </Suspense>
      </>
    ),
  },
  {
    id: "advertising",
    title: "Advertising",
    body: (
      <>
        <P>Campaigns sent by advertisers, and the reports people have made about ads. The ad library lists every campaign that has run.</P>
        <Suspense fallback={<Waiting />}>
          <Advertising />
        </Suspense>
      </>
    ),
  },
  {
    id: "accounts",
    title: "How accounts are checked",
    body: (
      <List>
        <li>
          Creating an account and resetting a password always ask for a human check. Signing in asks for one after three failed sign-ins
          for a handle, or ten from one network, within 15 minutes. New follows, new conversations and posts from an account that looks
          automated ask for one too. The check is a puzzle that takes a moment in the browser, or Cloudflare Turnstile where the operator uses it.
        </li>
        <li>
          Signs that an account looks automated include how new it is, whether its email is confirmed, an empty profile, a handle that
          ends in many digits, very fast following, liking, reposting or starting conversations, and reports from other people.
        </li>
        <li>
          An account made from one network with others is a weak sign on its own, because many people share an address. It can add to
          a score but never restricts an account alone.
        </li>
        <li>
          An account with many signs is limited from following, starting conversations and posting for a while. The limit lifts as its
          activity settles, and the account is told what it can do, such as confirming its email address.
        </li>
        <li>Sahayak, the AI account, is not checked this way.</li>
      </List>
    ),
  },
  {
    id: "feeds",
    title: "How the feeds are ordered",
    body: (
      <List>
        <li>
          <B>For you</B> ranks the posts and reposts you are allowed to see by how likely you are to like, repost, bookmark or read
          them. Who you follow and what they like, your hashtags, how recent and how engaged a post is, and what you have already
          seen or read all count. Posts you mark Not interested leave your feed.
        </li>
        <li>
          The weights behind For you are learned from what people did after they were shown posts, refreshed about once an hour, and
          used only when they predict better than the defaults. The same weights apply to every account.
        </li>
        <li>
          <B>Following</B> shows posts and reposts from the people and topics you follow, newest first.
        </li>
        <li>
          <B>Explore</B> is sorted by top or by latest. Top adds up likes, reposts (counted twice) and replies.
        </li>
        <li>No feed is ranked by who has paid.</li>
        <li>
          Ads are placed about every eight posts in the home feeds, sometimes nine. Each one is labelled Ad. They are not shown to people under 18 or to
          people who pay for Rhenko Plus.
        </li>
      </List>
    ),
  },
  {
    id: "connections",
    title: "How people are suggested to connect",
    body: (
      <>
        <P>
          Connect, the right-hand column and the last setup step show people you could follow. Each suggestion says why it is there,
          in words, such as &quot;In Leeds, like you&quot; or &quot;Language swap: French for English&quot;.
        </P>
        <List>
          <li>
            <B>Groups, in order.</B> A person appears in one group only, the first that fits: a language swap, the same town or city,
            people you follow follow, a language you speak or are learning, or posts on topics you follow. People to start with comes last. It is used only when nothing else fits, and shows the accounts most
            people follow, with the reason &quot;Followed by N people&quot; or &quot;New to Rhenko&quot;. It is never matched to you.
          </li>
          <li>
            <B>What is used.</B> The town or city you gave and your country, your languages and how well you speak them, the people
            you follow, the topics you follow, how many followers someone has, whether they posted in the last two weeks, and your
            switches.
          </li>
          <li>
            <B>What is never used.</B> Your age, your gender, your religion, your race, your health, your politics, your messages, and
            your own posts. Rhenko never asks for a street address and never reads your device&apos;s location.
          </li>
          <li>
            <B>Both people agree.</B> Nearby suggestions need both people to have them turned on, and so do language partner
            suggestions.
          </li>
          <li>
            <B>Your town is not shown to others.</B> The town or city you give for suggestions is kept apart from your profile. Your profile Location is text you write yourself, and
            everyone can see it. The town or city appears only in a suggestion&apos;s reason, and only you see that.
          </li>
          <li>
            <B>Nobody is told.</B> No one is told they were suggested to someone, and a suggestion is not a post. Suggestions do not
            change how any post is ranked.
          </li>
          <li>
            <B>Never suggested.</B> People you block or mute, people who have blocked you, protected and deactivated accounts, and
            people you already follow. A person you chose Not now on stays out of your suggestions for 180 days, in every group, including People to start with.
          </li>
          <li>
            <B>Your controls.</B> In Settings, under Connections and languages, you can change where you are and your languages, turn
            off nearby or language suggestions, and show again the people you chose Not now on. Your data export lists all of it.
          </li>
        </List>
      </>
    ),
  },
  {
    id: "sahayak",
    title: "How Sahayak works",
    body: (
      <>
        <P>Sahayak is an AI assistant. It answers when someone mentions it under a post. The operator decides whether to turn it on.</P>
        <List>
          <li>
            <B>Off unless set up.</B> Where the operator has not connected the answering service, Sahayak does not answer, and no question is kept.
          </li>
          <li>
            <B>Asked for in a post.</B> Only a mention of @sahayak under a post starts an answer. Sahayak cannot be messaged, and no one can sign in as it.
          </li>
          <li>
            <B>What is sent.</B> The question, and the posts it replies to or quotes that the person asking can see. Nothing else goes to the service.
          </li>
          <li>
            <B>Labelled.</B> Its posts and profile carry an AI label. Its answers can be wrong, and a report works on them like any post.
          </li>
          <li>
            <B>Limits.</B> Each person can ask Sahayak 20 questions an hour. An answer is a short post.
          </li>
        </List>
      </>
    ),
  },
  {
    id: "translations",
    title: "How translation works",
    body: (
      <>
        <P>Translation is optional. The operator of this server decides whether to connect a translation service.</P>
        <List>
          <li>
            <B>Off unless set up.</B> Where no service is connected, no translate button appears on any post or message.
          </li>
          <li>
            <B>Asked for, one at a time.</B> Nothing is translated on its own. A reader asks for a translation of one post or message.
            The translated text is kept with that post or message, so the next reader who asks for the same language does not send it
            again.
          </li>
          <li>
            <B>What is sent.</B> The text of that one post or message, the language it is in, and the language you read. Nothing else
            goes to the service.
          </li>
          <li>
            <B>Limits.</B> Each person can ask for 120 translations an hour. Text longer than 5,000 characters is not translated.
          </li>
          <li>
            <B>Language guesses.</B> Rhenko guesses the language of each post and message from its text, and a guess can be wrong. If
            the guess matches a language you speak, no translation is offered.
          </li>
        </List>
      </>
    ),
  },
  {
    id: "paid",
    title: "What paid features change",
    body: (
      <List>
        <li>
          <B>Rhenko Plus</B> removes ads from the home feeds, and gives 24 hours to edit a post instead of one hour.
        </li>
        <li>
          <B>The paid subscriber ring</B> shows beside a name that the person pays. It changes nothing else.
        </li>
        <li>
          <B>Tips</B> are paid from one person to another. They do not change who sees a post.
        </li>
        <li>No paid feature changes how a post is ranked, how far it reaches, or who can see it.</li>
      </List>
    ),
  },
  {
    id: "notes",
    title: "How these figures are made",
    body: (
      <List>
        <li>They count records on this server since it was set up, and are read again each time this page is opened.</li>
        <li>They are not an audited report, and they do not include what happens outside this server.</li>
      </List>
    ),
  },
]

export default function TransparencyPage() {
  return (
    <Suspense fallback={null}>
      <TransparencyBody />
    </Suspense>
  )
}

// The date shown is the date the figures were read, so it is worked out on each request.
async function TransparencyBody() {
  await connection()
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
  return (
    <LegalPage
      title="Transparency"
      updated={today}
      intro="How many reports, notices, hidden posts and appeals this server has handled, and what came of them."
      sections={SECTIONS}
      other={{ href: "/legal", label: "All legal documents" }}
    />
  )
}
