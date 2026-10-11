import { Suspense } from "react"
import { requireViewer } from "@/lib/auth"
import { bookmarkFeed } from "@/lib/data"
import { firstParam } from "@/lib/params"
import { PageHeader } from "@/components/app/page-header"
import { FeedList, MoreLink } from "@/components/app/feed-list"

type SearchParams = Promise<{ before?: string | string[] }>

export default function BookmarksPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={null}>
      <BookmarksBody searchParams={searchParams} />
    </Suspense>
  )
}

async function BookmarksBody({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireViewer()
  const params = await searchParams
  const page = bookmarkFeed(viewer.id, firstParam(params.before))
  return (
    <>
      <PageHeader title="Bookmarks" />
      <FeedList
        items={page.items}
        viewer={viewer}
        emptyTitle="No bookmarks yet"
        emptyBody="Bookmark a post to keep it here. Only you can see this list."
      />
      <MoreLink href={page.next ? `/bookmarks?before=${encodeURIComponent(page.next)}` : null} />
    </>
  )
}
