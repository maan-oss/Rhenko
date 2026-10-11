import type { Metadata } from "next"
import Link from "next/link"
import { RhenkoSymbol } from "@/components/brand/symbol"
import { buttonVariants } from "@/components/ui/button"

export const metadata: Metadata = {
  title: { absolute: "Offline · Rhenko" },
  robots: { index: false },
}

// The service worker shows this page when a page cannot be loaded without a connection.
// It adds no client components of its own, because scripts only this page needs may not be on the device while offline.
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <RhenkoSymbol className="size-12 text-dusk" />
      <h1 className="text-2xl font-semibold">You&apos;re offline</h1>
      <p className="max-w-sm text-muted-foreground">
        Rhenko needs a connection to load posts and messages. Try again when you&apos;re connected.
      </p>
      <Link href="/" className={buttonVariants()}>
        Try again
      </Link>
    </main>
  )
}
