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
          <li>Your full name and a way to contact you: an email address, and a postal address if you have one.</li>
          <li>The copyrighted work you say is being copied, and where you own it.</li>
          <li>The address (link) of the material on Rhenko that you say infringes it.</li>
          <li>A statement that you believe in good faith that the use is not authorised by you, your agent or the law.</li>
          <li>A confirmation that the information in the notice is accurate, and that you are the owner or authorised to act for the owner. The form asks you to confirm this. It does not ask for a statement under penalty of perjury.</li>
          <li>Your signature, physical or electronic.</li>
        </List>
        <P>
          A notice that leaves out these things may not be acted on.
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
          If your post was hidden because of a copyright notice, you can appeal from <TextLink href="/notices">Notices</TextLink>. The appeal asks for a reason of at least 10 characters. A counter-notice under the copyright law also needs the following, which the appeal form does not ask for:
        </P>
        <List>
          <li>Your name, address and phone number, or an email address.</li>
          <li>A statement, under penalty of perjury, that you believe the material was removed by mistake or misidentification.</li>
          <li>A statement that you consent to the jurisdiction of the courts where you live, or where the operator is based.</li>
          <li>Your signature.</li>
        </List>
        <P>
          An operator puts the post back by hand. Where the law sets a time limit for doing so after a counter-notice, the operator keeps to it, unless the person who sent the notice tells us a court case has started.
        </P>
      </>
    ),
  },
  {
    id: "repeat",
    title: "Repeat infringers",
    body: (
      <P>
        Accounts that repeatedly post material that is found to infringe copyright are closed. The operator keeps a record of
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
