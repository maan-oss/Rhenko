"use client"

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { BlurFade } from "@/components/ui/blur-fade"
import { EmptyState } from "@/components/app/empty-state"
import { MoveBookmark } from "@/components/app/move-bookmark"
import { PostCard } from "@/components/app/post-card"
import { isAdItem, type FeedEntry } from "@/lib/ad-rules"
import { AdCard } from "@/components/app/ad-card"
import type { FeedSpec } from "@/lib/feeds"
import type { Viewer } from "@/lib/auth"

// How many items a feed draws without the entrance fade: enough to fill a phone's first screen.
const FIRST_SCREEN = 3

// The post a feed entry shows, or null for an ad.
function postIdOf(item: FeedEntry): string | null {
  return isAdItem(item) ? null : item.post.id
}

// A server refresh brings a new first page. The pages a reader already loaded below it stay, so a refresh does not send
// them back to the top. The new page is kept whole, and the loaded items after the last one the two share follow it.
function mergeFirstPage(
  loaded: FeedEntry[],
  loadedNext: string | null,
  page: FeedEntry[],
  pageNext: string | null
): { items: FeedEntry[]; next: string | null } {
  const position = new Map(loaded.map((item, index) => [item.key, index]))
  let meet = -1
  for (const item of page) meet = Math.max(meet, position.get(item.key) ?? -1)
  // No shared item means the loaded pages are no longer next to the new page, so the new page stands alone.
  if (meet < 0 || meet === loaded.length - 1) return { items: page, next: pageNext }
  return { items: [...page, ...loaded.slice(meet + 1)], next: loadedNext }
}

type Props = {
  items: FeedEntry[]
  next?: string | null
  spec?: FeedSpec
  viewer: Viewer
  emptyTitle: string
  emptyBody: string
  // What to offer when the list is empty: a button, a link, a short list of people.
  emptyAction?: ReactNode
  folders?: { id: string; name: string }[]
  // The post these items are replies to. Its replies are drawn as one conversation, joined by a thread line.
  threadOf?: string
}

// Renders a feed and loads older pages as the reader reaches the end.
export function FeedList({ items: initialItems, next: initialNext = null, spec, viewer, emptyTitle, emptyBody, emptyAction, folders, threadOf }: Props) {
  const router = useRouter()
  const [items, setItems] = useState(initialItems)
  const [next, setNext] = useState<string | null>(initialNext)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  // Posts from people the reader follows that arrived since the page was drawn. Only the Following tab counts them.
  const [fresh, setFresh] = useState<string[]>([])
  const sentinel = useRef<HTMLDivElement>(null)
  const busy = useRef(false)
  const following = spec?.kind === "home" && spec.mode === "following"

  // A server refresh (a new post, a notification, a like) brings a new first page. The pages already loaded stay.
  const [seed, setSeed] = useState(initialItems)
  if (seed !== initialItems) {
    setSeed(initialItems)
    const merged = mergeFirstPage(items, next, initialItems, initialNext)
    setItems(merged.items)
    setNext(merged.next)
    const shown = new Set(initialItems.map(postIdOf))
    setFresh((current) => current.filter((id) => !shown.has(id)))
  }

  // A post the reader marked "Not interested" leaves the For you feed at once. The server keeps it out from then on.
  const forYou = spec?.kind === "home" && spec.mode === "for-you"
  useEffect(() => {
    if (!forYou) return
    const onHidden = (event: Event) => {
      const { postId } = (event as CustomEvent<{ postId: string }>).detail
      setItems((current) => current.filter((item) => postIdOf(item) !== postId))
    }
    window.addEventListener("rhenko:hidden", onHidden)
    return () => window.removeEventListener("rhenko:hidden", onHidden)
  }, [forYou])

  useEffect(() => {
    if (!following) return
    const onPost = (event: Event) => {
      const { postId } = (event as CustomEvent<{ postId: string }>).detail
      setFresh((current) => (current.includes(postId) ? current : [...current, postId]))
    }
    window.addEventListener("rhenko:posts", onPost)
    return () => window.removeEventListener("rhenko:posts", onPost)
  }, [following])

  // Loads the first page again. The new posts come in above what the reader has, and the pill clears once they do.
  const showFresh = () => {
    window.scrollTo({ top: 0, behavior: "smooth" })
    router.refresh()
  }

  const pill =
    fresh.length > 0 ? (
      <div className="sticky top-14 z-10 flex justify-center py-2">
        <button
          type="button"
          onClick={showFresh}
          className="metal h-9 rounded-full px-4 text-sm font-semibold transition-opacity hover:opacity-90"
        >
          {fresh.length === 1 ? "1 new post" : `${fresh.length} new posts`}
        </button>
      </div>
    ) : null

  const loadMore = useCallback(async () => {
    if (!next || !spec || busy.current) return
    busy.current = true
    setLoading(true)
    setFailed(false)
    try {
      const url = `/api/feed?spec=${encodeURIComponent(JSON.stringify(spec))}&cursor=${encodeURIComponent(next)}`
      const response = await fetch(url, { headers: { Accept: "application/json" } })
      if (!response.ok) throw new Error("Could not load")
      const page = (await response.json()) as { items: FeedEntry[]; next: string | null }
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
      <>
        {pill}
        <EmptyState title={emptyTitle} body={emptyBody}>
          {emptyAction}
        </EmptyState>
      </>
    )
  }

  return (
    <div>
      {pill}
      {items.map((item, index) => {
        const body = isAdItem(item) ? (
          <AdCard ad={item.ad} />
        ) : (
          <>
            <PostCard
              post={item.post}
              viewer={viewer}
              repostedBy={item.repostedBy}
              threadOf={threadOf}
              threadLine={threadOf !== undefined && index < items.length - 1}
            />
            {folders ? <MoveBookmark postId={item.post.id} folderId={item.folderId} folders={folders} /> : null}
          </>
        )
        // The first posts are the first screen. They are drawn with the page. A fade on them would start hidden in the
        // HTML and wait for the script to run, which delays the moment the page has something to show.
        if (index < FIRST_SCREEN) return <Fragment key={item.key}>{body}</Fragment>
        return (
          <BlurFade key={item.key} delay={Math.min(index, 6) * 0.03}>
            {body}
          </BlurFade>
        )
      })}
      {next ? (
        <div ref={sentinel} className="flex flex-col items-center gap-2 px-4 py-8">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loading}
            className="h-10 rounded-full border border-border px-5 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-60"
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
