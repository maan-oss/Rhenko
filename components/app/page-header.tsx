import Link from "next/link"
import type { ReactNode } from "react"
import { ArrowLeft } from "lucide-react"

export function PageHeader({
  title,
  backHref,
  actions,
  children,
}: {
  title: string
  backHref?: string
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
      <div className="flex h-14 items-center gap-4 px-4">
        {backHref ? (
          <Link href={backHref} aria-label="Back" className="grid size-9 place-items-center rounded-full hover:bg-muted">
            <ArrowLeft className="size-5" />
          </Link>
        ) : null}
        <h1 className="min-w-0 flex-1 truncate text-xl font-semibold">{title}</h1>
        {actions}
      </div>
      {children}
    </header>
  )
}
