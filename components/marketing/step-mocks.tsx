import { Globe, Lock, MoreHorizontal, Mic, PhoneOff, Video, UserPlus, EyeOff, BellOff, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { CallGrid } from "@/components/marketing/mocks"

// Small pictures of the four things the scroll stack describes. They are the app's own controls drawn with the app's
// tokens. The post and the people are invented for the picture; the faces in the call are real photographs.

export function StepVisual({ index }: { index: number }) {
  if (index === 0) return <FeedTabs />
  if (index === 1) return <NotInterestedMenu />
  if (index === 2) return <CallTiles />
  return <CircleAccess />
}

function Frame({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-[24px] border border-border bg-background p-5", className)}>{children}</div>
}

function FeedTabs() {
  return (
    <Frame>
      <div className="relative grid grid-cols-2 rounded-full bg-muted p-1 text-[14px] font-semibold">
        <span className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-foreground motion-safe:animate-[feed-tab-slide_7s_ease-in-out_infinite]" />
        <span className="relative z-10 py-2 text-center motion-safe:animate-[feed-tab-first_7s_ease-in-out_infinite]">For you</span>
        <span className="relative z-10 py-2 text-center motion-safe:animate-[feed-tab-second_7s_ease-in-out_infinite]">Following</span>
      </div>
      <div className="mt-4 grid gap-3 text-[13.5px]">
        <div className="flex items-center justify-between rounded-2xl border border-border px-4 py-3">
          <span>Newest from people you follow</span>
          <Clock className="size-4 text-muted-foreground" />
        </div>
        <div className="flex items-center justify-between rounded-2xl border border-border px-4 py-3 text-muted-foreground">
          <span>Ranked from what you like</span>
          <Globe className="size-4" />
        </div>
      </div>
    </Frame>
  )
}

function NotInterestedMenu() {
  const items = [
    { icon: EyeOff, label: "Not interested", tone: "text-foreground" },
    { icon: BellOff, label: "Snooze this topic for 7 days", tone: "text-foreground" },
    { icon: UserPlus, label: "Follow this account", tone: "text-foreground" },
    { icon: Lock, label: "Mute words", tone: "text-foreground" },
  ]
  return (
    <Frame>
      <div className="flex items-start justify-between gap-3">
        <div className="text-[13.5px]">
          <div className="font-semibold">Iris, 2h</div>
          <div className="text-muted-foreground">Photos from the ridge walk on Saturday.</div>
        </div>
        <span className="flex size-8 items-center justify-center rounded-full bg-muted ring-2 ring-[var(--dusk)]/40">
          <MoreHorizontal className="size-4" />
        </span>
      </div>
      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_18px_40px_-24px_rgba(10,10,10,0.4)]">
        {items.map((item, index) => (
          <div key={item.label} className={cn("flex items-center gap-3 px-4 py-3 text-[13.5px]", index > 0 && "border-t border-border")}>
            <item.icon className="size-4 text-muted-foreground" />
            <span className={item.tone}>{item.label}</span>
          </div>
        ))}
      </div>
    </Frame>
  )
}

function CallTiles() {
  return (
    <Frame>
      <CallGrid />
      <div className="mt-4 flex items-center justify-center gap-2.5">
        <span className="flex size-10 items-center justify-center rounded-full border border-border"><Mic className="size-4" /></span>
        <span className="flex size-10 items-center justify-center rounded-full border border-border"><Video className="size-4" /></span>
        <span className="flex h-10 items-center gap-1.5 rounded-full bg-[var(--dusk)] px-4 text-[13px] font-semibold text-white">
          <PhoneOff className="size-3.5" /> Leave
        </span>
      </div>
    </Frame>
  )
}

function CircleAccess() {
  const rows = [
    { name: "Open circle", access: "Open", note: "Anyone can join" },
    { name: "Ask-to-join circle", access: "Ask to join", note: "Applicants answer the question" },
    { name: "Closed circle", access: "Closed", note: "Members only" },
  ]
  return (
    <Frame className="grid gap-3">
      {rows.map((row) => (
        <div key={row.name} className="flex items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3">
          <div>
            <div className="text-[13.5px] font-semibold">{row.name}</div>
            <div className="text-[12.5px] text-muted-foreground">{row.note}</div>
          </div>
          <span className={cn("rounded-full px-3 py-1 text-[12px] font-semibold", row.access === "Closed" ? "bg-foreground text-background" : "bg-muted")}>{row.access}</span>
        </div>
      ))}
    </Frame>
  )
}
