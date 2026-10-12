import type { Metadata } from "next"
import Link from "next/link"
import { LegalPage, P, type LegalSection } from "@/app/_legal/shell"
import { LEGAL_UPDATED } from "@/lib/legal"

export const metadata: Metadata = {
  title: { absolute: "Legal · Rhenko" },
  description: "Every rule, policy and form that applies to Rhenko, in one place.",
}

const DOCUMENTS = [
  { href: "/terms", title: "Terms of Service", text: "The agreement for using Rhenko, and how decisions about content are made and appealed." },
  { href: "/privacy", title: "Privacy Policy", text: "What is stored, why, who sees it, how long it is kept, and your rights." },
  { href: "/rules", title: "Community Rules", text: "What is not allowed on Rhenko, and how to report it." },
  { href: "/copyright", title: "Copyright", text: "How to tell us about a copy of your work, and how to answer a notice." },
  { href: "/safety", title: "Safety", text: "How to report, how to protect yourself, and who to contact in an emergency." },
  { href: "/transparency", title: "Transparency", text: "How many reports, notices and decisions there have been on this server, and how the feeds are ordered." },
  { href: "/transparency/ads", title: "Advertising", text: "What advertisers may run, who sees an ad and why, what it costs, and every campaign that has run." },
  { href: "/notice", title: "Send a notice", text: "A formal notice about content: copyright, intimate images, child abuse, impersonation, privacy or other illegal content." },
]

const SECTIONS: LegalSection[] = [
  {
    id: "documents",
    title: "Documents",
    body: (
      <ul className="flex flex-col gap-3">
        {DOCUMENTS.map((document) => (
          <li key={document.href}>
            <Link
              href={document.href}
              className="flex flex-col gap-1 rounded-2xl border border-border p-4 transition-colors hover:bg-foreground/5"
            >
              <span className="text-[15px] font-semibold">{document.title}</span>
              <span className="text-sm leading-relaxed text-muted-foreground">{document.text}</span>
            </Link>
          </li>
        ))}
      </ul>
    ),
  },
  {
    id: "about",
    title: "Before you start",
    body: (
      <P>
        These documents describe the software and the rules of this server. Whoever runs the server is named in the Terms and in
        the Privacy Policy. Each document shows the date it was last changed.
      </P>
    ),
  },
]

export default function LegalIndexPage() {
  return (
    <LegalPage
      title="Legal"
      updated={LEGAL_UPDATED}
      intro="Every document that applies to Rhenko, and the forms for telling us about content."
      sections={SECTIONS}
      other={{ href: "/", label: "Back to Rhenko" }}
    />
  )
}
