import Link from "@/components/app/link"
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
  hideTitle = false,
  hideTitleOnDesktop = false,
  hideSubtitleOnPhone = false,
  children,
}: {
  title: string
  subtitle?: string
  // A subtitle can make a phone's bar cramped next to an action. On a phone it can be left out; a computer keeps it.
  hideSubtitleOnPhone?: boolean
  lead?: ReactNode
  backHref?: string
  actions?: ReactNode
  tabs?: ReactNode
  // On a phone the title can give way to something else in the lead (the menu button, for one). It stays for screen readers.
  hideTitleOnPhone?: boolean
  // The title is for screen readers only, and on a computer the row above the tabs collapses to nothing. Used where the tabs are the header.
  hideTitle?: boolean
  // Like hideTitle, but only on a computer. A phone keeps the title row, so the page still has a name at the top.
  hideTitleOnDesktop?: boolean
  children?: ReactNode
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur-md">
      <div data-bar-row className={cn("flex h-12 items-center gap-3 px-4 sm:h-14", (hideTitle || hideTitleOnDesktop) && "lg:h-0")}>
        {backHref ? (
          // The button's margins put the arrow's own stroke on the page gutter (the icon's left edge sits about 4px in from its box), so the title sits next to the arrow, not in from it.
          <Link
            href={backHref}
            transitionTypes={["nav-back"]}
            aria-label="Back"
            className="tap-44 -ml-3.5 -mr-2 grid size-10 shrink-0 place-items-center rounded-full transition-[background-color,transform] duration-200 hover:bg-foreground/5 active:bg-foreground/10 sm:-ml-3 sm:-mr-1 sm:size-9"
          >
            <ArrowLeft className="size-5" />
          </Link>
        ) : null}
        {lead}
        <div className={tabs ? "min-w-0 shrink" : "min-w-0 flex-1"}>
          <h1
            className={cn(
              "text-[18px] leading-tight font-semibold tracking-tight",
              tabs ? "shrink-0" : "truncate",
              (hideTitleOnPhone || hideTitle) && "sr-only",
              hideTitleOnPhone && !hideTitle && "lg:not-sr-only",
              hideTitleOnDesktop && "lg:sr-only"
            )}
          >
            {title}
          </h1>
          {subtitle ? (
            <p className={cn("truncate text-[13px] leading-tight text-muted-foreground", hideSubtitleOnPhone && "hidden sm:block")}>{subtitle}</p>
          ) : null}
        </div>
        {tabs ? <div className="flex min-w-0 flex-1 justify-center">{tabs}</div> : null}
        {actions}
      </div>
      {children}
    </header>
  )
}
