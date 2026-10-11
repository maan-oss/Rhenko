"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { BlurFade } from "@/components/ui/blur-fade"
import { MoveBookmark } from "@/components/app/move-bookmark"
import { PostCard } from "@/components/app/post-card"
import type { FeedItem } from "@/lib/data"
import type { FeedSpec } from "@/lib/feeds"
import type { Viewer } from "@/lib/auth"

type Props = {
  items: FeedItem[]
  next?: string | null
  spec?: FeedSpec
  viewer: Viewer
  emptyTitle: string
  emptyBody: string
  folders?: { id: string; name: string }[]
}

// Renders a feed and loads older pages as the reader reaches the end.
export function FeedList({ items: initialItems, next: initialNext = null, spec, viewer, emptyTitle, emptyBody, folders }: Props) {
  const [items, setItems] = useState(initialItems)
  const [next, setNext] = useState<string | null>(initialNext)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null)
  const busy = useRef(false)

  // A server refresh (new posts, a like, a realtime update) replaces the first page.
  const [seed, setSeed] = useState(initialItems)
  if (seed !== initialItems) {
    setSeed(initialItems)
    setItems(initialItems)
    setNext(initialNext)
  }

  const loadMore = useCallback(async () => {
    if (!next || !spec || busy.current) return
    busy.current = true
    setLoading(true)
    setFailed(false)
    try {
      const url = `/api/feed?spec=${encodeURIComponent(JSON.stringify(spec))}&cursor=${encodeURIComponent(next)}`
      const response = await fetch(url, { headers: { Accept: "application/json" } })
      if (!response.ok) throw new Error("Could not load")
      const page = (await response.json()) as { items: FeedItem[]; next: string | null }
      setItems((current) => {
        const seen = new Set(current.map((item) => item.key))
        return [...current, ...page.items.filter((item) => !seen.has(item.key))]
      })
      setNext(page.next)
    } catch {
      setFailed(true)
    } finally {
      busy.current = false
      setLoading(false)
    }
  }, [next, spec])

  useEffect(() => {
    const element = sentinel.current
    if (!element || !next || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore()
      },
      { rootMargin: "600px 0px" }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [next, loadMore])

  if (items.length === 0 && !next) {
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
        <BlurFade key={item.key} delay={Math.min(index, 6) * 0.03}>
          <PostCard post={item.post} viewer={viewer} repostedBy={item.repostedBy} />
          {folders ? <MoveBookmark postId={item.post.id} folderId={item.folderId} folders={folders} /> : null}
        </BlurFade>
      ))}
      {next ? (
        <div ref={sentinel} className="flex flex-col items-center gap-2 px-4 py-8">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loading}
            className="h-9 rounded-full border border-border px-5 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-60"
          >
            {loading ? "Loading" : "Show more"}
          </button>
          {failed ? <p className="text-sm text-destructive">Couldn&apos;t load more posts. Try again.</p> : null}
        </div>
      ) : items.length > 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
      ) : null}
    </div>
  )
}
