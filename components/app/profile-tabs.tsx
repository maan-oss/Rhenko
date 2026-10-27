"use client"

import { useId } from "react"
import Link from "@/components/app/link"
import { AnimatePresence, motion } from "motion/react"
import { Heart, Images, Reply, Repeat2, Rows3, Sparkles, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { TabFill, usePressedTab } from "@/components/app/tabs"

export type ProfileSection = "posts" | "highlights" | "replies" | "media" | "reposts" | "likes"

const ICONS: Record<ProfileSection, LucideIcon> = {
  posts: Rows3,
  highlights: Sparkles,
  replies: Reply,
  media: Images,
  reposts: Repeat2,
  likes: Heart,
}

export type ProfileTabItem = { href: string; label: string; active: boolean; section: ProfileSection }

// A profile's sections as one row of round icons. The chosen section is the only one with a name: its filled pill slides
// across from the last choice when it is pressed, and the name opens beside the icon. Each section is still a link with its
// own address, and its name is the link's accessible name.
export function ProfileTabs({ items, label }: { items: ProfileTabItem[]; label: string }) {
  const { current, press } = usePressedTab(items)
  const id = useId()
  return (
    <nav
      aria-label={label}
      className="flex items-center justify-between gap-1 overflow-x-auto border-b border-border px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {items.map((item) => {
        const Icon = ICONS[item.section]
        const active = item.href === current
        return (
          <Link
            key={item.href}
            href={item.href}
            scroll={false}
            aria-label={item.label}
            title={item.label}
            aria-current={active ? "page" : undefined}
            onClick={() => {
              // The section content slides in the way the pill moved: right for a later section, left for an earlier one.
              const from = items.findIndex((other) => other.href === current)
              const to = items.findIndex((other) => other.href === item.href)
              if (from !== -1 && to !== -1 && from !== to) document.documentElement.style.setProperty("--tab-dir", to > from ? "1" : "-1")
              press(item.href)
            }}
            className={cn(
              "tap-44 relative inline-flex h-10 shrink-0 items-center justify-center rounded-full outline-none transition-colors duration-200",
              active ? "pr-4 pl-3 text-background" : "w-10 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
            )}
          >
            {active ? <TabFill layoutId={`${id}-section`} /> : null}
            <span className="relative inline-flex items-center">
              <Icon className="size-[18px] shrink-0" strokeWidth={2} aria-hidden="true" />
              <AnimatePresence initial={false}>
                {active ? (
                  <motion.span
                    key="name"
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
                    aria-hidden="true"
                    className="overflow-hidden pl-2 text-[14px] font-semibold whitespace-nowrap"
                  >
                    {item.label}
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
