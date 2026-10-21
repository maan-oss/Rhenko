import type { Metadata } from "next"
import Link from "next/link"
import { RhenkoR } from "@/components/brand/symbol"

export const metadata: Metadata = {
  title: { absolute: "Not available · Rhenko" },
  robots: { index: false },
}

// Shown in place of the app to anyone whose connection comes from a country Rhenko is not offered in (lib/geo-block.ts).
// The rules and the policy pages stay open, so the reason for the block can be read.
export default function UnavailablePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <RhenkoR className="size-12 text-foreground" />
      <h1 className="text-2xl font-semibold">Rhenko is not available where you are</h1>
      <p className="max-w-sm text-muted-foreground">
        Rhenko is not offered in your country. You can still read the <Link href="/terms" className="underline">Terms</Link>{" "}
        and the <Link href="/privacy" className="underline">Privacy Policy</Link>.
      </p>
    </main>
  )
}
