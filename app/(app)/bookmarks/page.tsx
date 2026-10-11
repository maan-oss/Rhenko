import { Suspense } from "react"
import { redirect } from "next/navigation"
import { requireViewer } from "@/lib/auth"
import { bookmarkFolders } from "@/lib/data"
import { feedFor, type FeedSpec } from "@/lib/feeds"
import { firstParam } from "@/lib/params"
import { FeedList } from "@/components/app/feed-list"
import { FolderManager } from "@/components/app/folder-manager"
import { PageHeader } from "@/components/app/page-header"
import { ScrollTabs } from "@/components/app/scroll-tabs"

type SearchParams = Promise<{ folder?: string | string[] }>

export default function BookmarksPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={null}>
      <BookmarksBody searchParams={searchParams} />
    </Suspense>
  )
}

async function BookmarksBody({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireViewer()
  const folders = bookmarkFolders(viewer.id)
  const folder = firstParam((await searchParams).folder)
  if (folder !== undefined && folder !== "none" && !folders.some((f) => f.id === folder)) redirect("/bookmarks")

  const spec: FeedSpec = folder === undefined ? { kind: "bookmarks" } : { kind: "bookmarks", folder }
  const page = feedFor(spec, viewer.id)

  const tabs = [
    { href: "/bookmarks", label: "All", active: folder === undefined },
    { href: "/bookmarks?folder=none", label: "Unfiled", active: folder === "none" },
    ...folders.map((f) => ({ href: `/bookmarks?folder=${f.id}`, label: f.name, active: folder === f.id })),
  ]

  return (
    <>
      <PageHeader title="Bookmarks" actions={<FolderManager folders={folders} />} />
      <ScrollTabs items={tabs} />
      <FeedList
        key={folder ?? "all"}
        items={page.items}
        next={page.next}
        spec={spec}
        viewer={viewer}
        folders={folders.length > 0 ? folders : undefined}
        emptyTitle="Nothing saved here"
        emptyBody="Bookmark a post with the bookmark button, and it lands here. Only you can see your bookmarks."
      />
    </>
  )
}
