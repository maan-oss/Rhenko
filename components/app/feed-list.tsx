import Link from "next/link"
import { BlurFade } from "@/components/ui/blur-fade"
import { PostCard } from "@/components/app/post-card"
import type { FeedItem } from "@/lib/data"
import type { Viewer } from "@/lib/auth"

export function FeedList({
  items,
  viewer,
  emptyTitle,
  emptyBody,
}: {
  items: FeedItem[]
  viewer: Viewer
  emptyTitle: string
  emptyBody: string
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-2 px-4 py-16">
        <p className="text-lg font-semibold">{emptyTitle}</p>
        <p className="max-w-sm text-muted-foreground">{emptyBody}</p>
      </div>
    )
  }
  return (
    <div>
      {items.map((item, index) => (
        <BlurFade key={item.key} delay={Math.min(index, 8) * 0.03}>
          <PostCard post={item.post} viewer={viewer} repostedBy={item.repostedBy} />
        </BlurFade>
      ))}
    </div>
  )
}

export function MoreLink({ href }: { href: string | null }) {
  if (!href) return null
  return (
    <div className="flex justify-center px-4 py-6">
      <Link href={href} scroll={false} className="rounded-lg border border-border px-5 py-2 text-sm font-semibold hover:bg-muted">
        Show older posts
      </Link>
    </div>
  )
}
