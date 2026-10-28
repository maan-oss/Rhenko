import { cn } from "@/lib/utils"

// Where each setup screen sits in the row of dots: the three sign-up screens come first, then the three setup pages.
export const SETUP_STEPS = { total: 6, profile: 3, location: 4, interests: 5 } as const

// The buttons and the text field the setup pages share.
export const SETUP_PRIMARY =
  "flex h-12 w-full items-center justify-center rounded-full bg-foreground text-[15px] font-semibold text-background transition-opacity duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
export const SETUP_GHOST =
  "h-11 w-full rounded-full text-[15px] font-semibold text-muted-foreground transition-colors duration-200 hover:bg-foreground/5 hover:text-foreground disabled:opacity-50"
export const SETUP_INPUT = "h-12 w-full rounded-full bg-muted px-5 text-[15px] outline-none transition-[background-color] duration-200 placeholder:text-muted-foreground hover:bg-foreground/[0.06] focus:bg-background"

// The steps of sign-up and setup. Every dot is the same size. The current step is stretched into a pill, and the steps
// before it are filled in. The row is announced to screen readers as a progress bar.
export function OnboardingSteps({ current, total }: { current: number; total: number }) {
  return (
    <div
      role="progressbar"
      aria-label={`Step ${current + 1} of ${total}`}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current + 1}
      className="flex h-2 items-center justify-center gap-2"
    >
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={cn(
            "h-2 rounded-full transition-[width,background-color] duration-300 ease-out motion-reduce:transition-none",
            index === current ? "w-6 bg-foreground" : index < current ? "w-2 bg-foreground" : "w-2 bg-muted-foreground/70"
          )}
        />
      ))}
    </div>
  )
}
