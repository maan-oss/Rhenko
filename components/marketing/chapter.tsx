"use client"

import { useRef, useState, type ReactNode } from "react"
import {
  MotionConfig,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
  type Transition,
} from "motion/react"
import { cn } from "@/lib/utils"

// Scroll chapters. A chapter is a tall section whose stage stays pinned to the top of the screen while the reader scrolls
// through it. Everything on the stage is a function of one number, progress: 0 as the section reaches the top of the screen,
// 1 as it leaves. With reduced motion nothing is pinned or scrubbed. Each chapter shows its finished state and every caption
// is listed in order.

export type Progress = MotionValue<number>
export type SceneProps = { progress: Progress; reduced: boolean }

export const SPRING: Transition = { type: "spring", stiffness: 300, damping: 30 }
export const SPRING_SOFT: Transition = { type: "spring", stiffness: 240, damping: 28 }
export const SPRING_TAB: Transition = { type: "spring", stiffness: 420, damping: 36 }

export const STAGE = "rounded-[28px] border border-border bg-card p-5 shadow-[0_30px_80px_-50px_rgba(10,10,10,0.45)] sm:p-6"

export function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

// Ramps from 0 at `from` to 1 at `to`, and holds at each end outside that range.
export function useSpan(progress: Progress, from: number, to: number) {
  return useTransform(progress, (value) => clamp01((value - from) / (to - from)))
}

// A discrete state chosen from progress. The scene re-renders only when the chosen value changes, not on every frame.
export function useStep<T extends string | number | boolean | null>(progress: Progress, pick: (value: number) => T): T {
  const [state, setState] = useState<T>(() => pick(progress.get()))
  useMotionValueEvent(progress, "change", (value) => {
    const next = pick(value)
    setState((previous) => (previous === next ? previous : next))
  })
  return state
}

// Motion follows the reader's reduced-motion setting everywhere below this point.
export function RhenkoMotion({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}

export function Chapter({
  id,
  label,
  height,
  children,
}: {
  id: string
  label: string
  height: string
  children: (scene: SceneProps) => ReactNode
}) {
  const ref = useRef<HTMLElement>(null)
  const reduced = useReducedMotion() ?? false
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] })
  const settled = useMotionValue(1)
  const progress = reduced ? settled : scrollYProgress
  return (
    <section id={id} ref={ref} aria-label={label} className="relative" style={reduced ? undefined : { height }}>
      <div className={cn(reduced ? "py-24 sm:py-32" : "sticky top-0 flex h-svh items-center overflow-hidden")}>
        <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">{children({ progress, reduced })}</div>
      </div>
    </section>
  )
}

// Captions that replace each other as the chapter moves on. Every caption sits in the same grid cell, so the block is as
// tall as the longest one and nothing shifts when the text changes.
export type Beat = { from: number; to: number; title: string; body: string }

export function Captions({ beats, progress, reduced }: SceneProps & { beats: Beat[] }) {
  if (reduced) {
    return (
      <div className="grid gap-10">
        {beats.map((beat) => (
          <Copy key={beat.title} title={beat.title} body={beat.body} />
        ))}
      </div>
    )
  }
  return (
    <div className="grid [&>*]:col-start-1 [&>*]:row-start-1">
      {beats.map((beat, index) => (
        <CaptionBeat key={beat.title} beat={beat} progress={progress} first={index === 0} last={index === beats.length - 1} />
      ))}
    </div>
  )
}

// The input ranges stay inside 0 to 1 and never decrease. The browser's native scroll-linked animations reject any other
// range, and that rejection stops the page.
function CaptionBeat({ beat, progress, first, last }: { beat: Beat; progress: Progress; first: boolean; last: boolean }) {
  const fadeIn = clamp01(beat.from - 0.06)
  const opacity = useTransform(
    progress,
    first ? [0, clamp01(beat.to - 0.06), clamp01(beat.to)] : [fadeIn, clamp01(beat.from), clamp01(beat.to - 0.06), clamp01(beat.to)],
    first ? [1, 1, last ? 1 : 0] : [0, 1, 1, last ? 1 : 0]
  )
  const y = useTransform(progress, first ? [0, 0.01] : [fadeIn, clamp01(beat.from)], first ? [0, 0] : [22, 0])
  return (
    <motion.div style={{ opacity, y }}>
      <Copy title={beat.title} body={beat.body} />
    </motion.div>
  )
}

export function Copy({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid gap-4">
      <h3 className="text-[clamp(2rem,3.4vw,3.1rem)] leading-[1.02] font-semibold tracking-[-0.035em] text-balance">{title}</h3>
      <p className="max-w-[40ch] text-[16.5px] leading-relaxed text-muted-foreground">{body}</p>
    </div>
  )
}

// Captions on the left beside the stage on wide screens. On a phone the stage comes first and the captions below it.
export function SceneLayout({ captions, stage }: { captions: ReactNode; stage: ReactNode }) {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
      <div className="order-2 lg:order-1">{captions}</div>
      <div className="order-1 lg:order-2">{stage}</div>
    </div>
  )
}

// A block that rises into place once, when it first comes on screen. Used for the static sections only.
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={SPRING_SOFT}
    >
      {children}
    </motion.div>
  )
}
