import Link from "next/link"
import type { ReactNode } from "react"
import { ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"

// One compact row. The title says which page you are on. Tabs sit in the same row when
// given, and anything in children drops below it. A lead (such as an avatar) and a subtitle
// let a conversation or profile carry its person in the same bar.
export function PageHeader({
  title,
  subtitle,
  lead,
  backHref,
  actions,
  tabs,
  hideTitleOnPhone = false,
  children,
}: {
  title: string
  subtitle?: string
  lead?: ReactNode
  backHref?: string
  actions?: ReactNode
  tabs?: ReactNode
  // On a phone the title can give way to something else in the lead (the menu button, for one). It stays for screen readers.
  hideTitleOnPhone?: boolean
  children?: ReactNode
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="flex h-14 items-center gap-3 px-4">
        {backHref ? (
          <Link href={backHref} aria-label="Back" className="grid size-10 shrink-0 place-items-center rounded-full transition-colors duration-200 hover:bg-foreground/5 sm:size-9">
            <ArrowLeft className="size-5" />
          </Link>
        ) : null}
        {lead}
        <div className={tabs ? "min-w-0 shrink" : "min-w-0 flex-1"}>
          <h1
            className={cn(
              "text-[18px] leading-tight font-semibold tracking-tight",
              tabs ? "shrink-0" : "truncate",
              hideTitleOnPhone && "sr-only lg:not-sr-only"
            )}
          >
            {title}
          </h1>
          {subtitle ? <p className="truncate text-[13px] leading-tight text-muted-foreground">{subtitle}</p> : null}
        </div>
        {tabs ? <div className="flex min-w-0 flex-1 justify-center">{tabs}</div> : null}
        {actions}
      </div>
      {children}
    </header>
  )
}
