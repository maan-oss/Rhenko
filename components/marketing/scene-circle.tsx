"use client"

import { AnimatePresence, motion, useTransform } from "motion/react"
import { cn } from "@/lib/utils"
import { Captions, clamp01, SceneLayout, SPRING_TAB, STAGE, useStep, type Beat, type SceneProps } from "@/components/marketing/chapter"
import { Monogram } from "@/components/marketing/people"

// A circle with its own charter. The charter is written out first. Then the three ways a circle can open, one at a time.

const CHARTER =
  "Walks start at first light on Sundays. Bring water, and binoculars you are willing to share. Photos stay in the circle unless the photographer says otherwise. No arguments about which bird it was."

const ACCESS = [
  { id: "open", label: "Open" },
  { id: "ask", label: "Ask to join" },
  { id: "closed", label: "Closed" },
] as const

type Access = (typeof ACCESS)[number]["id"]

const BEATS: Beat[] = [
  {
    from: 0,
    to: 0.4,
    title: "Circles with their own charter.",
    body: "A circle has a name of up to 50 characters, a tagline, and a charter of up to 1,000.",
  },
  {
    from: 0.4,
    to: 0.75,
    title: "Open, ask to join, or closed.",
    body: "An ask-to-join circle asks each applicant one question, of up to 160 characters.",
  },
  {
    from: 0.75,
    to: 1,
    title: "Closed means members only.",
    body: "In a closed circle, only members can take part.",
  },
]

export function Circles({ progress, reduced }: SceneProps) {
  const access = useStep<Access>(progress, (p) => (p < 0.4 ? "open" : p < 0.75 ? "ask" : "closed"))
  const charter = useTransform(progress, (p) => CHARTER.slice(0, Math.round(clamp01(p / 0.34) * CHARTER.length)))

  const stage = (
    <div className={STAGE}>
      <div className="flex items-center gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-foreground text-[15px] font-semibold text-background">
          KB
        </span>
        <div className="min-w-0">
          <p className="text-[17px] font-semibold tracking-tight">Kochi Birders</p>
          <p className="text-[13.5px] text-muted-foreground">Early walks and sightings, with the odd argument.</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 rounded-full bg-muted p-1 text-[13px] font-semibold">
        {ACCESS.map((option) => (
          <span
            key={option.id}
            className={cn("relative rounded-full py-2 text-center transition-colors duration-300", access === option.id ? "text-background" : "text-foreground")}
          >
            {access === option.id ? (
              <motion.span layoutId="circle-access" className="absolute inset-0 rounded-full bg-foreground" transition={SPRING_TAB} />
            ) : null}
            <span className="relative">{option.label}</span>
          </span>
        ))}
      </div>

      <div className="mt-5 rounded-2xl border border-border p-4">
        <p className="text-[12.5px] font-semibold text-muted-foreground">Charter</p>
        <motion.p className="mt-2 min-h-[6.5rem] text-[14.5px] leading-relaxed">{charter}</motion.p>
      </div>

      <div className="mt-5 min-h-[9.5rem] rounded-2xl border border-border p-4">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={access}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
          >
            {access === "open" ? <OpenPanel /> : null}
            {access === "ask" ? <AskPanel /> : null}
            {access === "closed" ? <ClosedPanel /> : null}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )

  return <SceneLayout captions={<Captions beats={BEATS} progress={progress} reduced={reduced} />} stage={stage} />
}

function OpenPanel() {
  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-[14.5px] text-muted-foreground">Anyone can join.</p>
      <span className="rounded-full bg-foreground px-4 py-2 text-[13.5px] font-semibold text-background">Join</span>
    </div>
  )
}

function AskPanel() {
  return (
    <div className="grid gap-3">
      <p className="text-[14.5px] font-semibold">Where do you usually birdwatch?</p>
      <div className="rounded-xl border border-border px-3.5 py-2.5 text-[14px] text-muted-foreground">Your answer</div>
      <p className="text-[12.5px] text-muted-foreground tabular-nums">0 of 160 characters</p>
    </div>
  )
}

function ClosedPanel() {
  return (
    <div className="flex items-center gap-4">
      <div className="flex -space-x-2">
        <Monogram letter="M" className="ring-2 ring-background" />
        <Monogram letter="D" className="ring-2 ring-background" />
        <Monogram letter="I" className="ring-2 ring-background" />
      </div>
      <p className="text-[14.5px] text-muted-foreground">Only members can take part.</p>
    </div>
  )
}
