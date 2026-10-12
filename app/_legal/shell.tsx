import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { RhenkoSymbol } from "@/components/brand/symbol"

// The frame the Terms of Service and the Privacy Policy share: the sign-in card style in a column about 680px wide,
// a back link, a row of links to each section, then the sections in order.

export type LegalSection = { id: string; title: string; body: ReactNode }

// The operator sets RHENKO_LEGAL_REVIEWED=1 when the text has been reviewed for every country served, and rebuilds. Until then
// every legal page says it is a draft.
const LEGAL_DRAFT = process.env.RHENKO_LEGAL_REVIEWED !== "1"

const LINK = "font-semibold text-dusk underline underline-offset-4"
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={LINK}>
      {children}
    </Link>
  )
}

export function P({ children }: { children: ReactNode }) {
  return <p className="text-[15px] leading-[1.7]">{children}</p>
}

export function List({ children }: { children: ReactNode }) {
  return <ul className="flex list-disc flex-col gap-2 pl-5 text-[15px] leading-[1.7] marker:text-muted-foreground">{children}</ul>
}

export function Code({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[14px]">{children}</span>
}

// A label from the app, or the opening words of a list item.
export function B({ children }: { children: ReactNode }) {
  return <strong className="font-semibold">{children}</strong>
}

// A short answer set apart from the text around it.
export function Note({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-background/60 p-5">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {children}
    </div>
  )
}

export function LegalPage({
  title,
  updated,
  intro,
  summary,
  sections,
  other,
}: {
  title: string
  updated: string
  intro: string
  summary?: ReactNode
  sections: LegalSection[]
  other: { href: string; label: string }
}) {
  return (
    <main className="app-canvas min-h-dvh px-4 py-8 sm:py-12">
      <div className="mx-auto flex w-full max-w-[680px] flex-col gap-5">
        <Link
          href="/"
          className={`glass inline-flex h-10 w-fit items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors hover:bg-foreground/5 ${FOCUS}`}
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to Rhenko
        </Link>
        <article className="flex flex-col gap-8 rounded-[28px] border border-border bg-card/90 p-6 shadow-sm backdrop-blur sm:p-9">
          <header className="flex flex-col gap-6">
            <div className="flex items-center gap-3">
              <RhenkoSymbol className="size-9" />
              <span className="text-[36px] leading-none font-semibold tracking-[-0.03em]">Rhenko</span>
            </div>
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-semibold tracking-[-0.02em]">{title}</h1>
              <p className="text-sm text-muted-foreground">Last updated {updated}</p>
            </div>
            <p className="text-[15px] leading-[1.7]">{intro}</p>
            {LEGAL_DRAFT ? (
              <p role="note" className="rounded-xl border border-dashed border-border px-4 py-3 text-sm leading-relaxed text-muted-foreground">
                Draft. This text has not yet been reviewed by a qualified lawyer for each country this service is offered in, and it may
                change before launch.
              </p>
            ) : null}
          </header>
          {summary}
          <nav aria-label="Sections" className="flex flex-wrap gap-2">
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className={`inline-flex h-8 items-center rounded-full border border-border px-3 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground ${FOCUS}`}
              >
                {section.title}
              </a>
            ))}
          </nav>
          {sections.map((section) => (
            <section key={section.id} id={section.id} className="flex scroll-mt-6 flex-col gap-3">
              <h2 className="text-lg font-semibold tracking-[-0.01em]">{section.title}</h2>
              {section.body}
            </section>
          ))}
        </article>
        <p className="text-center text-sm text-muted-foreground">
          <Link href={other.href} className={LINK}>
            {other.label}
          </Link>
        </p>
      </div>
    </main>
  )
}
