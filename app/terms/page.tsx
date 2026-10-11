import type { Metadata } from "next"
import { OperatorContact, OperatorLines, OperatorValue, OperatorWho } from "@/app/_legal/operator"
import { B, LegalPage, List, Note, P, TextLink, type LegalSection } from "@/app/_legal/shell"
import { LEGAL_UPDATED, MINIMUM_AGE, APPEAL_DAYS } from "@/lib/legal"
import { HANDLE_MAX, HANDLE_MIN, MIN_PASSWORD } from "@/lib/rules"

export const metadata: Metadata = {
  title: { absolute: "Terms of Service · Rhenko" },
  description: "The agreement for using Rhenko, and what happens when a rule is broken.",
}

// These terms describe what the software does and what the operator of a server may do. They are not legal advice.
// Whoever runs a server needs a lawyer in each place the server serves people to check them before launch.
// LEGAL_UPDATED and TERMS_VERSION in lib/legal.ts change whenever the text changes, and every account must agree again.

const SUMMARY = (
  <Note title="The short version">
    <List>
      <li>
        You must be {MINIMUM_AGE} or older. Rhenko is not for anyone younger, and sign-up refuses them.
      </li>
      <li>You own what you post. You give the operator permission to host and show it, and nothing more.</li>
      <li>
        Do not post what the <TextLink href="/rules">Community Rules</TextLink> forbid, or what the law where you are or where
        the server runs forbids.
      </li>
      <li>
        If a post is hidden, we tell you why. You can appeal within {APPEAL_DAYS} days, from Notices.
      </li>
      <li>You can delete your account whenever you like.</li>
    </List>
  </Note>
)

const SECTIONS: LegalSection[] = [
  {
    id: "operator",
    title: "Operator",
    body: (
      <>
        <OperatorWho />
        <P>
          The operator runs the server, is responsible for what is stored on it, and is the party you agree these terms with.
        </P>
        <OperatorLines
          items={[
            { which: "address", label: "Address", max: 300 },
            { which: "hosting", label: "Where the server is hosted" },
          ]}
        />
      </>
    ),
  },
  {
    id: "eligibility",
    title: "Who can use Rhenko",
    body: (
      <List>
        <li>
          You must be at least {MINIMUM_AGE}. Sign-up asks for your date of birth and refuses anyone younger. If we learn that an
          account belongs to someone under {MINIMUM_AGE}, we will close it.
        </li>
        <li>Give accurate details when you sign up, and keep them up to date.</li>
        <li>Use the service only if the law where you live allows you to.</li>
      </List>
    ),
  },
  {
    id: "account",
    title: "Your account",
    body: (
      <List>
        <li>
          Your handle belongs to you alone. It has {HANDLE_MIN} to {HANDLE_MAX} letters, numbers or underscores, and you can change
          it in Settings, under Account.
        </li>
        <li>
          Your password has at least {MIN_PASSWORD} characters. Keep it private: you are responsible for what is done through your
          account. Settings, under Security, has two-factor sign-in and the list of devices signed in to your account.
        </li>
        <li>Do not impersonate another person or organisation, or use a handle that suggests you are them.</li>
      </List>
    ),
  },
  {
    id: "content",
    title: "Your content",
    body: (
      <>
        <P>
          You own what you post. By posting, you give the operator a licence to host it, copy it (for example into backups),
          show it to the people who can see it under your settings, and make the technical changes the service needs, such as
          resizing a photo. The licence lasts while the content is on the service and ends when you delete it, except that a
          copy can remain in backups until they are replaced.
        </P>
        <P>
          Rhenko does not use your posts to train AI models. The operator does not sell your content.
        </P>
        <P>
          You confirm that you have the rights to what you post. You are responsible for it, including for the people and works
          it shows.
        </P>
        <P>
          Who can see what you post depends on your settings and on the post itself. <TextLink href="/privacy#visibility">The
          Privacy Policy explains it</TextLink>.
        </P>
      </>
    ),
  },
  {
    id: "rules",
    title: "Community Rules",
    body: (
      <>
        <P>
          The <TextLink href="/rules">Community Rules</TextLink> say what is not allowed here: child sexual abuse material,
          intimate images shared without consent, threats, harassment, impersonation, spam, scams, private information shared
          without consent, and more. They apply on top of the law. Where the law of a place is stricter than a rule, the law is what
          applies there.
        </P>
        <P>
          The operator may hide or remove content, and suspend or close accounts, that break these terms, the Rules or the law.
        </P>
      </>
    ),
  },
  {
    id: "enforcement",
    title: "When a rule is broken",
    body: (
      <>
        <P>
          When we hide something, the author gets a notice the same day. It says what was hidden, the category of the rule or law
          it breaks, the reason, and when the appeal window closes. Nothing is deleted at that point.
        </P>
        <List>
          <li>
            <B>Hidden content</B> disappears from feeds, profiles and searches for everyone else at once, with its replies.
          </li>
          <li>
            <B>Notices about the most serious kinds</B>, such as intimate images shared without consent and child sexual abuse
            material, hide the post as soon as the notice arrives, before a person reviews it. A person reviews it afterwards.
          </li>
          <li>
            <B>Appeals</B> are made from Notices within {APPEAL_DAYS} days. A person reads each appeal and decides it. If the
            appeal succeeds, the post goes back as it was.
          </li>
          <li>
            <B>Deletion.</B> If you do not appeal in time, or the appeal is decided against you, the hidden content and its files are
            deleted.
          </li>
          <li>
            <B>Repeat breaches</B> can lead to an account being suspended or closed. We tell you when that happens and why.
          </li>
        </List>
        <P>
          Where a law requires a faster step, for example a removal order from an authority, the operator follows it. The notice
          you receive says so.
        </P>
      </>
    ),
  },
  {
    id: "complaints",
    title: "Complaints and disputes",
    body: (
      <>
        <P>
          If you think a decision is wrong, appeal it first. If the appeal is refused and you still disagree, write to the
          operator. <OperatorValue which="grievanceEmail" missing="The operator has not yet published a complaints address." email />
          {" "}You can also use the <TextLink href="/notice">notice form</TextLink> to tell us about content.
        </P>
        <P>
          Where the EU Digital Services Act applies to this service, you may take a decision on a complaint to an out-of-court
          dispute settlement body certified under Article 21 of that Act. Your rights under consumer law in your country are not
          affected by this.
        </P>
      </>
    ),
  },
  {
    id: "copyright",
    title: "Copyright",
    body: (
      <P>
        If you believe something on Rhenko copies your work, use the <TextLink href="/copyright">copyright notice process</TextLink>.
        Accounts that repeatedly post infringing material can be closed.
      </P>
    ),
  },
  {
    id: "availability",
    title: "The service",
    body: (
      <>
        <P>
          Rhenko is provided as it is and as it is available. The operator does not promise that it will always be online, that
          it will suit a particular purpose, or that it will never lose data. Backups are made where the operator makes them.
        </P>
        <P>
          The operator may change or stop features. Where it stops the whole service, it will tell you in advance, when that is
          possible, and give you a way to download your data.
        </P>
      </>
    ),
  },
  {
    id: "liability",
    title: "Liability",
    body: (
      <>
        <P>
          To the extent the law allows, the operator is not responsible for what other people post, and is not liable for losses
          that come from the service being unavailable or from content posted by others.
        </P>
        <P>
          Nothing in these terms excludes or limits a right you have under a law that cannot be excluded. This includes the
          consumer guarantees in Australia, the UK Consumer Rights Act 2015, consumer law in the EU and its member states, and
          India&apos;s Consumer Protection Act 2019. Where those laws apply, they apply.
        </P>
      </>
    ),
  },
  {
    id: "law",
    title: "Governing law",
    body: (
      <>
        <P>
          These terms are governed by the law of <OperatorValue which="governingLaw" missing="the place the operator has chosen, which it has not yet published" />.
        </P>
        <P>
          If you use Rhenko as a consumer, you can also bring a claim in the courts of the country where you live.
        </P>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes",
    body: (
      <P>
        When these terms change in a way that matters, the date at the top of the page changes, and you are asked to agree to the
        new version before you use Rhenko again. Carrying on without agreeing is not possible. The{" "}
        <TextLink href="/privacy">Privacy Policy</TextLink> changes the same way.
      </P>
    ),
  },
  {
    id: "ending",
    title: "Ending your use",
    body: (
      <>
        <P>
          You can deactivate or delete your account in Settings, under Account. Deleting an account deletes your posts, messages,
          photos and videos. Some records are kept as the Privacy Policy describes, for example notices about content.
        </P>
        <P>
          The operator can suspend or close an account that breaks these terms, and will tell the account holder why, unless the
          law forbids it.
        </P>
      </>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <OperatorContact
        about="Questions about these terms go to the operator."
        without="Until an address is published, the in-app notices and appeals are the way to raise a decision."
      />
    ),
  },
]

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated={LEGAL_UPDATED}
      intro="These terms are the agreement between you and the operator of this Rhenko server. Read them before you use Rhenko. They explain what you can post, how decisions about content are made and reviewed, and what each side can do."
      summary={SUMMARY}
      sections={SECTIONS}
      other={{ href: "/privacy", label: "Read the Privacy Policy" }}
    />
  )
}
