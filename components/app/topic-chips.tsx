import Link from "@/components/app/link"
import { topicLabel } from "@/lib/rules"
import { cn } from "@/lib/utils"

const CHIP =
  "tap-44 inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-[13px] font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"

// The topics the viewer follows, as chips above For you. One is active at a time. All goes back to the whole feed.
export function TopicChips({ topics, active }: { topics: string[]; active: string | null }) {
  return (
    <nav aria-label="Filter For you by topic" className="flex gap-2 overflow-x-auto px-4 pt-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <Link
        href="/"
        aria-current={active === null ? "page" : undefined}
        className={cn(CHIP, active === null ? "border-foreground bg-foreground text-background" : "border-border text-foreground hover:bg-muted")}
      >
        All
      </Link>
      {topics.map((tag) => (
        <Link
          key={tag}
          href={`/?topic=${encodeURIComponent(tag)}`}
          aria-current={active === tag ? "page" : undefined}
          className={cn(CHIP, active === tag ? "border-foreground bg-foreground text-background" : "border-border text-foreground hover:bg-muted")}
        >
          {topicLabel(tag)}
        </Link>
      ))}
    </nav>
  )
}
