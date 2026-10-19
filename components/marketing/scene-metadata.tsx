"use client"

import { AnimatePresence, motion } from "motion/react"
import { cn } from "@/lib/utils"
import { Captions, SceneLayout, SPRING_SOFT, STAGE, useStep, type Beat, type SceneProps } from "@/components/marketing/chapter"
import { Landscape } from "@/components/marketing/landscape"

// What a photo carries about itself, removed one line at a time on upload. The picture on the right is what stays.

const FIELDS = [
  { label: "GPS latitude", value: "9° 58′ 12″ N" },
  { label: "GPS longitude", value: "76° 14′ 24″ E" },
  { label: "Taken", value: "14 Oct 2026, 18:42" },
  { label: "Camera", value: "iPhone 15" },
  { label: "Lens", value: "6.9 mm" },
  { label: "Direction", value: "214° SW" },
  { label: "Software", value: "18.1" },
  { label: "XMP data", value: "2.1 kB" },
  { label: "IPTC caption", value: "Ridge walk" },
  { label: "Comment", value: "Shot on the way back" },
]

const FIRST_REMOVAL = 0.12
const GAP = 0.065

const BEATS: Beat[] = [
  {
    from: 0,
    to: 0.5,
    title: "Your caption. Not your coordinates.",
    body: "A photo can carry where and when it was taken, and the camera it came from. Posting removes that information.",
  },
  {
    from: 0.5,
    to: 1,
    title: "Nothing visible changes.",
    body: "Only the label is removed. The picture is copied byte for byte, so its pixels and colour profile stay as they were.",
  },
]

export function PhotoLabel({ progress, reduced }: SceneProps) {
  const removed = useStep(progress, (p) => (p < FIRST_REMOVAL ? 0 : Math.min(FIELDS.length, Math.floor((p - FIRST_REMOVAL) / GAP) + 1)))
  const remaining = FIELDS.slice(removed)

  const stage = (
    <div className={STAGE}>
      <div className="flex items-center justify-between gap-4">
        <p className="truncate text-[15px] font-semibold">photo_0412.jpg</p>
        <span className="rounded-full bg-muted px-3 py-1 text-[12.5px] font-semibold tabular-nums">
          {remaining.length === 0 ? "Clean" : `${remaining.length} fields`}
        </span>
      </div>

      <div className="mt-5 grid gap-6 sm:grid-cols-[1.1fr_0.9fr] sm:items-start">
        <ul className="flex min-h-[15rem] flex-col">
          <AnimatePresence initial={false}>
            {remaining.map((field) => (
              <motion.li
                key={field.label}
                layout
                exit={{ opacity: 0, x: -36, filter: "blur(4px)" }}
                transition={SPRING_SOFT}
                className="flex items-center justify-between gap-4 border-t border-border py-2.5 text-[13.5px] first:border-t-0"
              >
                <span className="text-muted-foreground">{field.label}</span>
                <span className="text-right font-medium tabular-nums">{field.value}</span>
              </motion.li>
            ))}
          </AnimatePresence>
          {remaining.length === 0 ? (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={SPRING_SOFT}
              className="flex flex-1 items-center text-[14px] text-muted-foreground"
            >
              Nothing about where or when it was taken is left.
            </motion.p>
          ) : null}
        </ul>

        <div className={cn("relative aspect-[4/3] overflow-hidden rounded-2xl border border-border")}>
          <Landscape />
          <span className="absolute bottom-3 left-3 rounded-full bg-background px-3 py-1 text-[12.5px] font-semibold">Ready to post</span>
        </div>
      </div>
    </div>
  )

  return <SceneLayout captions={<Captions beats={BEATS} progress={progress} reduced={reduced} />} stage={stage} />
}
