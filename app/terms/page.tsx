import type { Metadata } from "next"
import { OperatorContact, OperatorWho } from "@/app/_legal/operator"
import { B, LegalPage, List, P, TextLink, type LegalSection } from "@/app/_legal/shell"
import { HANDLE_MAX, HANDLE_MIN, MIN_PASSWORD, REPORT_REASONS } from "@/lib/rules"

export const metadata: Metadata = {
  title: { absolute: "Terms of Service · Rhenko" },
  description: "The rules for using Rhenko on this server.",
}

// These terms describe what Rhenko does and what the operator of a server may do. They are not legal advice: whoever
// runs a server should have them reviewed for the place where they run it. Change UPDATED whenever the text changes.
const UPDATED = "11 October 2026"

function andList(items: readonly string[]): string {
  if (items.length < 2) return items.join("")
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`
}

const SECTIONS: LegalSection[] = [
  {
    id: "operator",
    title: "Operator",
    body: (
      <>
        <OperatorWho />
        <P>The operator is responsible for this server and for what is stored on it. These terms are between you and the operator.</P>
      </>
    ),
  },
  {
    id: "account",
    title: "Your account",
    body: (
      <List>
        <li>You must be at least 13. Sign-up asks for your date of birth and refuses anyone younger. Only you can see it.</li>
        <li>
          Your handle belongs to you alone. It has {HANDLE_MIN} to {HANDLE_MAX} letters, numbers or underscores, and you can change
          it in Settings, under Account.
        </li>
        <li>
          Your password has at least {MIN_PASSWORD} characters. Keep it private: you are responsible for what is done through your
          account. Settings, under Security, has two-factor sign-in and the list of devices signed in to your account.
        </li>
      </List>
    ),
  },
  {
    id: "content",
    title: "Your content",
    body: (
      <>
        <P>
          You own what you post. By posting, you allow the operator to store it, to copy it (for example into backups) and to show
          it to the people who can see it. That permission ends when you delete the content, except that a copy can remain in older
          backups until they are replaced.
        </P>
        <P>
          You are responsible for what you post. Who can see it depends on your settings and on the post:{" "}
          <TextLink href="/privacy#visibility">the Privacy Policy explains who can see what</TextLink>.
        </P>
      </>
    ),
  },
  {
    id: "rules",
    title: "Rules",
    body: (
      <>
        <P>Do not use Rhenko to:</P>
        <List>
          <li>break the law;</li>
          <li>threaten, harass or abuse anyone;</li>
          <li>post spam, scams or the same thing over and over;</li>
          <li>pretend to be someone else, or deceive people about who you are;</li>
          <li>post sexual content that involves children;</li>
          <li>
            get around the limits on signing in, posting or messaging, overload the service, or collect other people&apos;s data in
            bulk;
          </li>
          <li>use an account that is not yours.</li>
        </List>
        <P>
          When you post photos or videos that people should not see without a warning, use <B>Mark media as sensitive</B>. Everyone
          except you then sees a warning first and chooses whether to look.
        </P>
      </>
    ),
  },
  {
    id: "messages",
    title: "Messages",
    body: (
      <>
        <P>The rules above apply to messages too.</P>
        <List>
          <li>
            A message from someone you do not follow arrives as a request, and you can accept or decline it. Being added to a group
            works the same way. Blocking someone stops them from messaging you.
          </li>
          <li>
            Messages are not end-to-end encrypted, so the operator can technically read them.{" "}
            <TextLink href="/privacy#messages">The Privacy Policy</TextLink> says how they are stored and when they are deleted.
          </li>
          <li>
            You can delete your own messages, which erases the text and any photo for everyone in the conversation. You cannot
            delete other people&apos;s messages, but you can leave a conversation whenever you like.
          </li>
        </List>
      </>
    ),
  },
  {
    id: "reports",
    title: "Reports",
    body: (
      <>
        <P>
          Every post has a <B>Report post</B> option. The reasons you can give are {andList(REPORT_REASONS)}.
        </P>
        <P>
          The operator reads reports and can remove a post together with the replies under it. A person handles each report, so
          there is no promised response time, and neither the reporter nor the author is sent a notice of the outcome. The operator
          may remove content that breaks these terms, and may close accounts that break them seriously or repeatedly.
        </P>
        <P>
          You can also protect your posts, block accounts, and mute accounts or words yourself, in Settings, under Privacy and
          safety.
        </P>
      </>
    ),
  },
  {
    id: "leaving",
    title: "Leaving",
    body: (
      <>
        <P>You can leave at any time, from Settings, under Account.</P>
        <List>
          <li>
            <B>Deactivate account</B> hides your profile and posts and signs you out everywhere. Log in again and everything is
            back.
          </li>
          <li>
            <B>Delete account</B> permanently removes your profile, your posts and the replies under them, the messages you sent,
            and your photos and videos. It cannot be undone, so download your data first if you want a copy.
          </li>
        </List>
      </>
    ),
  },
  {
    id: "service",
    title: "The service",
    body: (
      <P>
        Rhenko is provided as it is. The operator does not promise that it will always be available, and it can change or stop.
        Download your data now and then so that you keep a copy of your own. As far as the law allows, the operator is not liable
        for loss caused by the service being unavailable or by what other people post.
      </P>
    ),
  },
  {
    id: "changes",
    title: "Changes",
    body: (
      <P>
        When these terms change, the date at the top of this page changes. If you keep using Rhenko after that, the new terms apply
        to you.
      </P>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <OperatorContact
        about="Questions about these terms, and anything the Report post option does not cover, go to the operator."
        without="Until an address is published, use Report post on any post that breaks the rules."
      />
    ),
  },
]

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated={UPDATED}
      intro="These are the rules for using Rhenko on this server. By creating an account or using Rhenko, you agree to them."
      sections={SECTIONS}
      other={{ href: "/privacy", label: "Read the Privacy Policy" }}
    />
  )
}
