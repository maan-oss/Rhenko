import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { PageHeader } from "@/components/app/page-header"

const SECTIONS = [
  { href: "/settings/account", title: "Account", hint: "Handle, date of birth, your data, deactivating or deleting" },
  { href: "/settings/security", title: "Security", hint: "Password, two-factor sign-in, signed-in devices" },
  { href: "/settings/privacy", title: "Privacy and safety", hint: "Protected posts, blocked and muted people, muted words" },
  { href: "/settings/notifications", title: "Notifications", hint: "Choose which activity reaches you" },
  { href: "/settings/display", title: "Display", hint: "Theme, text size and keyboard shortcuts" },
]

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <ul className="list-none">
        {SECTIONS.map((section) => (
          <li key={section.href} className="border-b border-border">
            <Link href={section.href} className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-muted/50">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[17px] font-semibold">{section.title}</span>
                <span className="text-sm text-muted-foreground">{section.hint}</span>
              </span>
              <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
