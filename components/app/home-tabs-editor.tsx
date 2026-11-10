"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, ChevronUp, Hash, ListTree, X } from "lucide-react"
import { toast } from "sonner"
import { moveHomeTab, unpinHomeTab } from "@/actions/home-tabs"
import type { HomeTabRef, PinnedTab } from "@/lib/timelines"
import { MAX_HOME_TABS } from "@/lib/rules"

const ROW_BUTTON =
  "tap-44 grid size-11 place-items-center rounded-full text-muted-foreground transition-colors outline-none hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-35"

// The Home tabs after For you and Following, in the order they show. Each row moves one place up or down, or comes off Home.
export function HomeTabsEditor({ tabs }: { tabs: PinnedTab[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function refs(tab: PinnedTab): HomeTabRef {
    return tab.kind === "list" ? { kind: "list", id: tab.id } : { kind: "topic", tag: tab.tag }
  }

  function move(tab: PinnedTab, direction: -1 | 1) {
    startTransition(async () => {
      const result = await moveHomeTab(refs(tab), direction)
      if (!result.ok) toast.error(result.error)
      router.refresh()
    })
  }

  function unpin(tab: PinnedTab) {
    startTransition(async () => {
      const result = await unpinHomeTab(refs(tab))
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Taken off Home.")
      router.refresh()
    })
  }

  if (tabs.length === 0) {
    return (
      <p className="rounded-2xl bg-muted px-4 py-4 text-[14px] leading-relaxed text-muted-foreground">
        Pin a list from its page, or a topic under the For you feed, and it becomes a tab on Home.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] text-muted-foreground">
        {tabs.length} of {MAX_HOME_TABS} tabs
      </p>
      <ol className="flex flex-col overflow-hidden rounded-2xl border border-border" aria-label="Home tabs, in order">
        {tabs.map((tab, index) => {
          const label = tab.kind === "list" ? tab.name : `#${tab.tag}`
          const Icon = tab.kind === "list" ? ListTree : Hash
          return (
            <li key={tab.kind === "list" ? `list:${tab.id}` : `topic:${tab.tag}`} className="flex items-center gap-2 border-t border-border px-2 first:border-t-0">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground" aria-hidden="true">
                <Icon className="size-[18px]" strokeWidth={2} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col py-2">
                <span className="truncate text-[15px] font-semibold">{label}</span>
                <span className="text-[13px] text-muted-foreground">{tab.kind === "list" ? "List" : "Topic"}</span>
              </span>
              <button
                type="button"
                className={ROW_BUTTON}
                aria-label={`Move ${label} up`}
                title="Move up"
                disabled={pending || index === 0}
                onClick={() => move(tab, -1)}
              >
                <ChevronUp className="size-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                className={ROW_BUTTON}
                aria-label={`Move ${label} down`}
                title="Move down"
                disabled={pending || index === tabs.length - 1}
                onClick={() => move(tab, 1)}
              >
                <ChevronDown className="size-5" aria-hidden="true" />
              </button>
              <button type="button" className={ROW_BUTTON} aria-label={`Take ${label} off Home`} title="Take off Home" disabled={pending} onClick={() => unpin(tab)}>
                <X className="size-5" aria-hidden="true" />
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
