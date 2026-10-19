"use client"

import { AnimatePresence, motion } from "motion/react"
import { BellOff, EyeOff, Lock, MoreHorizontal, UserPlus } from "lucide-react"
import { cn } from "@/lib/utils"
import { Captions, SceneLayout, SPRING_SOFT, SPRING_TAB, STAGE, useStep, type Beat, type SceneProps } from "@/components/marketing/chapter"
import { Monogram, PEOPLE, type PersonId } from "@/components/marketing/people"

// The feed in three moves. Tabs first: For you, then Following, where the newest posts come first. Then Not interested on
// one post, which opens the menu and takes the post out of the feed. Then the same menu steers a topic and an account.

const FOR_YOU: PersonId[] = ["iris", "dev", "sam", "maya"]
const FOLLOWING: PersonId[] = ["sam", "maya", "dev", "iris"]

const MENU = [
  { icon: EyeOff, label: "Not interested" },
  { icon: BellOff, label: "Snooze this topic for 7 days" },
  { icon: UserPlus, label: "Follow this account" },
  { icon: Lock, label: "Mute words" },
] as const

const BEATS: Beat[] = [
  {
    from: 0,
    to: 0.33,
    title: "Two tabs, one switch.",
    body: "For you ranks posts from what you like. Following shows the newest posts from people you follow.",
  },
  {
    from: 0.33,
    to: 0.66,
    title: "Not interested means it leaves.",
    body: "Tap it on any post, and that post is gone from your feed.",
  },
  {
    from: 0.66,
    to: 1,
    title: "Steer the topic, not just the post.",
    body: "Snooze a topic for seven days, follow the account, or mute words from the same menu.",
  },
]

export function FeedSteer({ progress, reduced }: SceneProps) {
  const tab = useStep(progress, (p) => (p < 0.14 ? "for-you" : "following"))
  const menuOn = useStep<PersonId | null>(progress, (p) => (p >= 0.33 && p < 0.5 ? "dev" : p >= 0.66 ? "iris" : null))
  const dismissed = useStep(progress, (p) => p >= 0.5)
  const order = tab === "for-you" ? FOR_YOU : FOLLOWING
  const shown = order.filter((id) => !(dismissed && id === "dev"))

  const stage = (
    <div className={STAGE}>
      <div className="flex items-center justify-between gap-4">
        <p className="text-[17px] font-semibold tracking-tight">Home</p>
        <Tabs tab={tab} />
      </div>
      <ul className="mt-5 flex flex-col">
        <AnimatePresence initial={false}>
          {shown.map((id) => (
            <FeedRow key={id} id={id} open={menuOn === id} highlight={menuOn === "dev" ? 0 : 1} />
          ))}
        </AnimatePresence>
      </ul>
    </div>
  )

  return <SceneLayout captions={<Captions beats={BEATS} progress={progress} reduced={reduced} />} stage={stage} />
}

function Tabs({ tab }: { tab: "for-you" | "following" }) {
  return (
    <div className="relative grid grid-cols-2 rounded-full bg-muted p-1 text-[13px] font-semibold">
      <motion.span
        aria-hidden
        className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-foreground"
        animate={{ x: tab === "following" ? "100%" : "0%" }}
        transition={SPRING_TAB}
      />
      <span className={cn("relative px-4 py-1.5 text-center transition-colors duration-300", tab === "for-you" ? "text-background" : "text-foreground")}>
        For you
      </span>
      <span className={cn("relative px-4 py-1.5 text-center transition-colors duration-300", tab === "following" ? "text-background" : "text-foreground")}>
        Following
      </span>
    </div>
  )
}

function FeedRow({ id, open, highlight }: { id: PersonId; open: boolean; highlight: number }) {
  const person = PEOPLE[id]
  return (
    <motion.li
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={SPRING_SOFT}
      className="overflow-hidden border-t border-border first:border-t-0"
    >
      <div className="flex gap-3 py-4">
        <Monogram letter={person.letter} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[14px] font-semibold">
              {person.name} <span className="font-normal text-muted-foreground">· {person.time}</span>
            </p>
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full transition-colors duration-300",
                open ? "bg-foreground text-background" : "text-muted-foreground"
              )}
            >
              <MoreHorizontal className="size-4" aria-hidden />
            </span>
          </div>
          <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">{person.body}</p>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.ul
            key="menu"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING_SOFT}
            className="mb-4 ml-12 overflow-hidden rounded-2xl border border-border bg-background"
          >
            {MENU.map((item, index) => (
              <li
                key={item.label}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 text-[13.5px] transition-colors duration-300",
                  index > 0 && "border-t border-border",
                  index === highlight && "bg-muted font-semibold"
                )}
              >
                <item.icon className="size-4 text-muted-foreground" aria-hidden />
                {item.label}
              </li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </motion.li>
  )
}
