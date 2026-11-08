import Link from "next/link"
import { ArrowUp, Search } from "lucide-react"
import { RhenkoSymbol } from "@/components/brand/symbol"

// The home address for someone who is not signed in: a question at the top, one search bar at the bottom, and the way in.
// It has no motion. A search goes to the search page, which asks the person to sign in first.
export function SignedOutHome() {
  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-5 pt-[max(20px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))] text-foreground sm:px-8">
      <header className="flex items-center justify-between">
        <Link href="/" aria-label="Rhenko home" className="inline-flex">
          <RhenkoSymbol className="size-8" />
        </Link>
        <nav aria-label="Account" className="flex items-center gap-1 text-[15px]">
          <Link href="/login" className="rounded-full px-4 py-2 text-muted-foreground transition-colors hover:text-foreground">
            Log in
          </Link>
          <Link href="/signup" className="rounded-full bg-foreground px-4 py-2 font-medium text-background">
            Sign up
          </Link>
        </nav>
      </header>

      <h1 className="mt-16 text-[2.25rem] leading-[1.1] font-semibold tracking-[-0.03em] sm:text-5xl">How can I help you?</h1>

      <form role="search" action="/search" method="get" className="mx-auto mt-auto flex w-full max-w-[720px] flex-col pt-16">
        <label htmlFor="home-search" className="sr-only">
          Search Rhenko
        </label>
        <div className="flex h-16 items-center gap-3 rounded-full border border-border bg-card pr-2 pl-6 shadow-sm focus-within:border-foreground/40 focus-within:ring-4 focus-within:ring-foreground/5 sm:h-[72px]">
          <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            id="home-search"
            name="q"
            type="search"
            autoComplete="off"
            enterKeyHint="search"
            placeholder="Search Rhenko"
            className="min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-muted-foreground"
          />
          <button type="submit" aria-label="Search" className="grid size-12 shrink-0 place-items-center rounded-full bg-foreground text-background">
            <ArrowUp className="size-5" aria-hidden="true" />
          </button>
        </div>
      </form>
    </div>
  )
}
