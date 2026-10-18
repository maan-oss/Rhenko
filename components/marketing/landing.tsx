import Link from "next/link"
import { Bookmark, CalendarClock, EyeOff, History, KeyRound, Languages, ListChecks, Mic, PhoneOff, Smile, Sparkles, Video } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { CallMock } from "@/components/marketing/mocks"
import { StepVisual } from "@/components/marketing/step-mocks"
import { GrainBackdrop } from "@/components/marketing/grain-backdrop"
import { ScrollStack } from "@/components/marketing/scroll-stack"
import { PoolsChart } from "@/components/marketing/pools-chart"
import { SiteHeader } from "@/components/marketing/site-header"
import { IntroLoader } from "@/components/marketing/intro-loader"
import { Magnetic } from "@/components/marketing/magnetic"
import { Photo, PHOTOS } from "@/components/marketing/photo"
import { Faq } from "@/components/marketing/faq"
import { SiteFooter } from "@/components/marketing/site-footer"

// Every fact on this page comes from the product's own limits or behaviour. Photographs show real people, credited under
// each one. The scroll effects are CSS, so the page reads fully at rest and with scripts off.

const WRAP = "mx-auto w-full max-w-[1240px] px-5 sm:px-8"
const SECTION = cn(WRAP, "py-28 sm:py-40")
const KICK = "text-[clamp(2.4rem,5.2vw,4.4rem)] leading-[0.98] font-semibold tracking-[-0.04em] text-balance"
const LEAD = "max-w-[40ch] text-[17px] leading-relaxed text-muted-foreground"
const BULLET = "grid grid-cols-[auto_1fr] gap-4"
const DOT = "mt-2.5 size-1.5 rounded-full bg-[var(--dusk)]"

const MARQUEE = [
  "Two tabs, one switch",
  "Not interested means it leaves",
  "Calls next to your messages",
  "Circles with their own charter",
  "Sahayak answers when asked",
  "Polls, drafts and scheduling",
  "Passkeys and two-factor sign-in",
  "Translation in your languages",
]

const STATS = [
  { value: "6", label: "people in one group call" },
  { value: "3 to 15", label: "characters in a handle" },
  { value: "4", label: "photos on one post" },
  { value: "5", label: "accounts signed in on one device" },
]

const FEED = [
  {
    title: "Two tabs, one switch.",
    body: "For you ranks posts from what you like. Following shows the newest posts from people you follow. Switch between them at any time.",
  },
  {
    title: "Not interested means it leaves.",
    body: "Tap Not interested on a post and it is gone from your feed. You can snooze the topic for seven days, follow the account, or mute words.",
  },
  {
    title: "Calls next to your messages.",
    body: "Start a call from a conversation. A group holds up to six people. Mute, switch the camera, or leave whenever you like.",
  },
  {
    title: "Circles with their own charter.",
    body: "Each circle sets its name, tagline and a charter of up to 1,000 characters. It can be open, ask to join, or closed to members only.",
  },
]

const CIRCLE_ACCESS = [
  { name: "Open circle", access: "Open", note: "Anyone can join." },
  { name: "Ask-to-join circle", access: "Ask to join", note: "Each applicant answers a question of up to 160 characters." },
  { name: "Closed circle", access: "Closed", note: "Only members can take part." },
]

const FEATURES = [
  { icon: Sparkles, title: "Sahayak answers", body: "Mention @sahayak in a post to ask. The reply lands in the thread." },
  { icon: Smile, title: "Stickers on photos", body: "Place stickers on a photo before you post it." },
  { icon: History, title: "Edit history", body: "Edits are tracked, so you can see how a post changed." },
  { icon: ListChecks, title: "Polls", body: "Ask a question with a set of answers, and let people choose." },
  { icon: CalendarClock, title: "Drafts and schedule", body: "Keep a draft for later, or pick a time to post." },
  { icon: KeyRound, title: "Passkeys and two-factor", body: "Sign in with a passkey, or add a second step to your sign-in." },
  { icon: Languages, title: "Translation", body: "Translate posts into a language you speak. You can list up to twelve." },
  { icon: Bookmark, title: "Bookmarks and lists", body: "Save posts to read later, and sort accounts into lists." },
]

export function Landing() {
  return (
    <div className="overflow-x-clip bg-background text-foreground">
      <IntroLoader />
      <SiteHeader />

      <GrainBackdrop className="relative min-h-[100svh]" fade="bottom">
        <div
          id="top"
          className={cn(WRAP, "grid min-h-[100svh] content-center gap-16 pt-32 pb-24 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:gap-12 lg:pt-28")}
        >
          <div className="relative z-10 grid gap-9">
            <p className="mk-rise inline-flex w-fit items-center gap-2.5 rounded-full border border-border bg-background/70 px-3.5 py-1.5 text-[13px] text-muted-foreground backdrop-blur">
              <span aria-hidden className="size-1.5 rounded-full bg-[var(--dusk)]" />
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
                  <dd className="order-1 text-[clamp(1.6rem,2.5vw,2.25rem)] leading-none font-semibold tracking-[-0.03em] whitespace-nowrap tabular-nums">{stat.value}</dd>
                  <dt className="order-2 text-[13.5px] leading-snug text-muted-foreground">{stat.label}</dt>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative z-10 mx-auto w-full max-w-[540px]">
            <Photo
              photo={PHOTOS.group}
              priority
              motion="drift"
              ratio="4 / 5"
              sizes="(min-width: 1024px) 520px, 92vw"
              className="border border-border shadow-[0_40px_120px_-50px_rgba(10,10,10,0.6)]"
            />
            <div className="mk-float absolute top-[12%] -left-3 z-10 w-[min(290px,74%)] rounded-2xl border border-border bg-background/92 p-4 shadow-[0_24px_60px_-30px_rgba(10,10,10,0.5)] backdrop-blur-xl sm:-left-10">
              <p className="flex items-center gap-2 text-[14px] font-semibold">
                <EyeOff className="size-4" aria-hidden />
                Not interested
              </p>
              <p className="mt-1 text-[13px] leading-snug text-muted-foreground">This post leaves your feed. You can snooze the topic for seven days.</p>
            </div>
            <div className="mk-float-slow absolute right-[-6px] bottom-[16%] z-10 w-[min(268px,72%)] rounded-2xl border border-border bg-background/92 p-4 shadow-[0_24px_60px_-30px_rgba(10,10,10,0.5)] backdrop-blur-xl sm:-right-6">
              <div className="flex items-center justify-between text-[14px]">
                <p className="font-semibold">Group call</p>
                <p className="text-[12.5px] text-muted-foreground tabular-nums">4 of 6</p>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} aria-hidden className="aspect-square rounded-xl bg-muted" />
                ))}
              </div>
              <div className="mt-3 flex items-center justify-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-full border border-border">
                  <Mic className="size-4" aria-hidden />
                </span>
                <span className="flex size-9 items-center justify-center rounded-full border border-border">
                  <Video className="size-4" aria-hidden />
                </span>
                <span className="flex h-9 items-center gap-1.5 rounded-full bg-[var(--dusk)] px-3.5 text-[12.5px] font-semibold text-white">
                  <PhoneOff className="size-3.5" aria-hidden />
                  Leave
                </span>
              </div>
            </div>
          </div>
        </div>
      </GrainBackdrop>

      <section aria-label="What Rhenko does" className="mk-marquee-band overflow-hidden border-y border-border bg-foreground text-background">
        <div className="flex w-max py-6">
          {[0, 1].map((copy) => (
            <ul key={copy} aria-hidden={copy === 1} className="mk-marquee flex shrink-0 items-center">
              {MARQUEE.map((item) => (
                <li key={item} className="flex items-center gap-10 pr-10 text-[clamp(1.5rem,3.4vw,2.6rem)] leading-none font-semibold tracking-[-0.03em] whitespace-nowrap">
                  {item}
                  <span aria-hidden className="size-2.5 rounded-full bg-foreground" />
                </li>
              ))}
            </ul>
          ))}
        </div>
      </section>

      <section id="feed" className={SECTION}>
        <div className="mk-reveal grid gap-6 md:grid-cols-[0.9fr_1.1fr] md:items-end">
          <h2 className={KICK}>Your feed, steered by you.</h2>
          <p className={LEAD}>Four things you can change, each one shown on its own card as you scroll.</p>
        </div>
        <div className="mt-16">
          <ScrollStack>
            {FEED.map((step, index) => (
              <article
                key={step.title}
                className="grid gap-10 rounded-[32px] border border-border bg-card p-7 shadow-[0_30px_80px_-50px_rgba(10,10,10,0.45)] md:grid-cols-[0.9fr_1.1fr] md:items-center md:p-12"
              >
                <div className="grid gap-5">
                  <p className="text-[13px] font-medium text-muted-foreground tabular-nums">
                    {index + 1} of {FEED.length}
                  </p>
                  <h3 className="text-[clamp(1.9rem,3.6vw,2.8rem)] leading-[1.02] font-semibold tracking-[-0.035em] text-balance">{step.title}</h3>
                  <p className="max-w-[42ch] text-[16.5px] leading-relaxed text-muted-foreground">{step.body}</p>
                </div>
                <StepVisual index={index} />
              </article>
            ))}
          </ScrollStack>
        </div>
      </section>

      <section id="ranking" className={cn(WRAP, "grid gap-16 py-28 sm:py-40 lg:grid-cols-[0.85fr_1.15fr] lg:items-start")}>
        <div className="mk-reveal grid gap-6">
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
        </div>
        <figure className="mk-reveal rounded-[32px] border border-border bg-card p-5 shadow-[0_30px_80px_-50px_rgba(10,10,10,0.45)] sm:p-8">
          <PoolsChart />
          <figcaption className="mt-4 text-[13px] text-muted-foreground">Posts each pool can hold. The sizes are the server&apos;s own limits.</figcaption>
        </figure>
      </section>

      <section id="calls" className={cn(WRAP, "grid gap-16 py-28 sm:py-40 lg:grid-cols-[1.05fr_0.95fr] lg:items-center")}>
        <div className="relative mk-reveal">
          <Photo photo={PHOTOS.videoCall} motion="in" ratio="4 / 4.8" sizes="(min-width: 1024px) 600px, 100vw" className="border border-border" />
          <div className="absolute right-3 bottom-14 z-10 w-[min(320px,calc(100%-24px))] sm:right-6">
            <CallMock />
          </div>
        </div>
        <div className="mk-reveal grid gap-7">
          <h2 className={KICK}>Calls, next to your messages.</h2>
          <p className={LEAD}>Start a call from a conversation. The call screen has the controls you need, and nothing you do not.</p>
          <ul className="grid gap-4 border-t border-border pt-6 text-[15.5px] leading-relaxed text-muted-foreground">
            <li className={BULLET}>
              <span aria-hidden className={DOT} />
              A group call holds up to six people.
            </li>
            <li className={BULLET}>
              <span aria-hidden className={DOT} />
              Mute, the camera and Leave sit on the call screen itself.
            </li>
            <li className={BULLET}>
              <span aria-hidden className={DOT} />
              If your connection drops, the call tries to reconnect for up to 30 seconds.
            </li>
          </ul>
        </div>
      </section>

      <section id="circles" className={SECTION}>
        <div className="mk-reveal grid gap-6 md:grid-cols-[1fr_1fr] md:items-end">
          <h2 className={KICK}>Circles with their own charter.</h2>
          <p className={LEAD}>A circle has a name of up to 50 characters, a tagline, and a charter of up to 1,000 characters.</p>
        </div>
        <Photo photo={PHOTOS.coffee} motion="in" ratio="21 / 9" sizes="100vw" className="mk-reveal mt-14" />
        <div className="mk-reveal mt-6 grid gap-5 md:grid-cols-3">
          {CIRCLE_ACCESS.map((circle) => (
            <article key={circle.name} className="grid gap-4 rounded-[28px] border border-border p-7 transition-colors duration-300 hover:bg-card">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[17px] font-semibold tracking-tight">{circle.name}</h3>
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-[12.5px] font-semibold",
                    circle.access === "Closed" ? "bg-foreground text-background" : "bg-muted text-foreground"
                  )}
                >
                  {circle.access}
                </span>
              </div>
              <p className="text-[15px] leading-relaxed text-muted-foreground">{circle.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="features" className={SECTION}>
        <div className="mk-reveal grid gap-6 md:grid-cols-[1fr_1fr] md:items-end">
          <h2 className={KICK}>Everything else, built in.</h2>
          <p className={LEAD}>The rest of the app is here too, from polls to passkeys. Each one works the same on a phone and a laptop.</p>
        </div>
        <div className="mk-reveal mt-14 grid gap-px overflow-hidden rounded-[28px] border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="group grid content-start gap-5 bg-background p-7 transition-colors duration-300 hover:bg-card">
              <feature.icon className="size-6 text-[var(--dusk)] transition-transform duration-500 group-hover:-translate-y-0.5" aria-hidden />
              <div className="grid gap-2">
                <h3 className="text-[16.5px] font-semibold tracking-tight">{feature.title}</h3>
                <p className="text-[14.5px] leading-relaxed text-muted-foreground">{feature.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="faq" className={cn(WRAP, "grid gap-14 py-28 sm:py-40 lg:grid-cols-[0.8fr_1.2fr]")}>
        <div className="mk-reveal grid content-start gap-5">
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
        </div>
        <div className="mk-reveal">
          <Faq />
        </div>
      </section>

      <section id="start" className="mx-auto w-full max-w-[1240px] px-4 pb-28 sm:px-8 sm:pb-40">
        <GrainBackdrop calm fade="both" className="rounded-[40px] border border-border">
          <div className="mk-reveal grid items-center gap-12 p-8 sm:p-14 lg:grid-cols-[1fr_0.85fr] lg:p-16">
            <div className="grid gap-8">
              <h2 className="text-[clamp(2.6rem,6vw,5rem)] leading-[0.95] font-semibold tracking-[-0.045em] text-balance">Start a conversation.</h2>
              <p className="max-w-[38ch] text-[17px] leading-relaxed text-muted-foreground">
                Pick a handle, add a photo if you like, and follow the people you already talk to.
              </p>
              <div className="flex flex-wrap items-center gap-3">
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
            </div>
            <Photo photo={PHOTOS.walking} ratio="4 / 4.4" sizes="(min-width: 1024px) 420px, 100vw" className="border border-border" />
          </div>
        </GrainBackdrop>
      </section>

      <SiteFooter />
    </div>
  )
}
