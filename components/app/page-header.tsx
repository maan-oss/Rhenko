import Link from "next/link"
import type { ReactNode } from "react"
import { ArrowLeft } from "lucide-react"

// One compact row. The title says which page you are on. Tabs sit in the same row when
// given, and anything in children drops below it.
export function PageHeader({
  title,
  backHref,
  actions,
  tabs,
  children,
}: {
  title: string
  backHref?: string
  actions?: ReactNode
  tabs?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="flex h-14 items-center gap-3 px-4">
        {backHref ? (
          <Link href={backHref} aria-label="Back" className="grid size-9 shrink-0 place-items-center rounded-full transition-colors duration-200 hover:bg-foreground/5">
            <ArrowLeft className="size-5" />
          </Link>
        ) : null}
        <h1 className={tabs ? "shrink-0 text-[18px] font-semibold tracking-tight" : "min-w-0 flex-1 truncate text-[18px] font-semibold tracking-tight"}>
          {title}
        </h1>
        {tabs ? <div className="flex min-w-0 flex-1 justify-center">{tabs}</div> : null}
        {actions}
      </div>
      {children}
    </header>
  )
}
