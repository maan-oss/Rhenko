import type { Metadata } from "next"
import { B, LegalPage, List, P, TextLink, type LegalSection } from "@/app/_legal/shell"
import { LEGAL_UPDATED } from "@/lib/legal"
import { REPORT_REASONS } from "@/lib/rules"

export const metadata: Metadata = {
  title: { absolute: "Community Rules · Rhenko" },
  description: "What is not allowed on Rhenko, and what happens when someone breaks a rule.",
}

// These rules sit under the Terms of Service. Where the law of a place forbids something the rules do not mention, the
// law applies there too.

const SECTIONS: LegalSection[] = [
  {
    id: "child-abuse",
    title: "Child sexual abuse",
    body: (
      <>
        <P>
          Child sexual abuse material is not allowed, in any form, including drawings, cartoons and AI-generated images. Nor is
          content that sexualises a child, or that invites contact with a child for sexual reasons.
        </P>
        <P>
          Such content is hidden as soon as a notice about it arrives, and it is reported to the authorities the law requires, such as the
          National Center for Missing &amp; Exploited Children in the US and the National Crime Agency in the UK. Do not save or
          forward it to show someone else. <TextLink href="/safety">The safety page</TextLink> says how to report it.
        </P>
      </>
    ),
  },
  {
    id: "intimate",
    title: "Intimate images",
    body: (
      <>
        <P>
          Do not share intimate photos or videos of someone without their consent. That includes images made or changed with AI
          to look like someone is nude or sexual, and threats to share them.
        </P>
        <P>
          A report of this kind hides the post at once. Where the law sets a deadline for removing this kind of content, the operator
          keeps to it.
        </P>
      </>
    ),
  },
  {
    id: "violence",
    title: "Violence and threats",
    body: (
      <List>
        <li>No threats to hurt someone, or their family, home or animals.</li>
        <li>No content that glorifies or celebrates violence against people or animals, or that tells others how to carry it out.</li>
        <li>No support for terrorism or for violent extremist groups, or content that recruits for them.</li>
      </List>
    ),
  },
  {
    id: "harassment",
    title: "Harassment and abuse",
    body: (
      <List>
        <li>No targeting someone with repeated insults, humiliation, or unwanted contact.</li>
        <li>No pile-ons: encouraging others to attack a person.</li>
        <li>No hateful conduct: attacks on people because of their race, ethnicity, religion, caste, nationality, sex, gender identity, sexual orientation, disability or serious illness.</li>
      </List>
    ),
  },
  {
    id: "privacy",
    title: "Private information",
    body: (
      <P>
        Do not post someone&apos;s home address, phone number, email address, identity or account numbers, medical records, or
        their location in order to expose or harm them, without their consent. Where a person is at risk, report it: we act on
        it.
      </P>
    ),
  },
  {
    id: "impersonation",
    title: "Impersonation and badges",
    body: (
      <>
        <P>
          Do not pretend to be another person, a brand, a public body or a business. Parody and commentary are allowed when they are
          clearly marked and cannot be mistaken for the real thing. Do not show a badge you do not have.
        </P>
        <List>
          <li>
            <B>Verified</B> (a dusk check) is given by the operator to accounts it has confirmed. Paying does not give it, and it cannot be
            bought.
          </li>
          <li>
            <B>Paid subscriber</B> (a ring) shows that a person pays for a subscription. It says nothing about who they are, and Rhenko has
            not checked it.
          </li>
          <li>
            <B>Protected</B> (a lock) means that only followers can see the account&apos;s posts.
          </li>
        </List>
      </>
    ),
  },
  {
    id: "spam",
    title: "Spam, scams and manipulation",
    body: (
      <List>
        <li>No spam: mass unsolicited posts, replies or messages, or repeated links that exist only to earn clicks.</li>
        <li>No scams, phishing or fraud, including fake giveaways, fake investment offers and fake support pages.</li>
        <li>No fake engagement: buying or swapping likes, reposts or followers, or running networks of accounts to push a message.</li>
        <li>
          No misleading ads. Advertising is governed by the <TextLink href="/transparency/ads">advertising policy</TextLink>, and every
          ad is labelled.
        </li>
      </List>
    ),
  },
  {
    id: "paid",
    title: "Paid features do not buy reach",
    body: (
      <P>
        Nobody can pay to have a post ranked higher, shown to more people, or pushed into a feed. Paid features change what you can do
        and see, not how far a post goes. The home feeds are ordered by time, as the{" "}
        <TextLink href="/transparency">transparency page</TextLink> explains. Authors can hide the like, repost, quote, reply and view
        counts on their own posts, and then no one else sees them.
      </P>
    ),
  },
  {
    id: "illegal",
    title: "Illegal activity",
    body: (
      <List>
        <li>No selling or arranging illegal goods or services, including weapons, drugs and stolen property.</li>
        <li>No instructions for crimes, or sharing malware or tools to break into accounts or systems.</li>
        <li>No content that the law where the server runs forbids. When an order requires removal, the operator removes the content and tells the author why, where the law allows.</li>
      </List>
    ),
  },
  {
    id: "self-harm",
    title: "Self-harm and suicide",
    body: (
      <P>
        Do not encourage self-harm, suicide, or eating disorders, and do not share methods. If you are worried about someone, or
        about yourself, <TextLink href="/safety">the safety page</TextLink> lists people to contact now.
      </P>
    ),
  },
  {
    id: "copyright",
    title: "Copyright",
    body: (
      <P>
        Post only what you have the right to share. If someone copies your work, use the{" "}
        <TextLink href="/copyright">copyright notice process</TextLink>.
      </P>
    ),
  },
  {
    id: "reports",
    title: "Reporting and what happens next",
    body: (
      <>
        <P>
          Use Report post in the menu of any post. You choose one reason: {REPORT_REASONS.join(", ").replace(/, ([^,]+)$/, ", or $1")}. A report is
          read by a person who runs the server. Choosing Intimate image without consent hides the post at once.
        </P>
        <P>
          An ad can be reported from the ad itself, with the reason. Reports about ads are read by the people who review advertising. The
          advertiser is not told who reported it.
        </P>
        <P>
          When a post breaks these rules, we hide it and tell the author why. The author can appeal. The full process is in the{" "}
          <TextLink href="/terms">Terms of Service</TextLink>.
        </P>
        <P>
          <B>Be honest when you report.</B> A report that is knowingly false is itself a breach of these rules.
        </P>
      </>
    ),
  },
]

export default function RulesPage() {
  return (
    <LegalPage
      title="Community Rules"
      updated={LEGAL_UPDATED}
      intro="These rules say what is not allowed on Rhenko and why. They sit under the Terms of Service, and apply to posts, replies, messages, photos, videos and profiles."
      sections={SECTIONS}
      other={{ href: "/terms", label: "Read the Terms of Service" }}
    />
  )
}
