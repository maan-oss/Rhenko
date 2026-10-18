import Link from "next/link"
import { skipSetup } from "@/actions/connections"

// Shown on Home to a new account until it finishes or skips setup. "Not now" hides it for good; the steps stay in Connect
// and in Settings.
export function SetupBanner() {
  return (
    <section aria-label="Set up your connections" className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:py-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-[15px] font-semibold">Find people who are a good fit</p>
        {/* On a phone the line under the title goes, so the banner is one row and the feed starts sooner. */}
        <p className="hidden text-[14px] leading-relaxed text-muted-foreground sm:block">
          Add your city and languages. About a minute, and every step can be skipped.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <form action={skipSetup}>
          <button type="submit" className="tap-44 h-9 rounded-full px-3.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground">
            Not now
          </button>
        </form>
        <Link href="/welcome" className="tap-44 inline-flex h-9 items-center rounded-full bg-foreground px-4 text-sm font-semibold text-background transition-opacity hover:opacity-90">
          Set up
        </Link>
      </div>
    </section>
  )
}
