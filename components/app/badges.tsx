import type { AccountMarks } from "@/lib/badges"
import { cn } from "@/lib/utils"

// The badges share one style, like Discord's: a solid shape on a 24 grid, with the glyph cut out in the background colour.
// Each has a label and a tooltip, so its meaning is never guessed. The colours are the --badge-* tokens in app/globals.css.

// The glyph of a badge, cut out of its shape in the background colour.
const CUTOUT = "fill-none stroke-[var(--background)]"

// Verified accounts, set by the operator: an ink seal with a scalloped edge.
export function VerifiedBadge({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" role="img" aria-label="Verified account" className={cn("size-[1em] shrink-0 fill-foreground", className)}>
      <title>Verified account</title>
      <path d="M12 1.5l2.6 2.1 3.3-.3.9 3.2 2.9 1.7-1.2 3.1 1.2 3.1-2.9 1.7-.9 3.2-3.3-.3L12 22.5l-2.6-2.1-3.3.3-.9-3.2-2.9-1.7 1.2-3.1-1.2-3.1 2.9-1.7.9-3.2 3.3.3z" />
      <path className={cn(CUTOUT, "stroke-2")} strokeLinecap="round" strokeLinejoin="round" d="M8 12.2l2.6 2.6L16.2 9.2" />
    </svg>
  )
}

// Rhenko Plus subscribers: a blue disc with a check. It is a plain disc, not the seal. The label makes no claim about who the person is.
export function SubscriberBadge({ className }: { className?: string }) {
  const label = "Rhenko Plus subscriber. Rhenko has not checked this person's identity."
  return (
    <svg viewBox="0 0 24 24" role="img" aria-label={label} className={cn("size-[1em] shrink-0 fill-[var(--badge-plus)]", className)}>
      <title>{label}</title>
      <circle cx="12" cy="12" r="11" />
      <path className={cn(CUTOUT, "stroke-[2.4]")} strokeLinecap="round" strokeLinejoin="round" d="M7.2 12.4l3.1 3.1 6.5-6.6" />
    </svg>
  )
}

// The label on Sahayak and any other AI account. It says what the account is, so nobody takes its words for a person's.
export function AiLabel({ className }: { className?: string }) {
  return (
    <span
      aria-label="AI account"
      title="An AI account"
      className={cn("ml-1 inline-flex items-center rounded-[4px] border border-foreground/30 px-1 align-[1px] text-xs font-semibold leading-4 tracking-normal text-foreground", className)}
    >
      AI
    </span>
  )
}

// The marks an account earns from its record, or from a choice it made (lib/badges.ts).
export function MarkBadges({ marks, className }: { marks: AccountMarks; className?: string }) {
  return (
    <>
      {marks.og ? (
        <svg viewBox="0 0 24 24" role="img" aria-label="OG. One of the first accounts on Rhenko." className={cn("size-[1em] shrink-0 fill-[var(--badge-og)]", className)}>
          <title>OG. One of the first accounts on Rhenko.</title>
          <circle cx="12" cy="12" r="11" />
          <path className="fill-[var(--background)]" d="M12 5.5l1.6 4.3 4.6.2-3.6 2.8 1.2 4.5-3.8-2.6-3.8 2.6 1.2-4.5-3.6-2.8 4.6-.2z" />
        </svg>
      ) : null}
      {marks.veteran ? (
        <svg viewBox="0 0 24 24" role="img" aria-label="Veteran. On Rhenko for at least a year." className={cn("size-[1em] shrink-0 fill-[var(--badge-veteran)]", className)}>
          <title>Veteran. On Rhenko for at least a year.</title>
          <circle cx="12" cy="12" r="11" />
          <circle className={cn(CUTOUT, "stroke-[1.8]")} cx="12" cy="12" r="6.4" />
          <path className={cn(CUTOUT, "stroke-[1.8]")} strokeLinecap="round" strokeLinejoin="round" d="M12 8.4V12l2.4 1.6" />
        </svg>
      ) : null}
      {marks.idChecked ? (
        <svg
          viewBox="0 0 24 24"
          role="img"
          aria-label="ID checked. Stripe checked this person's ID against a live selfie. Rhenko holds only the result."
          className={cn("size-[1em] shrink-0 fill-[var(--badge-id)]", className)}
        >
          <title>ID checked. Stripe checked this person&apos;s ID against a live selfie. Rhenko holds only the result.</title>
          <path d="M12 1.8l8.6 3.2v6.2C20.6 16.4 17 20.4 12 22.1 7 20.4 3.4 16.4 3.4 11.2V5z" />
          <path className={cn(CUTOUT, "stroke-[2.2]")} strokeLinecap="round" strokeLinejoin="round" d="M8.4 12.2l2.6 2.6 4.8-4.9" />
        </svg>
      ) : null}
    </>
  )
}

export function LockedBadge({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" role="img" aria-label="Protected account" className={cn("size-[0.9em] shrink-0 text-muted-foreground", className)} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="2.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}
