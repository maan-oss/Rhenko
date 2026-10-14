import { cn } from "@/lib/utils"

// Verified accounts get a dusk check. Labelled for screen readers.
export function VerifiedBadge({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" role="img" aria-label="Verified account" className={cn("size-[1em] shrink-0 text-dusk", className)}>
      <path
        fill="currentColor"
        d="M12 1.5l2.6 2.1 3.3-.3.9 3.2 2.9 1.7-1.2 3.1 1.2 3.1-2.9 1.7-.9 3.2-3.3-.3L12 22.5l-2.6-2.1-3.3.3-.9-3.2-2.9-1.7 1.2-3.1-1.2-3.1 2.9-1.7.9-3.2 3.3.3z"
      />
      <path fill="none" stroke="var(--background)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M8 12.2l2.6 2.6L16.2 9.2" />
    </svg>
  )
}

// A paid subscriber. It is a ring with a dot, not a check, so it cannot be mistaken for the verified badge. It says the person
// pays for a subscription. It makes no claim about who they are.
export function SubscriberBadge({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" role="img" aria-label="Paid subscriber. Rhenko has not checked this person's identity." className={cn("size-[1em] shrink-0 text-dusk", className)}>
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="12" cy="12" r="3.2" fill="currentColor" />
    </svg>
  )
}

// The label on Sahayak and any other AI account. It says what the account is, so nobody takes its words for a person's.
export function AiLabel({ className }: { className?: string }) {
  return (
    <span
      aria-label="AI account"
      title="An AI account"
      className={cn("ml-1 inline-flex items-center rounded-[4px] border border-dusk/60 px-1 align-[1px] text-[11px] font-semibold leading-4 tracking-normal text-dusk", className)}
    >
      AI
    </span>
  )
}

export function EditedMark({ className }: { className?: string }) {
  return <span className={cn("text-[13px] text-muted-foreground", className)}>· Edited</span>
}

export function LockedBadge({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" role="img" aria-label="Protected account" className={cn("size-[0.9em] shrink-0 text-muted-foreground", className)} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="2.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}
