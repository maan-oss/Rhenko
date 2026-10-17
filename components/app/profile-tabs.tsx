"use client"

import Link from "next/link"
import { Heart, Images, Reply, Repeat2, Rows3, Sparkles, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { usePressedTab } from "@/components/app/tabs"

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

// A profile's sections as a row of round icons. The chosen section opens out into a filled pill that carries its name, and
// the name closes again when another section is chosen: the old name shrinks away first, then the new one opens. Each
// section is still a link with its own address, and its name is the link's accessible name.
export function ProfileTabs({ items, label }: { items: ProfileTabItem[]; label: string }) {
  const { current, press } = usePressedTab(items)
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
            onClick={() => press(item.href)}
            className={cn(
              "inline-flex h-10 shrink-0 items-center rounded-full transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-foreground pr-4 pl-3 text-background"
                : "w-10 justify-center text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
            )}
          >
            <Icon className="size-[18px] shrink-0" strokeWidth={2} aria-hidden="true" />
            <span
              className={cn(
                "grid transition-[grid-template-columns,opacity,padding] ease-[cubic-bezier(0.2,0.7,0.2,1)]",
                active ? "grid-cols-[1fr] pl-2 opacity-100 delay-100 duration-300" : "grid-cols-[0fr] pl-0 opacity-0 duration-150"
              )}
            >
              <span aria-hidden={!active} className="min-w-0 overflow-hidden text-[14px] font-semibold whitespace-nowrap">
                {item.label}
              </span>
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
