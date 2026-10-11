"use client"

import { motion } from "motion/react"
import { LetterCascade } from "@/components/ui/letter-cascade"
import { RhenkoSymbol } from "@/components/brand/symbol"

// The one composed moment in the app: the mark settles into place, then the name cascades.
export function BrandIntro() {
  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.7, rotate: -18 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 18 }}
      >
        <RhenkoSymbol className="size-14" />
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.5, ease: "easeOut" }}
        className="flex flex-col items-center gap-2"
      >
        <LetterCascade text="Rhenko" className="text-5xl font-semibold tracking-tight" />
        <p className="text-muted-foreground">Public conversation.</p>
      </motion.div>
    </div>
  )
}
