import type { Metadata } from "next"
import { LegalPage, List, P, TextLink, type LegalSection } from "@/app/_legal/shell"
import { LEGAL_UPDATED } from "@/lib/legal"

export const metadata: Metadata = {
  title: { absolute: "Safety · Rhenko" },
  description: "How to report content, how to protect yourself, and who to contact in an emergency.",
}

// Helplines change. Check each number and link before launch, and again every year. Numbers are for the country named.
const HELPLINES = [
  { place: "United States", line: "Call or text 988 for crisis support, any time.", emergency: "911" },
  { place: "United Kingdom", line: "Samaritans: 116 123, free, any time.", emergency: "999 (or 112)" },
  { place: "Australia", line: "Lifeline: 13 11 14, any time.", emergency: "000" },
  { place: "India", line: "Tele-MANAS: 14416 or 1-800-891-4416, free, any time.", emergency: "112" },
]

const SECTIONS: LegalSection[] = [
  {
    id: "report",
    title: "Report a post",
    body: (
      <>
        <P>
          Open the menu on any post and choose Report post. You pick the reason. A report goes to a person who runs the server, and the
          report&apos;s outcome is shown to you in <TextLink href="/notices">Notices</TextLink>.
        </P>
        <P>
          Some reports are acted on at once. A report of an intimate image shared without consent hides the post while it is
          reviewed.
        </P>
      </>
    ),
  },
  {
    id: "notice",
    title: "Send a notice about content",
    body: (
      <>
        <P>
          If you are not a member, or you need to give a formal notice (for example a copyright owner, someone pictured in an
          image, a parent, a lawyer, or someone acting for an authority), use the <TextLink href="/notice">notice form</TextLink>.
          It asks for what the law needs for each kind of notice. You get a reference by email straight away, and an email with the
          decision.
        </P>
      </>
    ),
  },
  {
    id: "urgent",
    title: "Child sexual abuse or someone in danger",
    body: (
      <>
        <P>
          If a child is being harmed, or someone is in immediate danger, call your local emergency number first. Then report
          what you have seen to the police or child protection authority where the child is. Do not share or save the material
          itself.
        </P>
        <List>
          <li>
            Child sexual abuse material can also be reported to the Internet Watch Foundation (report.iwf.org.uk) in the UK, to
            NCMEC&apos;s CyberTipline (report.cybertip.org) in the US, and to the eSafety Commissioner (esafety.gov.au/report) in
            Australia.
          </li>
          <li>In India, cybercrime can be reported at cybercrime.gov.in, or by calling 1930 for online financial fraud.</li>
        </List>
      </>
    ),
  },
  {
    id: "help",
    title: "If you are struggling",
    body: (
      <>
        <P>
          If you are thinking about harming yourself, or someone else is at risk, contact a person now. You do not need to be in
          crisis to call.
        </P>
        <List>
          {HELPLINES.map((item) => (
            <li key={item.place}>
              <strong className="font-semibold">{item.place}.</strong> {item.line} In an emergency, call {item.emergency}.
            </li>
          ))}
        </List>
        <P>Outside these places, search for the helpline in your country, or ask a local friend, family member or doctor.</P>
      </>
    ),
  },
  {
    id: "protect",
    title: "Protect yourself",
    body: (
      <List>
        <li>
          <strong className="font-semibold">Protect your posts</strong> so that only followers you approve can see them.
        </li>
        <li>
          <strong className="font-semibold">Block or mute</strong> accounts and words that you do not want to hear from, in Settings,
          under Privacy and safety.
        </li>
        <li>
          <strong className="font-semibold">Check your sessions</strong> in Settings, under Security. End any you do not
          recognise, and turn on two-factor sign-in.
        </li>
        <li>
          <strong className="font-semibold">Think before you share</strong> a photo&apos;s location, a home address or a
          phone number. Once posted, others can copy it.
        </li>
      </List>
    ),
  },
  {
    id: "appeal",
    title: "If something of yours was hidden",
    body: (
      <P>
        You are told why, and you can appeal from <TextLink href="/notices">Notices</TextLink> within the time shown there. The{" "}
        <TextLink href="/terms">Terms of Service</TextLink> explain the whole process.
      </P>
    ),
  },
]

export default function SafetyPage() {
  return (
    <LegalPage
      title="Safety"
      updated={LEGAL_UPDATED}
      intro="How to report content, how to protect yourself, and who to contact in an emergency or when you are struggling."
      sections={SECTIONS}
      other={{ href: "/rules", label: "Read the Community Rules" }}
    />
  )
}
