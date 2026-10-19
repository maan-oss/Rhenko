"use client"

import { AnimatePresence, motion } from "motion/react"
import { Mic, MicOff, PhoneOff, Video, Wifi, WifiOff } from "lucide-react"
import { Captions, SceneLayout, SPRING_SOFT, STAGE, useSpan, useStep, type Beat, type SceneProps } from "@/components/marketing/chapter"

// A group call filling up. Four people join, the microphone goes off, and a dropped connection reconnects.

const PARTICIPANTS = [
  { name: "You", letter: "Y" },
  { name: "Maya", letter: "M" },
  { name: "Dev", letter: "D" },
  { name: "Iris", letter: "I" },
]

const BEATS: Beat[] = [
  {
    from: 0,
    to: 0.4,
    title: "Calls, next to your messages.",
    body: "Start a call from a conversation. The call screen has the controls you need, and nothing else.",
  },
  {
    from: 0.4,
    to: 0.75,
    title: "Up to six people in one call.",
    body: "Mute, switch the camera, or leave from the call screen itself.",
  },
  {
    from: 0.75,
    to: 1,
    title: "A dropped connection is not the end.",
    body: "If your connection drops, the call tries to reconnect for up to 30 seconds.",
  },
]

export function Calls({ progress, reduced }: SceneProps) {
  const joined = useStep(progress, (p) => (p < 0.12 ? 1 : p < 0.3 ? 2 : p < 0.46 ? 3 : 4))
  const muted = useStep(progress, (p) => p >= 0.6)
  const drop = useStep(progress, (p) => (p < 0.78 ? "none" : p < 0.97 ? "reconnecting" : "back"))
  const recovering = useSpan(progress, 0.78, 0.97)

  const stage = (
    <div className={STAGE}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[17px] font-semibold tracking-tight">Group call</p>
          <p className="text-[13px] text-muted-foreground">Up to six people</p>
        </div>
        <span className="rounded-full bg-muted px-3 py-1 text-[12.5px] font-semibold tabular-nums">{joined} of 6</span>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2.5">
        {Array.from({ length: 6 }, (_, index) =>
          index < joined ? (
            <Tile key={PARTICIPANTS[index].name} name={PARTICIPANTS[index].name} letter={PARTICIPANTS[index].letter} muted={index === 0 && muted} />
          ) : (
            <div
              key={`waiting-${index}`}
              className="flex aspect-[4/3] items-end rounded-2xl border border-dashed border-border p-2.5 text-[12px] text-muted-foreground"
            >
              Ringing
            </div>
          )
        )}
      </div>

      <div className="mt-5 flex items-center justify-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-full border border-border">
          {muted ? <MicOff className="size-[18px]" aria-hidden /> : <Mic className="size-[18px]" aria-hidden />}
        </span>
        <span className="flex size-11 items-center justify-center rounded-full border border-border">
          <Video className="size-[18px]" aria-hidden />
        </span>
        <span className="flex h-11 items-center gap-2 rounded-full bg-foreground px-5 text-[13.5px] font-semibold text-background">
          <PhoneOff className="size-4" aria-hidden />
          Leave
        </span>
      </div>

      <AnimatePresence initial={false}>
        {drop !== "none" ? (
          <motion.div
            key="drop"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={SPRING_SOFT}
            className="mt-5 overflow-hidden rounded-2xl border border-border p-4"
          >
            <p className="flex items-center gap-2 text-[14px] font-semibold">
              {drop === "back" ? <Wifi className="size-4" aria-hidden /> : <WifiOff className="size-4" aria-hidden />}
              {drop === "back" ? "Back in the call" : "Connection lost. Reconnecting…"}
            </p>
            {drop === "reconnecting" ? (
              <div className="mt-3 h-px w-full bg-border">
                <motion.div className="h-px origin-left bg-foreground" style={{ scaleX: recovering }} />
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )

  return <SceneLayout captions={<Captions beats={BEATS} progress={progress} reduced={reduced} />} stage={stage} />
}

function Tile({ name, letter, muted }: { name: string; letter: string; muted: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={SPRING_SOFT}
      className="relative flex aspect-[4/3] items-start justify-between overflow-hidden rounded-2xl bg-muted p-2.5"
    >
      <span className="flex size-9 items-center justify-center rounded-full bg-background text-[14px] font-semibold">{letter}</span>
      <span className="flex items-center gap-1.5 self-end rounded-full bg-background/90 px-2 py-0.5 text-[12px] font-semibold">
        {muted ? <MicOff className="size-3" aria-hidden /> : null}
        {name}
      </span>
    </motion.div>
  )
}
