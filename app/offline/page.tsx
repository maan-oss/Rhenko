import Link from "next/link"
import { RhenkoSymbol } from "@/components/brand/symbol"

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <RhenkoSymbol className="size-12 text-dusk" />
      <h1 className="text-2xl font-semibold">You&apos;re offline</h1>
      <p className="max-w-sm text-muted-foreground">Rhenko needs a connection to load new posts and messages. Your drafts stay on this device until you reconnect.</p>
      <Link href="/" className="font-semibold text-dusk underline underline-offset-4">
        Try again
      </Link>
    </main>
  )
}
