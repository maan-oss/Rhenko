"use client"

import { useRef, useState, type ComponentType, type KeyboardEvent } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Bookmark, CalendarClock, History, KeyRound, Languages, ListChecks, MessageCircle, Smile, Sparkles, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Reveal, SPRING_TAB, STAGE } from "@/components/marketing/chapter"
import {
  DraftsArt,
  HistoryArt,
  ListsArt,
  PasskeyArt,
  PollArt,
  ReplyArt,
  SahayakArt,
  StickersArt,
  TranslationArt,
} from "@/components/marketing/features-art"

// The rest of the app, one feature at a time. Pick a tab, and its picture and words replace the last one.
// Each limit in the copy comes from the product's own rules.

const FEATURES: { key: string; icon: LucideIcon; title: string; body: string; Art: ComponentType }[] = [
  {
    key: "sahayak",
    icon: Sparkles,
    title: "Sahayak answers",
    body: "Mention @sahayak in a post. The reply lands in the thread, and it only answers when a post asks.",
    Art: SahayakArt,
  },
  {
    key: "stickers",
    icon: Smile,
    title: "Stickers on photos",
    body: "Place stickers on a photo before you post it.",
    Art: StickersArt,
  },
  {
    key: "history",
    icon: History,
    title: "Edit history",
    body: "Posts can be edited for an hour, or a day with Plus. Each version stays in the history.",
    Art: HistoryArt,
  },
  {
    key: "polls",
    icon: ListChecks,
    title: "Polls",
    body: "Ask a question with two to four choices, each up to 25 characters. A poll runs from 5 minutes to 7 days.",
    Art: PollArt,
  },
  {
    key: "drafts",
    icon: CalendarClock,
    title: "Drafts and schedule",
    body: "Keep a draft for later, or pick a time up to 75 days ahead.",
    Art: DraftsArt,
  },
  {
    key: "passkeys",
    icon: KeyRound,
    title: "Passkeys and two-factor",
    body: "Sign in with a passkey, or add a second step to your sign-in.",
    Art: PasskeyArt,
  },
  {
    key: "translation",
    icon: Languages,
    title: "Translation",
    body: "List up to twelve languages you speak. Posts up to 5,000 characters can be translated into them.",
    Art: TranslationArt,
  },
  {
    key: "lists",
    icon: Bookmark,
    title: "Bookmarks and lists",
    body: "Save posts to read later. Sort accounts into lists with names of up to 25 characters.",
    Art: ListsArt,
  },
  {
    key: "replies",
    icon: MessageCircle,
    title: "Who can reply",
    body: "Choose everyone, accounts you follow, or only the accounts you mention.",
    Art: ReplyArt,
  },
]

export function FeaturesShowcase() {
  const [active, setActive] = useState(0)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const feature = FEATURES[active]

  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number | null = null
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % FEATURES.length
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + FEATURES.length) % FEATURES.length
    if (event.key === "Home") next = 0
    if (event.key === "End") next = FEATURES.length - 1
    if (next === null) return
    event.preventDefault()
    setActive(next)
    tabs.current[next]?.focus()
  }

  return (
    <section id="features" aria-labelledby="features-heading" className="mx-auto w-full max-w-[1240px] px-5 py-28 sm:px-8 sm:py-40">
      <Reveal className="grid gap-6 md:grid-cols-[1fr_1fr] md:items-end">
        <h2 id="features-heading" className="text-[clamp(2.4rem,5.2vw,4.4rem)] leading-[0.98] font-semibold tracking-[-0.04em] text-balance">
          Everything else, built in.
        </h2>
        <p className="max-w-[40ch] text-[17px] leading-relaxed text-muted-foreground">
          Polls, drafts, passkeys and more. Pick a feature to see how it works.
        </p>
      </Reveal>

      <div className="mt-14 grid gap-6 lg:mt-16 lg:grid-cols-[0.34fr_0.66fr] lg:items-start lg:gap-12">
        <div
          role="tablist"
          aria-label="Features"
          className="-mx-5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:-mx-8 sm:px-8 lg:mx-0 lg:snap-none lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden"
        >
          {FEATURES.map((item, index) => {
            const selected = index === active
            return (
              <button
                key={item.key}
                ref={(node) => {
                  tabs.current[index] = node
                }}
                type="button"
                role="tab"
                id={`feature-tab-${item.key}`}
                aria-selected={selected}
                aria-controls="feature-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(index)}
                onKeyDown={(event) => move(event, index)}
                className={cn(
                  "relative isolate flex shrink-0 snap-start items-center gap-2.5 rounded-full px-4 py-2.5 text-[15px] font-medium whitespace-nowrap outline-none transition-colors duration-300 focus-visible:ring-3 focus-visible:ring-ring/50 lg:rounded-2xl lg:px-5 lg:py-4 lg:text-[16.5px] [-webkit-tap-highlight-color:transparent]",
                  selected ? "text-background" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {selected ? (
                  <motion.span
                    layoutId="feature-indicator"
                    aria-hidden
                    transition={SPRING_TAB}
                    className="absolute inset-0 -z-10 rounded-[inherit] bg-foreground"
                  />
                ) : null}
                <item.icon className="size-[17px] shrink-0" aria-hidden />
                {item.title}
              </button>
            )
          })}
        </div>

        <div id="feature-panel" role="tabpanel" aria-labelledby={`feature-tab-${feature.key}`} className={cn(STAGE, "min-w-0")}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={feature.key}
              initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
              transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}
              className="grid gap-6"
            >
              <feature.Art />
              <div className="grid gap-2 px-1 pb-1">
                <h3 className="text-[22px] font-semibold tracking-tight">{feature.title}</h3>
                <p className="max-w-[52ch] text-[15.5px] leading-relaxed text-muted-foreground">{feature.body}</p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  )
}
