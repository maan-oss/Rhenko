import type { Metadata } from "next"
import { LegalPage, List, P, TextLink, type LegalSection } from "@/app/_legal/shell"
import { NoticeForm } from "@/components/app/notice-form"
import { LEGAL_UPDATED, URGENT_KINDS, NOTICE_KINDS } from "@/lib/legal"

export const metadata: Metadata = {
  title: { absolute: "Send a notice · Rhenko" },
  description: "Tell the operator about content that breaks the law or the rules. You do not need an account.",
}

const URGENT = NOTICE_KINDS.filter((kind) => URGENT_KINDS.has(kind.id)).map((kind) => kind.label.toLowerCase())

const SECTIONS: LegalSection[] = [
  {
    id: "form",
    title: "The notice",
    body: <NoticeForm />,
  },
  {
    id: "before",
    title: "Before you send one",
    body: (
      <>
        <P>
          A notice is read by a person who runs this server. We review it against the law and the{" "}
          <TextLink href="/rules">Community Rules</TextLink>, and we tell you what we decided and why.
        </P>
        <List>
          <li>
            {URGENT.join(" and ").replace(/^./, (c) => c.toUpperCase())} are hidden as soon as the notice arrives, while we review
            it. Everything else is reviewed first.
          </li>
          <li>
            Only send a notice you believe is accurate. A notice that is knowingly false can make you liable for damages.
          </li>
          <li>
            If you are in danger, or a child is being harmed, call your local emergency number first. See <TextLink href="/safety">Safety</TextLink>.
          </li>
          <li>
            Copyright owners: the <TextLink href="/copyright">copyright process</TextLink> explains what the notice must say.
          </li>
        </List>
      </>
    ),
  },
]

export default function NoticePage() {
  return (
    <LegalPage
      title="Send a notice"
      updated={LEGAL_UPDATED}
      intro="Tell the operator about content that breaks the law or the Community Rules. You do not need an account, and you will get a reference straight away."
      sections={SECTIONS}
      other={{ href: "/legal", label: "All legal documents" }}
    />
  )
}
