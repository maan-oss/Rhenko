"use client"

import { motion, useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils"
import { PRIMARY_BUTTON } from "@/components/app/auth-frame"
import { SPRING_SELECT } from "@/components/app/motion"

// Where each setup screen sits in the row of steps: the three sign-up screens come first, then the three setup pages.
export const SETUP_STEPS = { total: 6, profile: 3, location: 4, interests: 5 } as const

// The buttons the setup pages share.
export const SETUP_PRIMARY = PRIMARY_BUTTON
export const SETUP_GHOST =
  "h-11 w-full rounded-full text-[15px] font-semibold text-muted-foreground transition-colors duration-200 hover:bg-foreground/5 hover:text-foreground disabled:opacity-50"

// The steps as a row of dots, one for each step, centred under the top bar as Apple's page controls are. The current step is a
// solid pill that stretches out of its dot on a spring, and the others stay round. It is announced to screen readers as a
// progress bar, with the step number.
export function OnboardingSteps({ current, total }: { current: number; total: number }) {
  const reduce = useReducedMotion()
  return (
    <div
      role="progressbar"
      aria-label={`Step ${current + 1} of ${total}`}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current + 1}
      className="flex items-center justify-center gap-2"
    >
      {Array.from({ length: total }, (_, index) => {
        const active = index === current
        return (
          <motion.span
            key={index}
            aria-hidden="true"
            initial={false}
            animate={{ width: active ? 24 : 8 }}
            transition={reduce ? { duration: 0 } : SPRING_SELECT}
            className={cn("block h-2 shrink-0 rounded-full transition-colors duration-200", active ? "bg-foreground" : "bg-foreground/20")}
          />
        )
      })}
    </div>
  )
}
