import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { logout } from "@/actions/auth"
import { requireViewer } from "@/lib/auth"
import { SHORTCUTS } from "@/lib/shortcuts"
import { PageHeader } from "@/components/app/page-header"
import { StatusForm } from "@/components/app/status-form"
import { ThemeChoice } from "@/components/app/theme-choice"

// Everything about the account on one page: no nested menus for appearance or shortcuts.
const PAGES = [
  { href: "/settings/account", title: "Account" },
  { href: "/settings/security", title: "Security" },
  { href: "/settings/privacy", title: "Privacy and safety" },
  { href: "/settings/notifications", title: "Notifications" },
]

export default async function SettingsPage() {
  const viewer = await requireViewer()
  return (
    <>
      <PageHeader title="Settings" />
      <section className="flex flex-col gap-3 border-b border-border px-4 py-6">
        <StatusForm status={viewer.status} />
      </section>
      <section className="flex flex-col gap-3 border-b border-border px-4 py-6">
        <h2 className="text-lg font-semibold">Appearance</h2>
        <ThemeChoice />
      </section>
      <nav aria-label="Account pages" className="border-b border-border">
        <ul className="list-none">
          {PAGES.map((page) => (
            <li key={page.href}>
              <Link
                href={page.href}
                className="flex items-center justify-between px-4 py-4 text-[16px] font-semibold transition-colors duration-200 hover:bg-foreground/5"
              >
                {page.title}
                <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <section className="flex flex-col gap-3 border-b border-border px-4 py-6">
        <h2 className="text-lg font-semibold">Keyboard shortcuts</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-[15px]">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.keys} className="contents">
              <dt>
                <kbd className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-sm">{shortcut.keys}</kbd>
              </dt>
              <dd className="text-muted-foreground">{shortcut.label}</dd>
            </div>
          ))}
        </dl>
      </section>
      <form action={logout} className="px-4 pt-6 pb-10">
        <button
          type="submit"
          className="flex h-14 w-full items-center justify-center rounded-full border border-border text-[16px] font-semibold transition-colors duration-200 hover:border-destructive hover:bg-destructive hover:text-destructive-foreground"
        >
          Log out
        </button>
      </form>
    </>
  )
}
