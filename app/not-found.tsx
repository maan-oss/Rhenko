import Link from "next/link"
import { RhenkoSymbol } from "@/components/brand/symbol"
import { LetterCascade } from "@/components/ui/letter-cascade"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background px-4 text-center text-foreground">
      <RhenkoSymbol className="size-10" />
      <LetterCascade text="404" className="text-7xl font-semibold tracking-tight" />
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">This page is not here</h1>
        <p className="text-sm text-muted-foreground">The link may be old, or the page moved.</p>
      </div>
      <Button render={<Link href="/" />}>Back to Rhenko</Button>
    </main>
  )
}
