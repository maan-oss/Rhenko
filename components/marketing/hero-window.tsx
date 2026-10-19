"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { EyeOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { SPRING_SOFT, STAGE } from "@/components/marketing/chapter"
import { Monogram, PEOPLE, type PersonId } from "@/components/marketing/people"

// The hero shows the product, live. Every few seconds the top post gets Not interested, leaves the feed, and the next post
// comes up from below. It stops under reduced motion, where the feed simply sits still.
const ORDER: PersonId[] = ["iris", "dev", "sam", "maya"]
const CYCLE_MS = 3800
const LEAVE_MS = 900

export function HeroWindow() {
  const reduced = useReducedMotion()
  const [queue, setQueue] = useState<PersonId[]>(ORDER)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (reduced) return
    let swap = 0
    const cycle = window.setInterval(() => {
      setLeaving(true)
      swap = window.setTimeout(() => {
        setQueue((items) => [...items.slice(1), items[0]])
        setLeaving(false)
      }, LEAVE_MS)
    }, CYCLE_MS)
    return () => {
      window.clearInterval(cycle)
      window.clearTimeout(swap)
    }
  }, [reduced])

  const top = queue[0]
  return (
    <div className={cn(STAGE, "relative")}>
      <div className="flex items-center justify-between gap-4">
        <p className="text-[17px] font-semibold tracking-tight">Home</p>
        <div className="grid grid-cols-2 rounded-full bg-muted p-1 text-[13px] font-semibold">
          <span className="rounded-full bg-foreground px-4 py-1.5 text-center text-background">For you</span>
          <span className="px-4 py-1.5 text-center text-muted-foreground">Following</span>
        </div>
      </div>

      <ul className="mt-5 flex flex-col">
        <AnimatePresence initial={false}>
          {queue.slice(0, 3).map((id) => {
            const person = PEOPLE[id]
            return (
              <motion.li
                key={id}
                layout
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={SPRING_SOFT}
                className="overflow-hidden border-t border-border first:border-t-0"
              >
                <div className={cn("flex gap-3 py-4 transition-opacity duration-500", leaving && id === top && "opacity-40")}>
                  <Monogram letter={person.letter} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold">
                      {person.name} <span className="font-normal text-muted-foreground">· {person.time}</span>
                    </p>
                    <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">{person.body}</p>
                  </div>
                </div>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>

      <AnimatePresence>
        {leaving ? (
          <motion.p
            key="toast"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={SPRING_SOFT}
            className="absolute inset-x-5 bottom-5 flex items-center gap-2.5 rounded-full bg-foreground px-4 py-2.5 text-[13.5px] font-semibold text-background sm:inset-x-6 sm:bottom-6"
          >
            <EyeOff className="size-4 shrink-0" aria-hidden />
            Not interested. This post leaves your feed.
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
