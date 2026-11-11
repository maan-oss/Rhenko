import { LoaderCircle } from "lucide-react"

// Shown while this browser gets its keys the first time: a spinner and one line. A second line appears only when the wait gets long.
export function EncryptionSetup({ slow }: { slow: boolean }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 text-center">
      <LoaderCircle className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
      <p className="text-[15px] font-medium text-foreground">Setting up your chats</p>
      {slow ? <p className="text-[13px] text-muted-foreground">Still working. Check your connection.</p> : null}
    </div>
  )
}
