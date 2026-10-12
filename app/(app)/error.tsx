"use client"

import { useEffect } from "react"
import Link from "next/link"

// A page in the app could not be shown. The sidebar stays on screen, so the reader can leave from here. The message says
// what happened and what to do next. The reference, when there is one, matches the server's log for this failure.
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div role="alert" className="flex flex-col items-start gap-4 px-4 py-16">
      <h1 className="text-xl font-semibold tracking-tight">This page did not load.</h1>
      <p className="text-[15px] text-muted-foreground">Try again. If it still fails, go back to Home and open the page from there.</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => retry()}
          className="h-10 rounded-full bg-foreground px-5 text-sm font-semibold text-background transition-opacity hover:opacity-85"
        >
          Try again
        </button>
        <Link href="/" className="inline-flex h-10 items-center rounded-full border border-border px-5 text-sm font-semibold transition-colors hover:bg-muted">
          Go to Home
        </Link>
      </div>
      {error.digest ? <p className="text-[13px] text-muted-foreground">Reference: {error.digest}</p> : null}
    </div>
  )
}
