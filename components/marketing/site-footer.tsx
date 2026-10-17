import Link from "next/link"
import { RhenkoSymbol } from "@/components/brand/symbol"

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Feed you steer", href: "#feed" },
      { label: "Calls", href: "#calls" },
      { label: "Circles", href: "#circles" },
      { label: "How the feed ranks", href: "#ranking" },
      { label: "Features", href: "#features" },
      { label: "Questions", href: "#faq" },
    ],
  },
  {
    title: "Trust and safety",
    links: [
      { label: "Rules", href: "/rules" },
      { label: "Safety", href: "/safety" },
      { label: "Transparency", href: "/transparency" },
      { label: "Privacy", href: "/privacy" },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Create account", href: "/signup" },
      { label: "Log in", href: "/login" },
      { label: "Advertise", href: "/advertise" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms", href: "/terms" },
      { label: "Legal notices", href: "/legal" },
      { label: "Privacy Policy", href: "/privacy" },
    ],
  },
]

// Plain server markup: the footer ships on every landing view and needs no client code.
export function SiteFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="relative overflow-hidden border-t border-border">
      <div className="mx-auto w-full max-w-[1240px] px-5 pt-20 sm:px-8">
        <div className="grid gap-14 md:grid-cols-[1.2fr_repeat(4,1fr)]">
          <div className="grid content-start gap-5">
            <Link href="#top" className="flex w-fit items-center gap-2.5 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <RhenkoSymbol className="size-7" />
              <span className="text-[17px] font-semibold tracking-tight">Rhenko</span>
            </Link>
            <p className="max-w-[28ch] text-[15px] leading-relaxed text-muted-foreground">Public conversation, on your terms.</p>
            <p className="text-[13px] text-muted-foreground">Accounts are for people 18 and older.</p>
          </div>
          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title} className="grid content-start gap-3">
              <h2 className="text-[13px] font-semibold text-muted-foreground">{column.title}</h2>
              <ul className="grid gap-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-[15px] text-foreground/85 underline-offset-4 transition-colors hover:text-foreground hover:underline">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>

      <p aria-hidden className="mt-16 select-none text-center text-[clamp(5rem,23vw,19rem)] leading-[0.8] font-semibold tracking-[-0.06em] text-foreground/[0.06]">
        Rhenko
      </p>

      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-3 border-t border-border px-5 py-6 text-[13px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p>© {year} Rhenko. All rights reserved.</p>
        <a href="#top" className="inline-flex w-fit items-center rounded-full px-3 py-1.5 text-foreground transition-colors hover:bg-foreground/5">
          Back to top
        </a>
      </div>
    </footer>
  )
}
