import type { Metadata } from "next"
import { connection } from "next/server"
import { all } from "@/lib/db"
import { LegalPage, List, P, TextLink, type LegalSection } from "@/app/_legal/shell"
import { LEGAL_UPDATED, MINIMUM_AGE } from "@/lib/legal"
import { AD_EVERY, cpmCents, hostOf } from "@/lib/ad-rules"
import { CURRENCY } from "@/lib/payments"
import { formatMoney } from "@/lib/money"
import { RevealSuspense } from "@/components/app/reveal-suspense"

export const metadata: Metadata = {
  title: { absolute: "Advertising policy and ad library · Rhenko" },
  description: "What advertisers may run on Rhenko, how each ad is labelled and why it is shown, and the campaigns that have run.",
}

// Drafted for legal review. The list of what may not be advertised is the policy. The app screens campaign text for some of it
// (lib/ad-rules.ts), and a person reviews every campaign before it runs. The text is not legal advice and is not final until
// it has been reviewed by a qualified lawyer for each place the service is offered.

const SECTIONS: LegalSection[] = [
  {
    id: "who",
    title: "Who can advertise",
    body: (
      <>
        <P>
          An advertising account belongs to one adult with a birthday on their Rhenko account, acting for a business or for themselves. The
          account holder must give the business name, the country the business is run from, and a contact email address, and must accept
          this policy. Accepting it is recorded with the time it was accepted.
        </P>
      </>
    ),
  },
  {
    id: "shown",
    title: "Who sees an ad, and why",
    body: (
      <>
        <P>
          Ads appear in the home feeds, about every {AD_EVERY} posts (sometimes {AD_EVERY + 1}). Ads are shown only to adults, 18 and over, and never to people who pay for
          Rhenko Plus. A campaign with a topic is shown only to people who follow that topic. No campaign uses anything else about a person:
          not their messages, their location, their contacts, or the posts they like. Ads never appear inside replies or threads.
        </P>
        <P>Every ad is labelled Ad, names the advertiser, and links to this page.</P>
      </>
    ),
  },
  {
    id: "not-allowed",
    title: "What may not be advertised",
    body: (
      <>
        <P>These are not allowed, whatever the wording or the country:</P>
        <List>
          <li>Gambling, betting, casino games, and sports betting.</li>
          <li>Real-money games and cash prize games.</li>
          <li>Crypto assets, tokens and similar products, including presales and NFTs.</li>
          <li>Trading, investing, forex and binary options, loans offered on the spot, and any promise of guaranteed returns.</li>
          <li>Political ads of any kind: anything about a candidate, an election, a referendum or a party, and any ad that asks people to vote.</li>
          <li>Products and services that are illegal where they would be seen, including weapons, drugs and unlicensed medicines.</li>
          <li>Health claims without evidence, and anything that misleads people about what a product does or costs.</li>
          <li>Adult content, and any ad aimed at children.</li>
          <li>Ads that impersonate a person, a company or a public body, or that copy another brand&apos;s identity.</li>
        </List>
        <P>
          The app screens the text of each campaign for the obvious cases. A person reads every campaign before it runs, and that review
          decides. We can reject a campaign or stop a running one at any time, and we tell the account holder why.
        </P>
      </>
    ),
  },
  {
    id: "money",
    title: "Paying for ads",
    body: (
      <>
        <P>
          Advertising is paid in advance. Money added to the account becomes a balance, and campaigns draw from it. A campaign is charged per
          thousand impressions at the rate shown in the ad library below, and it stops once its budget is spent. An impression is one person
          seeing one ad on one day; a second view of the same ad by the same person that day is not charged.
        </P>
        <P>
          Clicks are counted but not charged. The app does not record who clicked. Payments are taken by Stripe; Rhenko never sees a card
          number. Unspent balance can be requested back through the contact address on the{" "}
          <TextLink href="/legal">legal page</TextLink>, and the request is handled under the advertiser terms.
        </P>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changing and ending an ad",
    body: (
      <>
        <P>
          An advertiser can pause a running campaign and start it again. A rejected campaign shows the reason we gave, when we give one. Ended
          campaigns stay in the library below.
        </P>
      </>
    ),
  },
]

export default function AdsTransparencyPage() {
  return (
    <LegalPage
      title="Advertising"
      updated={LEGAL_UPDATED}
      intro="How ads work on Rhenko, what may be advertised, and the campaigns that have run."
      other={{ href: "/transparency", label: "Transparency figures for this server" }}
      sections={[
        ...SECTIONS,
        {
          id: "library",
          title: "Ad library",
          body: (
            <RevealSuspense>
              <Library />
            </RevealSuspense>
          ),
        },
      ]}
    />
  )
}

type LibraryRow = {
  headline: string
  body: string
  link_url: string
  topic: string | null
  status: string
  impressions: number
  business_name: string
  country: string
}

async function Library() {
  await connection()
  const rows = await all<LibraryRow>(
    `SELECT c.headline, c.body, c.link_url, c.topic, c.status, c.impressions, a.business_name, a.country
     FROM ad_campaigns c JOIN ad_accounts a ON a.id = c.account_id
     WHERE c.status IN ('active', 'paused', 'ended') AND a.status = 'active'
     ORDER BY c.reviewed_at DESC, c.created_at DESC LIMIT 200`
  )
  return (
    <div className="flex flex-col gap-4">
      <P>
        Rate: {formatMoney(cpmCents(), CURRENCY)} per thousand impressions. Shown to adults aged {MINIMUM_AGE} and over who do not pay for Plus.
      </P>
      <P>
        The library lists up to the 200 campaigns most recently reviewed. Campaigns from advertisers whose accounts are not active are left out.
      </P>
      {rows.length === 0 ? <P>No campaigns have run yet.</P> : null}
      <ul className="flex flex-col divide-y divide-border">
        {rows.map((row, index) => (
          <li key={index} className="flex flex-col gap-1 py-4">
            <p className="text-[14px] text-muted-foreground">
              {row.business_name} ({row.country}) · {row.status === "ended" ? "Ended" : row.status === "paused" ? "Paused" : "Running"} ·{" "}
              {row.impressions.toLocaleString("en")} impressions
            </p>
            <p className="text-[16px] font-semibold">{row.headline}</p>
            <p className="text-[15px]">{row.body}</p>
            <p className="text-[14px] text-muted-foreground">
              Links to {hostOf(row.link_url)}.{" "}
              {row.topic ? `Shown to people who follow #${row.topic}.` : "Shown to everyone who is eligible."}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
