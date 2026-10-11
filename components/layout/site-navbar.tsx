import Link from "next/link"
import { RhenkoSymbol } from "@/components/brand/symbol"
import { ThemeToggle } from "@/components/theme-toggle"

const links = [
  { href: "#core", label: "Core" },
  { href: "#motion", label: "Motion" },
  { href: "#icons", label: "Icons" },
  { href: "#charts", label: "Charts" },
  { href: "#layouts", label: "Layouts" },
]

export function SiteNavbar() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background">
      <nav
        aria-label="Kit sections"
        className="mx-auto flex h-14 w-full max-w-5xl items-center gap-4 px-4"
      >
        <Link href="/kit" className="flex shrink-0 items-center gap-2 text-sm font-semibold">
          <RhenkoSymbol className="size-6" />
          <span>Kit</span>
        </Link>
        <ul className="flex min-w-0 flex-1 items-center justify-end gap-5 overflow-x-auto text-sm text-muted-foreground">
          {links.map((link) => (
            <li key={link.href} className="shrink-0">
              <a className="hover:text-foreground" href={link.href}>
                {link.label}
              </a>
            </li>
          ))}
        </ul>
        <ThemeToggle />
      </nav>
    </header>
  )
}
