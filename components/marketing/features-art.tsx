"use client"

import { useEffect, useState, type ReactNode } from "react"
import { motion } from "motion/react"
import { Bookmark, Check, ChevronDown, KeyRound, Languages, Smile, Sparkles, Type, Crop, Sun, CalendarClock } from "lucide-react"
import { cn } from "@/lib/utils"
import { Landscape } from "@/components/marketing/landscape"
import { Monogram, PEOPLE, type PersonId } from "@/components/marketing/people"

// One small picture per feature. Each one is the product's own control, drawn with the page's tokens, and each one moves once
// when it appears. The people and posts are invented.

const EASE = [0.2, 0.7, 0.2, 1] as const

function Frame({ children }: { children: ReactNode }) {
  return <div className="flex h-[330px] flex-col gap-4 overflow-hidden rounded-2xl border border-border bg-background p-5 sm:h-[350px] sm:p-6">{children}</div>
}

function Post({ id, children }: { id: PersonId; children: ReactNode }) {
  const person = PEOPLE[id]
  return (
    <div className="flex gap-3">
      <Monogram letter={person.letter} className="size-8 text-[13px]" />
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold">
          {person.name} <span className="font-normal text-muted-foreground">· {person.time}</span>
        </p>
        <div className="mt-1 text-[14.5px] leading-relaxed">{children}</div>
      </div>
    </div>
  )
}

function Rise({ delay = 0, children, className }: { delay?: number; children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: EASE }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// Sahayak: a mention in a post, and the reply that lands under it.
export function SahayakArt() {
  return (
    <Frame>
      <Rise>
        <Post id="iris">
          Is the ridge trail open after the rain? <span className="font-semibold">@sahayak</span>
        </Post>
      </Rise>
      <Rise delay={0.7} className="mt-auto rounded-2xl border border-border bg-muted p-4">
        <p className="flex items-center gap-2 text-[13px] font-semibold">
          <Sparkles className="size-4" aria-hidden /> Sahayak
          <span className="font-normal text-muted-foreground">· in the thread</span>
        </p>
        <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">
          The upper trail is open. The lower fork is muddy after rain, so take the path that goes up first.
        </p>
      </Rise>
    </Frame>
  )
}

// Stickers: a sticker placed on the photo, with the sticker tray below it.
export function StickersArt() {
  return (
    <Frame>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl">
        <Landscape />
        <motion.span
          initial={{ opacity: 0, scale: 0.4, rotate: -20 }}
          animate={{ opacity: 1, scale: 1, rotate: 8 }}
          transition={{ delay: 0.35, type: "spring", stiffness: 280, damping: 16 }}
          className="absolute top-4 right-5 flex size-14 items-center justify-center rounded-full bg-foreground text-background shadow-lg"
        >
          <Smile className="size-7" aria-hidden />
        </motion.span>
        <motion.span
          initial={{ opacity: 0, y: 14, rotate: 4 }}
          animate={{ opacity: 1, y: 0, rotate: -4 }}
          transition={{ delay: 0.6, type: "spring", stiffness: 260, damping: 18 }}
          className="absolute bottom-4 left-4 rounded-full bg-background px-4 py-2 text-[13px] font-semibold shadow-lg"
        >
          Ridge walk
        </motion.span>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {[Smile, Type, Crop, Sun].map((Icon, index) => (
            <span
              key={index}
              className={cn(
                "flex size-9 items-center justify-center rounded-full",
                index === 0 ? "bg-foreground text-background" : "text-muted-foreground"
              )}
            >
              <Icon className="size-4" aria-hidden />
            </span>
          ))}
        </div>
        <span className="text-[13px] text-muted-foreground">Before you post</span>
      </div>
    </Frame>
  )
}

// Edit history: the post as it reads now, and the version it replaced.
export function HistoryArt() {
  return (
    <Frame>
      <Rise>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13.5px] font-semibold">Iris</p>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-[12px] font-medium">Edited</span>
        </div>
        <p className="mt-2 text-[15px] leading-relaxed">Photos from the ridge walk, and where the trail forks. Come if you can.</p>
      </Rise>
      <div className="mt-auto grid gap-2.5">
        <Rise delay={0.5} className="flex items-start gap-3 rounded-2xl bg-muted p-3.5">
          <span className="mt-1 size-2 shrink-0 rounded-full bg-foreground" aria-hidden />
          <p className="text-[13px] leading-snug">
            <span className="font-semibold">Current</span>
            <span className="text-muted-foreground"> · edited 12 minutes after posting</span>
          </p>
        </Rise>
        <Rise delay={0.7} className="flex items-start gap-3 rounded-2xl border border-border p-3.5">
          <span className="mt-1 size-2 shrink-0 rounded-full border border-foreground/40" aria-hidden />
          <p className="text-[13px] leading-snug">
            <span className="font-semibold">First version</span>
            <span className="text-muted-foreground"> · Photos from the ridge walk.</span>
          </p>
        </Rise>
      </div>
    </Frame>
  )
}

// Polls: the question, then the answers, with the bars filling as votes arrive.
const POLL = [
  { label: "Saturday", share: 58 },
  { label: "Sunday", share: 27 },
  { label: "Either day", share: 15 },
]

export function PollArt() {
  return (
    <Frame>
      <Rise>
        <Post id="maya">Which day for the ridge walk?</Post>
      </Rise>
      <div className="grid gap-2.5">
        {POLL.map((option, index) => (
          <Rise key={option.label} delay={0.2 + index * 0.1} className="relative overflow-hidden rounded-2xl border border-border">
            <motion.span
              aria-hidden
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.5 + index * 0.1, duration: 0.8, ease: EASE }}
              style={{ width: `${option.share}%` }}
              className={cn("absolute inset-y-0 left-0 origin-left", index === 0 ? "bg-foreground/18" : "bg-foreground/8")}
            />
            <div className="relative flex items-center justify-between px-4 py-3 text-[14px]">
              <span className={cn(index === 0 && "font-semibold")}>{option.label}</span>
              <span className="tabular-nums text-muted-foreground">{option.share}%</span>
            </div>
          </Rise>
        ))}
      </div>
      <p className="mt-auto text-[12.5px] text-muted-foreground">312 votes · Ends in 24 hours</p>
    </Frame>
  )
}

// Drafts and schedule: a post kept for later, with a date picked a week out.
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

export function DraftsArt() {
  return (
    <Frame>
      <Rise>
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-[12px] font-medium">Draft</span>
          <span className="text-[12.5px] text-muted-foreground">Saved just now</span>
        </div>
        <p className="mt-3 text-[15px] leading-relaxed">Photos from the ridge walk, and where the trail forks. Come if you can.</p>
      </Rise>
      <Rise delay={0.4} className="mt-auto grid gap-3 rounded-2xl border border-border p-4">
        <p className="flex items-center gap-2 text-[13.5px] font-semibold">
          <CalendarClock className="size-4" aria-hidden /> Post on Saturday at 9:00 AM
        </p>
        <div className="grid grid-cols-7 gap-1.5 text-center text-[12px]">
          {WEEK.map((day, index) => (
            <span key={day} className="grid gap-1.5">
              <span className="text-muted-foreground">{day}</span>
              <span
                className={cn(
                  "flex h-8 items-center justify-center rounded-full tabular-nums",
                  index === 5 ? "bg-foreground font-semibold text-background" : "text-foreground/70"
                )}
              >
                {20 + index}
              </span>
            </span>
          ))}
        </div>
        <p className="text-[12.5px] text-muted-foreground">You can pick a day up to 75 days ahead.</p>
      </Rise>
    </Frame>
  )
}

// Passkeys and two-factor: a passkey that is already on this phone, and a six-digit second step.
const CODE = ["4", "1", "9", "0", "2", "7"]

export function PasskeyArt() {
  return (
    <Frame>
      <Rise className="flex items-center gap-3 rounded-2xl border border-border p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
          <KeyRound className="size-[18px]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">Passkey on this phone</p>
          <p className="text-[12.5px] text-muted-foreground">Signed in just now</p>
        </div>
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.5, type: "spring", stiffness: 320, damping: 18 }}
          className="flex size-7 items-center justify-center rounded-full bg-foreground text-background"
        >
          <Check className="size-4" aria-hidden />
        </motion.span>
      </Rise>
      <Rise delay={0.3} className="mt-auto grid gap-3">
        <p className="text-[13.5px] font-semibold">Second step</p>
        <div className="grid grid-cols-6 gap-2">
          {CODE.map((digit, index) => (
            <motion.span
              key={index}
              initial={{ opacity: 0.2 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 + index * 0.12, duration: 0.3 }}
              className="flex h-12 items-center justify-center rounded-xl border border-border text-[18px] font-semibold tabular-nums"
            >
              {digit}
            </motion.span>
          ))}
        </div>
        <p className="text-[12.5px] text-muted-foreground">Or add a second step to your sign-in.</p>
      </Rise>
    </Frame>
  )
}

// Translation: the post, then the translated text after the reader asks for it.
const TRANSLATED = "Fotos de la caminata por la cresta, y dónde se bifurca el sendero. Ven si puedes."

export function TranslationArt() {
  const [translated, setTranslated] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setTranslated(true), 1400)
    return () => window.clearTimeout(timer)
  }, [])
  return (
    <Frame>
      <Rise>
        <Post id="dev">
          <span className="block min-h-[4.5rem]">
            <motion.span
              key={translated ? "es" : "en"}
              initial={{ opacity: 0, filter: "blur(4px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              transition={{ duration: 0.45, ease: EASE }}
              className="block"
            >
              {translated
                ? TRANSLATED
                : "Photos from the ridge walk, and where the trail forks. Come if you can."}
            </motion.span>
          </span>
        </Post>
      </Rise>
      <div className="mt-auto flex items-center justify-between gap-3">
        <span className="inline-flex h-9 items-center gap-2 rounded-full border border-border px-4 text-[13px] font-medium">
          <Languages className="size-4" aria-hidden />
          {translated ? "Translated from English" : "Translate"}
        </span>
        <span className="text-[12.5px] text-muted-foreground">Spanish</span>
      </div>
    </Frame>
  )
}

// Bookmarks and lists: saved posts, sorted into a named list.
const LISTS = ["Saved", "Ridge walks", "Local news"]

export function ListsArt() {
  return (
    <Frame>
      <Rise className="flex gap-2 overflow-hidden">
        {LISTS.map((name, index) => (
          <span
            key={name}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium",
              index === 1 ? "bg-foreground text-background" : "border border-border text-muted-foreground"
            )}
          >
            {name}
          </span>
        ))}
      </Rise>
      <div className="grid gap-3">
        {(["iris", "dev", "sam"] as PersonId[]).map((id, index) => (
          <Rise key={id} delay={0.25 + index * 0.12} className="flex items-start gap-3 border-t border-border pt-3 first:border-t-0 first:pt-0">
            <Bookmark className="mt-0.5 size-4 shrink-0 fill-foreground" aria-hidden />
            <p className="min-w-0 truncate text-[14px] text-muted-foreground">
              <span className="font-semibold text-foreground">{PEOPLE[id].name}</span> {PEOPLE[id].body}
            </p>
          </Rise>
        ))}
      </div>
      <p className="mt-auto text-[12.5px] text-muted-foreground">List names can be up to 25 characters.</p>
    </Frame>
  )
}

// Who can reply: the setting on a post, with the three choices open.
const REPLY_OPTIONS = ["Everyone", "People you follow", "Only people you mention"]

export function ReplyArt() {
  return (
    <Frame>
      <Rise>
        <Post id="sam">Anyone up for the kettle repair on Sunday?</Post>
      </Rise>
      <Rise delay={0.2} className="grid gap-2 rounded-2xl border border-border bg-card p-2">
        <p className="flex items-center justify-between rounded-xl px-3 py-2 text-[13.5px] text-muted-foreground">
          Who can reply
          <span className="flex items-center gap-1 font-medium text-foreground">
            Everyone <ChevronDown className="size-4" aria-hidden />
          </span>
        </p>
        <ul className="grid">
          {REPLY_OPTIONS.map((option, index) => (
            <motion.li
              key={option}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.45 + index * 0.1, duration: 0.4, ease: EASE }}
              className={cn("flex items-center justify-between rounded-xl px-3 py-2.5 text-[14px]", index === 0 && "bg-muted font-semibold")}
            >
              {option}
              {index === 0 ? <Check className="size-4" aria-hidden /> : null}
            </motion.li>
          ))}
        </ul>
      </Rise>
    </Frame>
  )
}
