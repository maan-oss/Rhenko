import { Suspense } from "react"
import { redirect } from "next/navigation"
import { Bookmark, Folder, Inbox } from "lucide-react"
import { requireViewer } from "@/lib/auth"
import { bookmarkFolders } from "@/lib/data"
import { feedFor, type FeedSpec } from "@/lib/feeds"
import { firstParam } from "@/lib/params"
import { FeedList } from "@/components/app/feed-list"
import { FolderManager } from "@/components/app/folder-manager"
import { PageHeader } from "@/components/app/page-header"
import { TabLinks } from "@/components/app/tabs"

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
    { href: "/bookmarks", label: "All", icon: <Bookmark />, active: folder === undefined },
    { href: "/bookmarks?folder=none", label: "Unfiled", icon: <Inbox />, active: folder === "none" },
    ...folders.map((f) => ({ href: `/bookmarks?folder=${f.id}`, label: f.name, icon: <Folder />, active: folder === f.id })),
  ]

  return (
    <>
      <PageHeader title="Bookmarks" actions={<FolderManager folders={folders} />} />
      <div className="px-4 pt-3">
        <TabLinks items={tabs} />
      </div>
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
