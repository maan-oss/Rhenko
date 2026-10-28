import Link from "next/link"
import { RhenkoSymbol } from "@/components/brand/symbol"

// Plain markup on purpose. This page's client code ships with every route, so it stays free of animation and the UI kit.
export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background px-4 text-center text-foreground">
      <RhenkoSymbol className="size-10" />
      <p className="text-7xl font-semibold tracking-tight">404</p>
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">This page is not here</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          The link may be old, or the post or account may have been deleted. Check the address, or go back to Home.
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-3 sm:h-9 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
      >
        Go to Home
      </Link>
    </main>
  )
}
