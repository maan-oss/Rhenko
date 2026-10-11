import Link from "next/link"
import { cn } from "@/lib/utils"

// Horizontal section links for pages with many sections (folders, search types).
export function ScrollTabs({ items }: { items: { href: string; label: string; active: boolean }[] }) {
  return (
    <nav aria-label="Sections" className="flex overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          scroll={false}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "relative shrink-0 px-5 py-3.5 text-[15px] font-semibold transition-colors hover:bg-muted/50",
            item.active ? "text-foreground after:absolute after:inset-x-4 after:bottom-0 after:h-[3px] after:bg-dusk" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
