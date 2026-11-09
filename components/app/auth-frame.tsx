import Link from "next/link"
import type { ReactNode } from "react"
import { ChevronLeft } from "lucide-react"
import { RhenkoSymbol } from "@/components/brand/symbol"

// Sign-in, sign-up and setup, drawn as a phone screen. On a phone the screen is the whole display. On a computer the same
// screen sits centred at phone width, so it is never a wide page. Every screen has the same parts, top to bottom: a top bar
// (a back control or the mark on the left, one text action on the right), a large title, its fields in one card, and the
// primary button at the bottom, above the home indicator.
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-background text-foreground sm:flex sm:items-center sm:justify-center sm:bg-muted">
      <div className="flex min-h-dvh w-full flex-col px-5 pt-[max(12px,env(safe-area-inset-top))] pb-[max(16px,env(safe-area-inset-bottom))] sm:h-[min(844px,calc(100dvh-48px))] sm:min-h-0 sm:w-[390px] sm:flex-none sm:overflow-y-auto sm:rounded-[44px] sm:border sm:border-border sm:bg-background sm:px-6 sm:pt-5 sm:pb-6 sm:shadow-[0_30px_60px_-36px_rgb(0_0_0/0.35)]">
        {children}
      </div>
    </main>
  )
}

// The top bar of a screen: a 44-point row, as in iOS. The left holds a back control or the mark, the right one text action.
export function AuthBar({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <header className="flex h-11 shrink-0 items-center justify-between">
      <div className="flex min-w-11 items-center">{left}</div>
      <div className="flex min-w-11 items-center justify-end">{right}</div>
    </header>
  )
}

export function AuthMark() {
  return (
    <span className="ml-1 inline-flex">
      <RhenkoSymbol className="size-7" />
    </span>
  )
}

// The back control. It is a link when it has an address, and a button when it runs a step back in the same screen.
export function AuthBack({ onClick, href, label = "Back" }: { onClick?: () => void; href?: string; label?: string }) {
  const className = "-ml-2 grid size-11 place-items-center rounded-full text-foreground transition-colors hover:bg-foreground/5"
  const icon = <ChevronLeft className="size-6" aria-hidden="true" />
  if (href) {
    return (
      <Link href={href} aria-label={label} className={className}>
        {icon}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} aria-label={label} className={className}>
      {icon}
    </button>
  )
}

// The one text action in the top bar, such as Sign up or Log in.
export function AuthTopLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="rounded-full px-2 py-2 text-[17px] font-medium text-foreground transition-opacity hover:opacity-70">
      {children}
    </Link>
  )
}

// A large title, left-aligned, with one line of plain explanation under it: the way a phone screen starts.
export function AuthTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mt-6 flex flex-col gap-2">
      <h1 className="text-[32px] leading-[1.12] font-semibold tracking-[-0.025em] text-balance">{title}</h1>
      {children ? <p className="text-[16px] leading-snug text-muted-foreground">{children}</p> : null}
    </div>
  )
}

// The bottom of a screen: its primary action and what sits with it. It rests on the bottom edge of the screen.
export function AuthFooter({ children }: { children: ReactNode }) {
  return <div className="mt-auto flex flex-col gap-3 pt-8">{children}</div>
}

// The primary action on every auth and setup screen: one full-width pill, 56 points tall, as in the native sign-up flows.
export const PRIMARY_BUTTON =
  "flex h-14 w-full items-center justify-center rounded-full bg-foreground text-[17px] font-semibold text-background transition-[opacity,transform] duration-200 active:scale-[0.98] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
