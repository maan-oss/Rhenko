"use client"

import { motion, useTransform } from "motion/react"
import type { Progress, SceneProps } from "@/components/marketing/chapter"

// The opening statement. Each word lights up as the reader scrolls past it, so the sentence is read at the reader's pace.

const TEXT =
  "Most feeds decide for you without saying how. Rhenko shows where a feed’s posts come from, lets you steer what it shows, and lets you take back what you post."

export function Manifesto({ progress }: SceneProps) {
  const words = TEXT.split(" ")
  return (
    <p className="max-w-[24ch] text-[clamp(2.3rem,5vw,4.7rem)] leading-[1.04] font-semibold tracking-[-0.04em] text-balance">
      {words.map((word, index) => (
        <Word key={`${index}-${word}`} progress={progress} from={0.04 + (index / words.length) * 0.74}>
          {word}
        </Word>
      ))}
    </p>
  )
}

function Word({ progress, from, children }: { progress: Progress; from: number; children: string }) {
  const opacity = useTransform(progress, [from, from + 0.1], [0.14, 1])
  return <motion.span style={{ opacity }}>{children} </motion.span>
}
