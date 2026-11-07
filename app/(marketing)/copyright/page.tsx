import type { Metadata } from "next"
import { OperatorValue } from "@/app/_legal/operator"
import { B, LegalPage, List, P, TextLink, type LegalSection } from "@/app/_legal/shell"
import { LEGAL_UPDATED } from "@/lib/legal"

export const metadata: Metadata = {
  title: { absolute: "Copyright · Rhenko" },
  description: "How to tell Rhenko that something copies your work, and how to answer a notice about your own post.",
}

// The process follows the US Digital Millennium Copyright Act, section 512, and applies the same way to notices from
// other countries. The operator has to register a designated agent with the US Copyright Office for the safe harbour to
// apply; the page shows the agent details the operator has set.

const SECTIONS: LegalSection[] = [
  {
    id: "notice",
    title: "Send a copyright notice",
    body: (
      <>
        <P>
          Send your notice through the <TextLink href="/notice">notice form</TextLink>, choosing Copyright infringement, or write
          to the designated agent below. A notice must include:
        </P>
        <List>
          <li>Your full name, an email address where we can reply, and a postal address where the owner or their agent can be reached.</li>
          <li>A telephone number the owner or their agent can call.</li>
          <li>The copyrighted work you say is being copied, and where you own it.</li>
          <li>The address (link) of the material on Rhenko that you say infringes it.</li>
          <li>A statement that you believe in good faith that the use is not authorised by you, your agent or the law.</li>
          <li>A confirmation that the information in the notice is accurate.</li>
          <li>
            A statement, under penalty of perjury, that you are the owner of the work or are authorised to act for its owner.
          </li>
          <li>Your signature, typed as your full name.</li>
        </List>
        <P>
          A notice that leaves out these things is not accepted, and the form says what is missing. We do not hide the post for a
          copyright notice until a person has reviewed it.
        </P>
      </>
    ),
  },
  {
    id: "agent",
    title: "Designated agent",
    body: (
      <List>
        <li>
          <B>Name:</B> <OperatorValue which="copyrightAgent" missing="not yet published" />
        </li>
        <li>
          <B>Email:</B> <OperatorValue which="copyrightEmail" missing="not yet published" email />
        </li>
        <li>
          <B>Address:</B> <OperatorValue which="copyrightAddress" missing="not yet published" max={300} />
        </li>
      </List>
    ),
  },
  {
    id: "what-happens",
    title: "What happens to the post",
    body: (
      <>
        <P>
          When a notice meets the requirements, we review it. If we act on it, we hide the post and tell the author the category
          and the reason. We do not pass the notice or your details to the author, and the author can appeal from Notices.
        </P>
        <P>
          You are told what we decided, and why. If an appeal puts the post back, the operator emails you the decision.
        </P>
      </>
    ),
  },
  {
    id: "counter",
    title: "If your post was hidden",
    body: (
      <>
        <P>
          If your post was hidden because of a copyright notice, you can do one of two things from <TextLink href="/notices">Notices</TextLink>.
          You can appeal, giving a reason of at least 10 characters, and a person decides the appeal. Or you can send a counter-notice.
          Once you have sent one, the appeal option for that post goes away, and the other way round.
        </P>
        <P>A counter-notice asks for:</P>
        <List>
          <li>
            Your full name, postal address and telephone number. We send these to the person who sent the copyright notice, as the law requires.
          </li>
          <li>
            A statement, under penalty of perjury, that you believe the post was removed by mistake or because it was misidentified.
          </li>
          <li>
            Your consent to the jurisdiction of the federal district court for your address, and your agreement to accept legal papers
            from the person who sent the notice.
          </li>
          <li>Your signature, typed as your full name.</li>
        </List>
        <P>
          We send the full counter-notice to the person who sent the copyright notice. The post goes back no sooner than 10 and no
          later than 14 business days after that person receives it, unless they tell us they have started a court action to stop you
          from posting the material. If they do, the post stays hidden while the court decides.
        </P>
        <P>
          Business days leave out weekends and US federal public holidays. The dates for your post are shown in Notices once you have
          sent the counter-notice.
        </P>
      </>
    ),
  },
  {
    id: "repeat",
    title: "Repeat infringers",
    body: (
      <P>
        Each upheld copyright notice against an account counts for 12 months. When an account has three upheld notices in that time,
        the operator reviews it and closes the account if the review finds repeated infringement. The operator keeps a record of
        these decisions in the notices that are kept for three years.
      </P>
    ),
  },
  {
    id: "misuse",
    title: "Notices in bad faith",
    body: (
      <P>
        A notice sent knowing that it is false can make the sender liable for damages, and can be reported as a breach of these
        rules. If you are not sure whether you own the work, talk to a lawyer before you send a notice.
      </P>
    ),
  },
]

export default function CopyrightPage() {
  return (
    <LegalPage
      title="Copyright"
      updated={LEGAL_UPDATED}
      intro="How to tell Rhenko that a post copies your work, and how an author can answer a notice about their own post."
      sections={SECTIONS}
      other={{ href: "/legal", label: "All legal documents" }}
    />
  )
}
