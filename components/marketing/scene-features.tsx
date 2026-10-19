"use client"

import type { RefObject } from "react"
import { motion, useTransform } from "motion/react"
import { Bookmark, CalendarClock, History, KeyRound, Languages, ListChecks, MessageCircle, Smile, Sparkles, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Progress } from "@/components/marketing/chapter"

// The rest of the app, as a strip that moves sideways while the reader scrolls down. Each card names one limit or behaviour
// the product keeps.

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Sparkles, title: "Sahayak answers", body: "Mention @sahayak in a post. The reply lands in the thread, and it only answers when a post asks." },
  { icon: Smile, title: "Stickers on photos", body: "Place stickers on a photo before you post it." },
  { icon: History, title: "Edit history", body: "Edits are tracked, so you can see how a post changed." },
  { icon: ListChecks, title: "Polls", body: "Ask a question with two to four answers, and let people choose one." },
  { icon: CalendarClock, title: "Drafts and schedule", body: "Keep a draft for later, or pick a time up to 75 days ahead." },
  { icon: KeyRound, title: "Passkeys and two-factor", body: "Sign in with a passkey, or add a second step to your sign-in." },
  { icon: Languages, title: "Translation", body: "Translate posts into a language you speak. You can list up to twelve." },
  { icon: Bookmark, title: "Bookmarks and lists", body: "Save posts to read later. Sort accounts into lists with names of up to 25 characters." },
  { icon: MessageCircle, title: "Who can reply", body: "Choose everyone, accounts you follow, or only the accounts you mention." },
]

export function FeatureStage({
  progress,
  reduced,
  distance,
  viewport,
  track,
}: {
  progress: Progress
  reduced: boolean
  distance: number
  viewport: RefObject<HTMLDivElement | null>
  track: RefObject<HTMLDivElement | null>
}) {
  const x = useTransform(progress, [0, 1], [0, -distance])
  return (
    <div className="grid gap-12">
      <div className="grid gap-6 md:grid-cols-[1fr_1fr] md:items-end">
        <h2 className="text-[clamp(2.6rem,5.6vw,4.8rem)] leading-[0.96] font-semibold tracking-[-0.045em] text-balance">Everything else, built in.</h2>
        <p className="max-w-[40ch] text-[16.5px] leading-relaxed text-muted-foreground">
          The rest of the app is here too, from polls to passkeys. Each one works the same on a phone and a laptop.
        </p>
      </div>

      <div ref={viewport} className={cn("-mx-5 px-5 sm:-mx-8 sm:px-8", reduced ? "overflow-x-auto pb-2" : "overflow-hidden")}>
        <motion.div ref={track} style={reduced ? undefined : { x }} className="flex w-max gap-5">
          {FEATURES.map((feature) => (
            <article
              key={feature.title}
              className="flex h-[300px] w-[min(320px,76vw)] shrink-0 flex-col justify-between rounded-[28px] border border-border bg-card p-7"
            >
              <feature.icon className="size-6" aria-hidden />
              <div className="grid gap-3">
                <h3 className="text-[19px] font-semibold tracking-tight">{feature.title}</h3>
                <p className="text-[14.5px] leading-relaxed text-muted-foreground">{feature.body}</p>
              </div>
            </article>
          ))}
        </motion.div>
      </div>

      {reduced ? null : (
        <div className="h-px w-full bg-border">
          <motion.div className="h-px origin-left bg-foreground" style={{ scaleX: progress }} />
        </div>
      )}
    </div>
  )
}
