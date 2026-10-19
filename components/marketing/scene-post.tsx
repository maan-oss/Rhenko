"use client"

import { AnimatePresence, motion, useTransform, type MotionValue } from "motion/react"
import { Undo2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Captions, SceneLayout, SPRING_SOFT, STAGE, useStep, type Beat, type SceneProps } from "@/components/marketing/chapter"
import { Monogram, PEOPLE } from "@/components/marketing/people"

// Post, then take it back. The ring counts the undo window down, ten seconds, and Undo takes the post away before it empties.

const DRAFT = "Photos from the ridge walk, and where the trail forks. Come if you can."
const RING_RADIUS = 19
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

const BEATS: Beat[] = [
  {
    from: 0,
    to: 0.45,
    title: "Post it, then take it back.",
    body: "A new post can be undone for ten seconds after it goes out. The ring shows what is left.",
  },
  {
    from: 0.45,
    to: 1,
    title: "Undo deletes the post.",
    body: "When the ring empties, the post stays up. You can still edit it for an hour, and the edit history keeps every version.",
  },
]

export function TenSeconds({ progress, reduced }: SceneProps) {
  const stage = useStep(progress, (p) => (p < 0.14 ? "compose" : p < 0.48 ? "posted" : "undone"))
  const typed = useTransform(progress, (p) => DRAFT.slice(0, Math.round(Math.min(1, p / 0.12) * DRAFT.length)))
  const left = useTransform(progress, [0.16, 0.86], [1, 0])

  const cardStage = (
    <div className={STAGE}>
      <p className="text-[17px] font-semibold tracking-tight">Home</p>
      <div className="mt-5 flex flex-col gap-3">
        <div className="rounded-2xl border border-border p-4">
          <p className="min-h-[3.25rem] text-[15px] leading-relaxed">
            {stage === "compose" ? <motion.span>{typed}</motion.span> : <span className="text-muted-foreground">What is happening?</span>}
          </p>
          <div className="mt-3 flex justify-end">
            <span
              className={cn(
                "rounded-full px-4 py-1.5 text-[13.5px] font-semibold transition-colors duration-300",
                stage === "posted" ? "bg-muted text-muted-foreground" : "bg-foreground text-background"
              )}
            >
              Post
            </span>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {stage === "posted" ? <OwnPost key="posted" left={left} /> : null}
          {stage === "undone" ? <Undone key="undone" /> : null}
        </AnimatePresence>

        {[PEOPLE.sam, PEOPLE.maya].map((person) => (
          <div key={person.name} className="flex gap-3 border-t border-border pt-4">
            <Monogram letter={person.letter} />
            <div className="min-w-0">
              <p className="text-[14px] font-semibold">
                {person.name} <span className="font-normal text-muted-foreground">· {person.time}</span>
              </p>
              <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">{person.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  return <SceneLayout captions={<Captions beats={BEATS} progress={progress} reduced={reduced} />} stage={cardStage} />
}

function OwnPost({ left }: { left: MotionValue<number> }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: -12 }}
      transition={SPRING_SOFT}
      className="flex gap-3 overflow-hidden rounded-2xl border border-border p-4"
    >
      <Ring left={left} />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold">
          You <span className="font-normal text-muted-foreground">· just now</span>
        </p>
        <p className="mt-1 line-clamp-2 text-[14px] leading-relaxed text-muted-foreground">{DRAFT}</p>
      </div>
      <span className="self-start rounded-full border border-border px-3.5 py-1.5 text-[13px] font-semibold">Undo</span>
    </motion.div>
  )
}

function Ring({ left }: { left: MotionValue<number> }) {
  const offset = useTransform(left, (value) => RING_LENGTH * (1 - value))
  const seconds = useTransform(left, (value) => Math.ceil(value * 10))
  return (
    <div className="relative size-11 shrink-0">
      <svg viewBox="0 0 44 44" className="size-full -rotate-90" aria-hidden>
        <circle cx="22" cy="22" r={RING_RADIUS} fill="none" className="stroke-border" strokeWidth="3" />
        <motion.circle
          cx="22"
          cy="22"
          r={RING_RADIUS}
          fill="none"
          className="stroke-foreground"
          strokeWidth="3"
          strokeLinecap="round"
          style={{ strokeDasharray: RING_LENGTH, strokeDashoffset: offset }}
        />
      </svg>
      <motion.span aria-hidden className="absolute inset-0 flex items-center justify-center text-[13px] font-semibold tabular-nums">
        {seconds}
      </motion.span>
    </div>
  )
}

function Undone() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={SPRING_SOFT}
      className="flex items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-4 text-[14px]"
    >
      <Undo2 className="size-4 text-muted-foreground" aria-hidden />
      Undone. The post was deleted.
    </motion.div>
  )
}
