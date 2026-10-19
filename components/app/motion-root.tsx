"use client"

import { MotionConfig } from "motion/react"

// Every motion component below this point follows the reader's reduced-motion setting. Movement and resizing go still;
// colour and opacity still change, so state is never shown by motion alone.
export function MotionRoot({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}
