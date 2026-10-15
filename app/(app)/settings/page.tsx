import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { SettingsLogout } from "@/components/app/account-menu"
import { PageHeader } from "@/components/app/page-header"

// Settings is a list of sections. Each section is its own page, so no page is one long scroll.
const SECTIONS = [
  { href: "/settings/appearance", title: "Appearance" },
  { href: "/settings/account", title: "Account" },
  { href: "/settings/about", title: "About you" },
  { href: "/settings/connections", title: "Connections and languages" },
  { href: "/settings/security", title: "Security" },
  { href: "/settings/privacy", title: "Privacy and safety" },
  { href: "/notices", title: "Notices and appeals" },
  { href: "/legal", title: "Legal" },
  { href: "/settings/notifications", title: "Notifications" },
  { href: "/settings/billing", title: "Subscriptions and tips" },
  { href: "/advertise", title: "Advertising" },
  { href: "/settings/shortcuts", title: "Keyboard shortcuts" },
]

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <nav aria-label="Settings sections" className="border-b border-border">
        <ul className="list-none">
          {SECTIONS.map((section) => (
            <li key={section.href}>
              <Link
                href={section.href}
                className="flex items-center justify-between px-4 py-4 text-[16px] font-semibold transition-colors duration-200 hover:bg-foreground/5"
              >
                {section.title}
                <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <nav aria-label="Legal" className="px-4 pt-4 text-sm text-muted-foreground">
        <ul className="flex gap-5">
          <li>
            <Link href="/terms" className="underline-offset-4 hover:underline">
              Terms
            </Link>
          </li>
          <li>
            <Link href="/privacy" className="underline-offset-4 hover:underline">
              Privacy
            </Link>
          </li>
          <li>
            <Link href="/rules" className="underline-offset-4 hover:underline">
              Rules
            </Link>
          </li>
          <li>
            <Link href="/safety" className="underline-offset-4 hover:underline">
              Safety
            </Link>
          </li>
          <li>
            <Link href="/legal" className="underline-offset-4 hover:underline">
              All legal
            </Link>
          </li>
        </ul>
      </nav>
      <div className="px-4 pt-6 pb-10">
        <SettingsLogout />
      </div>
    </>
  )
}
