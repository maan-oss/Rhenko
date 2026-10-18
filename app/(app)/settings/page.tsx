import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { SettingsLogout } from "@/components/app/account-menu"
import { PageHeader } from "@/components/app/page-header"
import { requireViewer } from "@/lib/auth"

// Settings is a list of sections in four groups. Each section is its own page, so no page is one long scroll.
const GROUPS = [
  {
    title: "Your account",
    sections: [
      { href: "/settings/account", title: "Account" },
      { href: "/settings/about", title: "About you" },
      { href: "/settings/connections", title: "Connections and languages" },
      { href: "/settings/security", title: "Security" },
      { href: "/settings/privacy", title: "Privacy and safety" },
    ],
  },
  {
    title: "Preferences",
    sections: [
      { href: "/settings/appearance", title: "Appearance" },
      { href: "/settings/notifications", title: "Notifications" },
      { href: "/settings/for-you", title: "For you" },
      { href: "/settings/shortcuts", title: "Keyboard shortcuts" },
    ],
  },
  {
    title: "Subscriptions and ads",
    sections: [
      { href: "/settings/billing", title: "Subscriptions and tips" },
      { href: "/advertise", title: "Advertising" },
    ],
  },
  {
    title: "Policies",
    sections: [
      { href: "/notices", title: "Notices and appeals" },
      { href: "/legal", title: "Legal" },
    ],
  },
]

export default async function SettingsPage() {
  // A session that was signed out elsewhere goes to the sign-in page, the same as the other settings pages.
  await requireViewer()
  return (
    <>
      <PageHeader title="Settings" />
      <nav aria-label="Settings sections" className="pb-2">
        {GROUPS.map((group) => (
          <div key={group.title} className="border-b border-border pt-4 last:border-b-0">
            <h2 className="px-4 pb-1 text-[13px] font-medium text-muted-foreground">{group.title}</h2>
            <ul className="list-none">
              {group.sections.map((section) => (
                <li key={section.href}>
                  <Link
                    href={section.href}
                    className="flex items-center justify-between px-4 py-3.5 text-[16px] font-semibold transition-colors duration-200 hover:bg-foreground/5 lg:py-3"
                  >
                    {section.title}
                    <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
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
      <div className="px-4 pt-4 pb-6">
        <SettingsLogout />
      </div>
    </>
  )
}
