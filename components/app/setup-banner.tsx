import Link from "next/link"
import { skipSetup } from "@/actions/connections"

// Shown on Home to a new account until it finishes or skips setup. "Not now" hides it for good; the steps stay in Connect
// and in Settings.
export function SetupBanner() {
  return (
    <section aria-label="Set up your connections" className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-[15px] font-semibold">Find people who are a good fit</p>
        <p className="text-[14px] leading-relaxed text-muted-foreground">
          Add your city and the languages you speak. It takes about a minute, and every step can be skipped.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <form action={skipSetup}>
          <button type="submit" className="h-9 rounded-full px-3.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground">
            Not now
          </button>
        </form>
        <Link href="/welcome" className="inline-flex h-9 items-center rounded-full bg-foreground px-4 text-sm font-semibold text-background transition-opacity hover:opacity-85">
          Set up
        </Link>
      </div>
    </section>
  )
}
