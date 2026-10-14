import { cn } from "@/lib/utils"

// Where each setup screen sits in the row of dots: the three sign-up screens come first, then the two setup pages.
export const SETUP_STEPS = { total: 5, profile: 3, about: 4 } as const

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
