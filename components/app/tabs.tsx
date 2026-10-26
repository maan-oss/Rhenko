"use client"

import { useId, useState, type ReactNode } from "react"
import Link from "next/link"
import { AnimatePresence, motion } from "motion/react"
import { cn } from "@/lib/utils"
import { SPRING_SELECT } from "@/components/app/motion"

export type TabItem = {
  href: string
  label: string
  // The icon for a tab. TabLinks draws words only; IconTabLinks draws it, and opens to show the word when chosen.
  icon?: ReactNode
  active: boolean
  // A small count shown after the label, for things like pending requests.
  badge?: number
}

// The one motion for an active fill that slides between items.
export const TAB_FILL = SPRING_SELECT

// The selected choice's surface. It is shared by layoutId, so it travels from the last choice to this one rather than
// fading out and in. By default it is a solid fill in the text colour; a caller can pass its own surface.
export function TabFill({ layoutId, className }: { layoutId: string; className?: string }) {
  return (
    <motion.span
      aria-hidden
      layoutId={layoutId}
      className={cn("absolute inset-0 rounded-full", className)}
      style={className ? undefined : { backgroundColor: "var(--tab-fill, var(--foreground))" }}
      transition={TAB_FILL}
    />
  )
}

// The tab the person has just pressed. The raised tab moves on the press, before the page has loaded, and the page follows.
// The press is dropped once the page shows that tab, or if the page still shows the tab it started from.
export function usePressedTab(items: Pick<TabItem, "href" | "active">[]): { current: string | null; press: (href: string) => void } {
  const served = items.find((item) => item.active)?.href ?? null
  const [pressed, setPressed] = useState<{ from: string | null; to: string } | null>(null)
  const current = pressed && pressed.from === served ? pressed.to : served
  return { current, press: (href) => setPressed({ from: served, to: href }) }
}

// The tabs at the top of Home: one icon each on a track. The chosen tab is filled black and opens to show its word, and the
// others stay icons, so the row is only as wide as the choice needs. The fill slides to the new choice while the two tabs
// change size, so a switch reads as one movement rather than a swap of words.
export function IconTabLinks({ items, label = "Sections", className }: { items: TabItem[]; label?: string; className?: string }) {
  const { current, press } = usePressedTab(items)
  const id = useId()
  return (
    <nav aria-label={label} className={cn("flex items-center gap-1 rounded-full bg-muted p-1", className)}>
      {items.map((item) => {
        const active = item.href === current
        return (
          <motion.span key={item.href} layout transition={TAB_FILL} className="relative flex">
            <Link
              href={item.href}
              scroll={false}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              title={item.label}
              onClick={() => press(item.href)}
              className={cn(
                "tap-44 relative isolate flex h-10 items-center justify-center gap-2 rounded-full text-[14px] font-semibold whitespace-nowrap outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring",
                active ? "px-3.5 text-background" : "w-10 text-muted-foreground hover:text-foreground"
              )}
            >
              {active ? <TabFill layoutId={`${id}-tab`} className="-z-10 bg-foreground" /> : null}
              <span className="flex shrink-0 [&>svg]:size-[18px]" aria-hidden="true">
                {item.icon}
              </span>
              <AnimatePresence initial={false}>
                {active ? (
                  <motion.span
                    key="word"
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: "auto", opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={TAB_FILL}
                    className="overflow-hidden"
                  >
                    {item.label}
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </Link>
          </motion.span>
        )
      })}
    </nav>
  )
}

// The tabs at the top of a page: one track of words, with the chosen tab lifted onto a raised surface. The raised surface
// is one shared element that slides between the words, and it casts a soft neutral shadow, so it reads as a layer on the
// track rather than a rule under the words. Each tab is a link, so every section keeps its own address.
export function TabLinks({ items, label = "Sections", className }: { items: TabItem[]; label?: string; className?: string }) {
  const { current, press } = usePressedTab(items)
  const id = useId()
  return (
    <nav
      aria-label={label}
      className={cn("mx-4 my-2 flex gap-1 overflow-x-auto rounded-full bg-muted p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}
    >
      {items.map((item) => {
        const active = item.href === current
        return (
          <Link
            key={item.href}
            href={item.href}
            scroll={false}
            aria-current={active ? "page" : undefined}
            onClick={() => press(item.href)}
            className={cn(
              "tap-44 relative isolate flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-[14px] font-semibold whitespace-nowrap outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {active ? (
              <TabFill
                layoutId={`${id}-tab`}
                className="-z-10 bg-background shadow-[0_1px_2px_rgba(0,0,0,0.14),0_4px_12px_-6px_rgba(0,0,0,0.28)]"
              />
            ) : null}
            {item.label}
            {item.badge ? (
              <span className="grid min-w-5 place-items-center rounded-full bg-foreground px-1.5 text-[11px] leading-5 font-semibold text-background">
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
