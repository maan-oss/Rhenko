"use client"

import { cn } from "@/lib/utils"
import { PRIMARY_BUTTON } from "@/components/app/auth-frame"

// Where each setup screen sits in the row of steps: the three sign-up screens come first, then the three setup pages.
export const SETUP_STEPS = { total: 6, profile: 3, location: 4, interests: 5 } as const

// The buttons the setup pages share.
export const SETUP_PRIMARY = PRIMARY_BUTTON
export const SETUP_GHOST =
  "h-11 w-full rounded-full text-[15px] font-semibold text-muted-foreground transition-colors duration-200 hover:bg-foreground/5 hover:text-foreground disabled:opacity-50"

// The steps as a row of circles, one for each step, centred under the top bar. A step already passed is a filled circle, the
// step on screen is filled and ringed, and the steps still to come are empty rings. It is announced to screen readers as a
// progress bar, with the step number.
export function OnboardingSteps({ current, total }: { current: number; total: number }) {
  return (
    <div
      role="progressbar"
      aria-label={`Step ${current + 1} of ${total}`}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current + 1}
      className="flex items-center justify-center gap-2.5"
    >
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={cn(
            "block size-2.5 shrink-0 rounded-full transition-[background-color,box-shadow,border-color] duration-300 motion-reduce:transition-none",
            index < current && "bg-foreground",
            index === current && "bg-foreground ring-[3px] ring-foreground/15",
            index > current && "border-[1.5px] border-foreground/25"
          )}
        />
      ))}
    </div>
  )
}
