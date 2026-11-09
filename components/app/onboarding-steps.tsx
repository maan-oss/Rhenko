import { cn } from "@/lib/utils"
import { PRIMARY_BUTTON } from "@/components/app/auth-frame"

// Where each setup screen sits in the row of steps: the three sign-up screens come first, then the three setup pages.
export const SETUP_STEPS = { total: 6, profile: 3, location: 4, interests: 5 } as const

// The buttons and the text field the setup pages share.
export const SETUP_PRIMARY = PRIMARY_BUTTON
export const SETUP_GHOST =
  "h-11 w-full rounded-full text-[15px] font-semibold text-muted-foreground transition-colors duration-200 hover:bg-foreground/5 hover:text-foreground disabled:opacity-50"
export const SETUP_INPUT = "h-12 w-full rounded-full bg-muted px-5 text-[15px] outline-none transition-[background-color] duration-200 placeholder:text-muted-foreground hover:bg-foreground/[0.06] focus:bg-background"

// The steps of sign-up and setup as one thin bar that fills as the person moves on, as in native onboarding. It is announced
// to screen readers as a progress bar, with the step number.
export function OnboardingSteps({ current, total }: { current: number; total: number }) {
  return (
    <div
      role="progressbar"
      aria-label={`Step ${current + 1} of ${total}`}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current + 1}
      className={cn("h-1 w-full overflow-hidden rounded-full bg-muted")}
    >
      <div
        className="h-full rounded-full bg-foreground transition-[width] duration-300 ease-out motion-reduce:transition-none"
        style={{ width: `${((current + 1) / total) * 100}%` }}
      />
    </div>
  )
}
