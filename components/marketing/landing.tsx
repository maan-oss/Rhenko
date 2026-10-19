import Link from "next/link"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { GrainBackdrop } from "@/components/marketing/grain-backdrop"
import { PoolsChart } from "@/components/marketing/pools-chart"
import { SiteHeader } from "@/components/marketing/site-header"
import { IntroLoader } from "@/components/marketing/intro-loader"
import { Magnetic } from "@/components/marketing/magnetic"
import { Faq } from "@/components/marketing/faq"
import { SiteFooter } from "@/components/marketing/site-footer"
import { HeroWindow } from "@/components/marketing/hero-window"
import { FeaturesShowcase } from "@/components/marketing/features-showcase"
import { RhenkoMotion, Reveal } from "@/components/marketing/chapter"
import {
  CallsChapter,
  CirclesChapter,
  FeedChapter,
  ManifestoChapter,
  PhotosChapter,
  UndoChapter,
} from "@/components/marketing/chapters"

// Every fact on this page comes from the product's own limits or behaviour. The people and posts in the pictures are invented.
// The scenes are pinned sections that move with the scroll, and each one reads fully as text when reduced motion is on.

const WRAP = "mx-auto w-full max-w-[1240px] px-5 sm:px-8"
const KICK = "text-[clamp(2.4rem,5.2vw,4.4rem)] leading-[0.98] font-semibold tracking-[-0.04em] text-balance"
const LEAD = "max-w-[40ch] text-[17px] leading-relaxed text-muted-foreground"
const BULLET = "grid grid-cols-[auto_1fr] gap-4"
const DOT = "mt-2.5 size-1.5 rounded-full bg-foreground"

const MARQUEE = [
  "Two tabs, one switch",
  "Not interested means it leaves",
  "Undo for ten seconds",
  "Calls next to your messages",
  "Circles with their own charter",
  "Sahayak answers when asked",
  "Location stripped on upload",
  "Passkeys and two-factor sign-in",
]

const STATS = [
  { value: "6", label: "people in one group call" },
  { value: "3 to 15", label: "characters in a handle" },
  { value: "4", label: "photos on one post" },
  { value: "5", label: "accounts signed in on one device" },
]

export function Landing() {
  return (
    <RhenkoMotion>
      <div className="overflow-x-clip bg-background text-foreground">
        <IntroLoader />
        <SiteHeader />

        <GrainBackdrop className="relative min-h-[100svh]">
          <div
            id="top"
            className={cn(WRAP, "grid min-h-[100svh] content-center gap-16 pt-32 pb-24 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:gap-12 lg:pt-28")}
          >
            <div className="relative z-10 grid gap-9">
              <p className="mk-rise inline-flex w-fit items-center gap-2.5 rounded-full border border-border bg-background/70 px-3.5 py-1.5 text-[13px] text-muted-foreground backdrop-blur">
                <span aria-hidden className="size-1.5 rounded-full bg-foreground" />
                Accounts are for people 18 and older
              </p>
              <h1 className="text-[clamp(3.25rem,6vw,5.5rem)] leading-[0.92] font-semibold tracking-[-0.05em] text-balance">
                <span className="block overflow-hidden pb-[0.06em]">
                  <span className="mk-line">Public conversation,</span>
                </span>
                <span className="block overflow-hidden pb-[0.06em]">
                  <span className="mk-line mk-delay-1">on your terms.</span>
                </span>
              </h1>
              <p className="mk-rise mk-delay-2 max-w-[35rem] text-[18px] leading-relaxed text-muted-foreground">
                Follow people, start calls with up to six others, and run circles with their own rules. You decide what your feed shows,
                and what leaves it.
              </p>
              <div className="mk-rise mk-delay-3 flex flex-wrap items-center gap-3">
                <Magnetic>
                  <Button render={<Link href="/signup" />} size="lg" className="h-13 rounded-full px-7 text-[15px] font-semibold">
                    Create an account
                  </Button>
                </Magnetic>
                <a
                  href="#feed"
                  className="inline-flex h-13 items-center rounded-full border border-border bg-background/60 px-6 text-[15px] font-medium backdrop-blur transition-colors hover:bg-foreground/5"
                >
                  See how the feed works
                </a>
              </div>
              <dl className="mk-rise mk-delay-4 grid grid-cols-2 gap-x-8 gap-y-6 border-t border-border pt-7 sm:grid-cols-4">
                {STATS.map((stat) => (
                  <div key={stat.label} className="grid gap-1">
                    <dd className="order-1 text-[clamp(1.6rem,2.5vw,2.25rem)] leading-none font-semibold tracking-[-0.03em] whitespace-nowrap tabular-nums">
                      {stat.value}
                    </dd>
                    <dt className="order-2 text-[13.5px] leading-snug text-muted-foreground">{stat.label}</dt>
                  </div>
                ))}
              </dl>
            </div>

            <div className="relative z-10 mx-auto w-full max-w-[540px]">
              <HeroWindow />
            </div>
          </div>
        </GrainBackdrop>

        <section aria-label="What Rhenko does" className="mk-marquee-band overflow-hidden border-y border-border bg-foreground text-background">
          <div className="flex w-max py-6">
            {[0, 1].map((copy) => (
              <ul key={copy} aria-hidden={copy === 1} className="mk-marquee flex shrink-0 items-center">
                {MARQUEE.map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-10 pr-10 text-[clamp(1.5rem,3.4vw,2.6rem)] leading-none font-semibold tracking-[-0.03em] whitespace-nowrap"
                  >
                    {item}
                    <span aria-hidden className="size-2.5 rounded-full bg-background" />
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </section>

        <ManifestoChapter />
        <FeedChapter />
        <UndoChapter />
        <CallsChapter />
        <CirclesChapter />
        <PhotosChapter />

        <section id="ranking" className={cn(WRAP, "grid gap-16 py-28 sm:py-40 lg:grid-cols-[0.85fr_1.15fr] lg:items-start")}>
          <Reveal className="grid gap-6">
            <h2 className={KICK}>How the feed ranks, in plain numbers.</h2>
            <p className={LEAD}>
              Each feed draws from candidate pools. The chart shows how many posts each pool can hold, largest first, so you can see where
              a feed&apos;s posts come from.
            </p>
            <ul className="grid gap-4 border-t border-border pt-6 text-[15.5px] leading-relaxed text-muted-foreground">
              <li className={BULLET}>
                <span aria-hidden className={DOT} />
                The order runs by size, so the order is the information.
              </li>
              <li className={BULLET}>
                <span aria-hidden className={DOT} />
                Hover a bar to see how many posts that pool can hold.
              </li>
              <li className={BULLET}>
                <span aria-hidden className={DOT} />
                Your feed mixes these pools, so no single list decides what you see.
              </li>
            </ul>
          </Reveal>
          <Reveal>
            <figure className="rounded-[32px] border border-border bg-card p-5 shadow-[0_30px_80px_-50px_rgba(10,10,10,0.45)] sm:p-8">
              <PoolsChart />
              <figcaption className="mt-4 text-[13px] text-muted-foreground">Posts each pool can hold. The sizes are the server&apos;s own limits.</figcaption>
            </figure>
          </Reveal>
        </section>

        <FeaturesShowcase />

        <section id="faq" className={cn(WRAP, "grid gap-14 py-28 sm:py-40 lg:grid-cols-[0.8fr_1.2fr]")}>
          <Reveal className="grid content-start gap-5">
            <h2 className={KICK}>Questions people ask first.</h2>
            <p className={LEAD}>Each answer states a rule the product keeps. The Rules and Safety pages go further.</p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link href="/rules" className="inline-flex h-10 items-center rounded-full border border-border px-5 text-[14px] font-medium transition-colors hover:bg-foreground/5">
                Read the rules
              </Link>
              <Link href="/safety" className="inline-flex h-10 items-center rounded-full border border-border px-5 text-[14px] font-medium transition-colors hover:bg-foreground/5">
                Safety
              </Link>
            </div>
          </Reveal>
          <Reveal>
            <Faq />
          </Reveal>
        </section>

        <section id="start" className="mx-auto w-full max-w-[1240px] px-4 pb-28 sm:px-8 sm:pb-40">
          <GrainBackdrop calm fade="both" className="rounded-[40px] border border-border">
            <Reveal className="grid justify-items-center gap-9 px-6 py-20 text-center sm:py-28">
              <h2 className="max-w-[16ch] text-[clamp(2.6rem,6vw,5rem)] leading-[0.95] font-semibold tracking-[-0.045em] text-balance">
                Start a conversation.
              </h2>
              <p className="max-w-[38ch] text-[17px] leading-relaxed text-muted-foreground">
                Pick a handle, add a photo if you like, and follow the people you already talk to.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Magnetic>
                  <Button render={<Link href="/signup" />} size="lg" className="h-13 rounded-full px-7 text-[15px] font-semibold">
                    Create an account
                  </Button>
                </Magnetic>
                <Link
                  href="/login"
                  className="inline-flex h-13 items-center rounded-full border border-border bg-background/60 px-6 text-[15px] font-medium backdrop-blur transition-colors hover:bg-foreground/5"
                >
                  Log in
                </Link>
              </div>
            </Reveal>
          </GrainBackdrop>
        </section>

        <SiteFooter />
      </div>
    </RhenkoMotion>
  )
}
